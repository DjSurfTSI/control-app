import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware.js';
import { isBizAdmin, ROLES } from '../roles.js';
import { normalizeRole } from '../constants.js';
import { readExcelRows, writeExcelBuffer, pickColumn } from '../utils/excelImport.js';
import { recalculateUserRating } from '../utils/rating.js';
import {
  attachCustomFields,
  extractCustomFieldsFromBody,
  serializeCustomData,
  parseCustomData,
} from '../utils/entityFields.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = Router();
const MANAGERS = [ROLES.ADMIN, ROLES.SUPERVISOR];
const VALID_ROLES = [ROLES.BIZADMIN, ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.EXECUTOR];

router.use(authMiddleware);

function getTargetUser(id) {
  const row = db.prepare(`
    SELECT id, email, full_name, role, phone, active, created_at,
      territorial_bank, position, employee_number, rating, custom_data
    FROM users WHERE id = ?
  `).get(id);
  return attachCustomFields(row);
}

function assignableRoles(actor) {
  if (isBizAdmin(actor)) return VALID_ROLES;
  if (actor.role === ROLES.ADMIN) return [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.EXECUTOR];
  return [ROLES.EXECUTOR];
}

function canManageUser(actor, target) {
  if (isBizAdmin(actor)) return true;
  if (actor.role === ROLES.ADMIN) return target?.role !== ROLES.BIZADMIN;
  if (actor.role === ROLES.SUPERVISOR && target?.role === ROLES.EXECUTOR) return true;
  return false;
}

router.get('/', requireRole(...MANAGERS), (req, res) => {
  const { role } = req.query;
  let sql = `
    SELECT id, email, full_name, role, phone, active, created_at,
      territorial_bank, position, employee_number, rating
    FROM users WHERE 1=1
  `;
  const params = [];

  if (req.user.role === ROLES.SUPERVISOR) {
    sql += " AND role = 'executor'";
  } else if (role) {
    sql += ' AND role = ?';
    params.push(role === 'cleaner' ? 'executor' : role);
  }

  sql += ' ORDER BY full_name';
  res.json(db.prepare(sql).all(...params).map((row) => attachCustomFields(row)));
});

router.get('/import-template', requireRole(...MANAGERS), (_req, res) => {
  const buf = writeExcelBuffer([
    {
      'ФИО': 'Иванов Иван Иванович',
      'Email': 'ivanov@bank.ru',
      'Телефон': '+7 900 000-00-00',
      'Территориальный Банк': 'Московский банк',
      'Должность': 'Исполнитель',
      'Табельный номер': '123456',
      'Роль': 'Исполнитель',
      'Пароль': 'password123',
    },
  ], 'Сотрудники');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="shablon-sotrudniki.xlsx"');
  res.send(buf);
});

router.post('/import', requireRole(...MANAGERS), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Загрузите Excel-файл (.xlsx)' });

  let rows;
  try {
    rows = readExcelRows(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'Не удалось прочитать файл Excel' });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'Файл пуст' });

  const insert = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role, phone, territorial_bank, position, employee_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const created = [];
  const errors = [];
  const allowed = assignableRoles(req.user);

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const fullName = pickColumn(row, 'ФИО', 'фио');
    const email = pickColumn(row, 'Email', 'email');
    const phone = pickColumn(row, 'Телефон', 'телефон');
    const territorialBank = pickColumn(row, 'Территориальный Банк', 'территориальный банк');
    const position = pickColumn(row, 'Должность', 'должность');
    const employeeNumber = pickColumn(row, 'Табельный номер', 'табельный номер');
    const roleRaw = pickColumn(row, 'Роль', 'роль');
    const password = pickColumn(row, 'Пароль', 'пароль');

    if (!fullName || !email || !phone || !territorialBank || !position || !employeeNumber || !roleRaw || !password) {
      errors.push({ line, error: 'Заполните все обязательные поля' });
      return;
    }

    const userRole = req.user.role === ROLES.SUPERVISOR ? ROLES.EXECUTOR : (normalizeRole(roleRaw) || ROLES.EXECUTOR);
    if (!allowed.includes(userRole)) {
      errors.push({ line, error: `Недостаточно прав для роли «${roleRaw}»` });
      return;
    }

    try {
      const result = insert.run(
        String(email).trim(),
        bcrypt.hashSync(String(password), 10),
        fullName,
        userRole,
        phone,
        territorialBank,
        position,
        employeeNumber,
      );
      recalculateUserRating(result.lastInsertRowid);
      created.push({ line, id: result.lastInsertRowid, full_name: fullName });
    } catch (e) {
      errors.push({ line, error: e.message.includes('UNIQUE') ? `Email «${email}» уже используется` : e.message });
    }
  });

  res.json({ total: rows.length, created: created.length, failed: errors.length, users: created, errors });
});

