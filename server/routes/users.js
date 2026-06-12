import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware.js';
import { isBizAdmin, ROLES } from '../roles.js';

const router = Router();
const MANAGERS = [ROLES.ADMIN, ROLES.SUPERVISOR];
const VALID_ROLES = [ROLES.BIZADMIN, ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.CLEANER];

router.use(authMiddleware);

function getTargetUser(id) {
  return db.prepare('SELECT id, email, full_name, role, phone, active, created_at FROM users WHERE id = ?').get(id);
}

function assignableRoles(actor) {
  if (isBizAdmin(actor)) return VALID_ROLES;
  if (actor.role === ROLES.ADMIN) return [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.CLEANER];
  return [ROLES.CLEANER];
}

function canManageUser(actor, target) {
  if (isBizAdmin(actor)) return true;
  if (actor.role === ROLES.ADMIN) return target?.role !== ROLES.BIZADMIN;
  if (actor.role === ROLES.SUPERVISOR && target?.role === ROLES.CLEANER) return true;
  return false;
}

router.get('/', requireRole(...MANAGERS), (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT id, email, full_name, role, phone, active, created_at FROM users WHERE 1=1';
  const params = [];

  if (req.user.role === ROLES.SUPERVISOR) {
    sql += " AND role = 'cleaner'";
  } else if (role) {
    sql += ' AND role = ?';
    params.push(role);
  }

  sql += ' ORDER BY full_name';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', requireRole(...MANAGERS), (req, res) => {
  const { email, password, full_name, role, phone } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  const allowed = assignableRoles(req.user);
  const userRole = req.user.role === ROLES.SUPERVISOR ? ROLES.CLEANER : (role || ROLES.CLEANER);
  if (!allowed.includes(userRole)) {
    return res.status(403).json({ error: 'Недостаточно прав для назначения этой роли' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?)'
    ).run(email, bcrypt.hashSync(password, 10), full_name, userRole, phone || null);

    res.status(201).json(getTargetUser(result.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email уже используется' });
    }
    throw e;
  }
});

router.patch('/:id', requireRole(...MANAGERS), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!canManageUser(req.user, target)) {
    return res.status(403).json({ error: 'Недостаточно прав для изменения этой учётной записи' });
  }

  const { full_name, role, phone, active, password } = req.body;
  const updates = [];
  const params = [];

  if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }

  if (role !== undefined) {
    if (req.user.role === ROLES.SUPERVISOR) {
      return res.status(403).json({ error: 'Супервайзер не может менять роль' });
    }
    if (!assignableRoles(req.user).includes(role)) {
      return res.status(403).json({ error: 'Недостаточно прав для назначения этой роли' });
    }
    updates.push('role = ?');
    params.push(role);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(getTargetUser(req.params.id));
});

router.delete('/:id', requireRole(...MANAGERS), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!canManageUser(req.user, target)) {
    return res.status(403).json({ error: 'Недостаточно прав для удаления этой учётной записи' });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя удалить свою учётную запись' });
  }

  const activeTasks = db.prepare(
    "SELECT COUNT(*) as c FROM cleaning_tasks WHERE assigned_to = ? AND status NOT IN ('completed', 'cancelled')"
  ).get(target.id).c;

  if (activeTasks > 0) {
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(target.id);
    return res.json({ ok: true, deactivated: true, message: 'Учётная запись деактивирована (есть активные заявки)' });
  }

  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(target.id);
  db.prepare('UPDATE cleaning_tasks SET assigned_to = NULL WHERE assigned_to = ?').run(target.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true, deleted: true });
});

export default router;