router.post('/', requireRole(...MANAGERS), (req, res) => {
  const {
    email, password, full_name, role, phone,
    territorial_bank, position, employee_number,
  } = req.body;
  if (!email || !password || !full_name || !phone || !territorial_bank || !position || !employee_number) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }

  const allowed = assignableRoles(req.user);
  const userRole = req.user.role === ROLES.SUPERVISOR
    ? ROLES.EXECUTOR
    : (normalizeRole(role) || ROLES.EXECUTOR);
  if (!allowed.includes(userRole)) {
    return res.status(403).json({ error: 'Недостаточно прав для назначения этой роли' });
  }

  try {
    const customFields = extractCustomFieldsFromBody(req.body, 'users');
    const custom_data = serializeCustomData(customFields);
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, full_name, role, phone, territorial_bank, position, employee_number, custom_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(email, bcrypt.hashSync(password, 10), full_name, userRole, phone, territorial_bank, position, employee_number, custom_data);

    recalculateUserRating(result.lastInsertRowid);
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
  if (!target) return res.status(404).json({ error: 'Сотрудник не найден' });
  if (!canManageUser(req.user, target)) {
    return res.status(403).json({ error: 'Недостаточно прав для изменения этой учётной записи' });
  }

  const { full_name, role, phone, active, password, territorial_bank, position, employee_number } = req.body;
  const updates = [];
  const params = [];

  if (full_name !== undefined) { updates.push('full_name = ?'); params.push(full_name); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (territorial_bank !== undefined) { updates.push('territorial_bank = ?'); params.push(territorial_bank); }
  if (position !== undefined) { updates.push('position = ?'); params.push(position); }
  if (employee_number !== undefined) { updates.push('employee_number = ?'); params.push(employee_number); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }

  if (role !== undefined) {
    if (req.user.role === ROLES.SUPERVISOR) {
      return res.status(403).json({ error: 'Супервайзер не может менять роль' });
    }
    const nextRole = normalizeRole(role) || role;
    if (!assignableRoles(req.user).includes(nextRole)) {
      return res.status(403).json({ error: 'Недостаточно прав для назначения этой роли' });
    }
    updates.push('role = ?');
    params.push(nextRole);
  }

  if (req.body.custom_fields !== undefined) {
    const existing = parseCustomData(target.custom_data);
    const merged = { ...existing, ...extractCustomFieldsFromBody(req.body, 'users') };
    updates.push('custom_data = ?');
    params.push(serializeCustomData(merged));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  params.push(req.params.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  recalculateUserRating(req.params.id);
  res.json(getTargetUser(req.params.id));
});

router.delete('/:id', requireRole(...MANAGERS), (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'Сотрудник не найден' });
  if (!canManageUser(req.user, target)) {
    return res.status(403).json({ error: 'Недостаточно прав для удаления этой учётной записи' });
  }
  if (target.id === req.user.id) {
    return res.status(400).json({ error: 'Нельзя удалить свою учётную запись' });
  }

  const activeTasks = db.prepare(`
    SELECT COUNT(*) as c FROM cleaning_tasks
    WHERE assigned_to = ? AND status NOT IN ('completed', 'cancelled')
  `).get(target.id).c;

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
