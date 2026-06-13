import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db, { hasAllRequiredPhotos } from '../db.js';
import { authMiddleware, requireRole, requireBizAdmin } from '../middleware.js';
import {
  notifyTaskAssigned, notifyTaskCompleted, notifyOverdue, notifyCvRejected, notifyTaskCancelled,
} from '../push.js';
import { validateTaskPhotos, PHOTO_TYPE_LABELS } from '../cv/validatePhotos.js';
import { dispatchWebhooks } from '../integration/webhooks.js';
import { formatTask, TASK_SELECT_INTEGRATION } from '../integration/schemas.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { STATUS_LABELS, normalizeStatus } from '../constants.js';
import { isExecutor } from '../roles.js';
import { readExcelRows, writeExcelBuffer, pickColumn, parseDate } from '../utils/excelImport.js';
import { recalculateUserRating } from '../utils/rating.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');

const router = Router();

const TASK_SELECT = `
  SELECT t.*,
    a.serial_number,
    COALESCE(a.territorial_bank, a.bank_name) as territorial_bank,
    COALESCE(a.gosb, a.zone) as gosb,
    a.address, a.accessibility_type, a.installation_name,
    a.bank_name, a.zone,
    u.full_name as assignee_name,
    u.rating as assignee_rating,
    (SELECT COUNT(*) FROM task_photos tp WHERE tp.task_id = t.id) as photo_count
  FROM cleaning_tasks t
  JOIN atms a ON a.id = t.atm_id
  LEFT JOIN users u ON u.id = t.assigned_to
`;

const PRIORITY_MAP = {
  'низкий': 'low', 'low': 'low',
  'обычный': 'normal', 'normal': 'normal',
  'высокий': 'high', 'high': 'high',
};

function permanentlyDeleteTask(taskId) {
  const full = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(taskId);
  if (!full) return null;

  const photos = db.prepare('SELECT filename FROM task_photos WHERE task_id = ?').all(taskId);
  const taskDir = path.join(uploadsDir, String(taskId));

  for (const photo of photos) {
    const filePath = path.join(taskDir, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  if (fs.existsSync(taskDir)) {
    try { fs.rmdirSync(taskDir); } catch { fs.rmSync(taskDir, { recursive: true, force: true }); }
  }

  db.prepare('DELETE FROM cleaning_tasks WHERE id = ?').run(taskId);
  return full;
}

function findDevice(deviceId) {
  return db.prepare('SELECT id FROM atms WHERE serial_number = ? AND active = 1').get(String(deviceId).trim());
}

function findExecutor(val) {
  if (!val) return null;
  const s = String(val).trim();
  let u = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'executor' AND active = 1").get(s);
  if (!u) u = db.prepare("SELECT id FROM users WHERE full_name = ? AND role = 'executor' AND active = 1").get(s);
  if (!u) u = db.prepare("SELECT id FROM users WHERE employee_number = ? AND role = 'executor' AND active = 1").get(s);
  return u?.id || null;
}

function getManagerIds() {
  return db.prepare("SELECT id FROM users WHERE role IN ('bizadmin','admin','supervisor') AND active = 1")
    .all().map((u) => u.id);
}

function applyTaskFilters(query, sql, params, user) {
  const q = query;
  if (q.task_id) { sql += ' AND t.id = ?'; params.push(q.task_id); }
  if (q.serial_number) { sql += ' AND a.serial_number LIKE ?'; params.push(`%${q.serial_number}%`); }
  if (q.status) { sql += ' AND t.status = ?'; params.push(normalizeStatus(q.status) || q.status); }
  if (q.accessibility_type) { sql += ' AND a.accessibility_type = ?'; params.push(q.accessibility_type); }
  if (q.territorial_bank) { sql += ' AND COALESCE(a.territorial_bank, a.bank_name) = ?'; params.push(q.territorial_bank); }
  if (q.gosb) { sql += ' AND COALESCE(a.gosb, a.zone) = ?'; params.push(q.gosb); }
  if (q.installation_name) { sql += ' AND a.installation_name LIKE ?'; params.push(`%${q.installation_name}%`); }
  if (q.address) { sql += ' AND a.address LIKE ?'; params.push(`%${q.address}%`); }
  if (q.scheduled_from) { sql += ' AND t.scheduled_date >= ?'; params.push(q.scheduled_from); }
  if (q.scheduled_to) { sql += ' AND t.scheduled_date <= ?'; params.push(q.scheduled_to); }
  if (q.deadline_from) { sql += ' AND t.deadline_date >= ?'; params.push(q.deadline_from); }
  if (q.deadline_to) { sql += ' AND t.deadline_date <= ?'; params.push(q.deadline_to); }
  if (q.completed_from) { sql += ' AND date(t.completed_at) >= ?'; params.push(q.completed_from); }
  if (q.completed_to) { sql += ' AND date(t.completed_at) <= ?'; params.push(q.completed_to); }
  if (q.date) { sql += ' AND t.scheduled_date = ?'; params.push(q.date); }
  if (q.assigned_to && user && !isExecutor(user)) {
    sql += ' AND t.assigned_to = ?';
    params.push(q.assigned_to);
  }
  return { sql, params };
}

router.use(authMiddleware);

let lastOverdueNotify = 0;

function markOverdue() {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    UPDATE cleaning_tasks
    SET status = 'overdue'
    WHERE COALESCE(deadline_date, scheduled_date) < ? AND status IN ('new', 'in_progress', 'emergency')
  `).run(today);

  if (result.changes > 0 && Date.now() - lastOverdueNotify > 3600000) {
    lastOverdueNotify = Date.now();
    notifyOverdue(result.changes, getManagerIds());
  }
}

router.get('/', (req, res) => {
  markOverdue();

  let sql = TASK_SELECT + ' WHERE 1=1';
  const params = [];

  if (isExecutor(req.user)) {
    sql += " AND (t.assigned_to = ? OR (t.assigned_to IS NULL AND t.status = 'new'))";
    params.push(req.user.id);
  }

  const built = applyTaskFilters(req.query, sql, params, req.user);
  built.sql += ' ORDER BY t.scheduled_date DESC, t.id DESC';
  res.json(db.prepare(built.sql).all(...built.params));
});

router.get('/stats', requireRole('admin', 'supervisor'), (req, res) => {
  markOverdue();
  const today = new Date().toISOString().slice(0, 10);

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'new' AND scheduled_date = ? THEN 1 ELSE 0 END) as today_pending,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' AND scheduled_date = ? THEN 1 ELSE 0 END) as today_completed,
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
      COUNT(*) as total
    FROM cleaning_tasks
    WHERE status != 'cancelled'
  `).get(today, today);

  const byExecutor = db.prepare(`
    SELECT u.full_name, u.id, u.rating,
      SUM(CASE WHEN t.status = 'completed' AND t.scheduled_date = ? THEN 1 ELSE 0 END) as completed_today,
      SUM(CASE WHEN t.status = 'overdue' THEN 1 ELSE 0 END) as overdue
    FROM users u
    LEFT JOIN cleaning_tasks t ON t.assigned_to = u.id AND t.status != 'cancelled'
    WHERE u.role = 'executor' AND u.active = 1
    GROUP BY u.id
    ORDER BY u.rating DESC, u.full_name
  `).all(today);

  res.json({ ...stats, byCleaner: byExecutor, byExecutor });
});

router.get('/export', requireRole('admin', 'supervisor'), (req, res) => {
  markOverdue();
  const built = applyTaskFilters(req.query, `
    SELECT t.id, t.status, t.scheduled_date, t.deadline_date, t.started_at, t.completed_at,
      t.service_contract, t.closed_device, t.closed_os, t.closed_latitude, t.closed_longitude,
      a.serial_number,
      a.accessibility_type,
      COALESCE(a.territorial_bank, a.bank_name) as territorial_bank,
      COALESCE(a.gosb, a.zone) as gosb,
      a.address, a.installation_name, u.full_name as assignee
    FROM cleaning_tasks t
    JOIN atms a ON a.id = t.atm_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.status != 'cancelled'
  `, [], req.user);

  built.sql += ' ORDER BY t.scheduled_date DESC, t.id';
  const rows = db.prepare(built.sql).all(...built.params);

  const data = rows.map((r) => ({
    '№ заявки': r.id,
    'ID УС': r.serial_number || '',
    'Статус': STATUS_LABELS[r.status] || r.status,
    'Вид доступности': r.accessibility_type || '',
    'Территориальный Банк': r.territorial_bank || '',
    'ГОСБ': r.gosb || '',
    'Адрес места установки': r.address || '',
    'Наименование места установки': r.installation_name || '',
    'Плановая дата проведения работ': r.scheduled_date || '',
    'Контрольный срок': r.deadline_date || '',
    'Фактическая дата начала работ': r.started_at || '',
    'Фактическая дата завершения работ': r.completed_at || '',
    'Услуга по договору': r.service_contract || '',
    'Исполнитель': r.assignee || '',
    'Устройство закрытия': r.closed_device || '',
    'ОС закрытия': r.closed_os || '',
    'Широта': r.closed_latitude ?? '',
    'Долгота': r.closed_longitude ?? '',
  }));

  const buf = writeExcelBuffer(data, 'Заявки');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="otchet-zayavki-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

router.get('/import-template', requireRole('admin', 'supervisor'), (_req, res) => {
  const buf = writeExcelBuffer([
    {
      'ID УС': 'US-001',
      'Плановая дата': '2026-06-10',
      'Контрольный срок': '2026-06-12',
      'Email исполнителя': 'cleaner1@bank.ru',
      'Услуга по договору': 'Уборка УС',
      'Примечание': 'Плановая заявка',
    },
  ], 'Заявки');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="shablon-zayavki.xlsx"');
  res.send(buf);
});

router.post('/import', requireRole('admin', 'supervisor'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Загрузите Excel-файл (.xlsx)' });

  let rows;
  try { rows = readExcelRows(req.file.buffer); } catch {
    return res.status(400).json({ error: 'Не удалось прочитать файл Excel' });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'Файл пуст' });

  const insert = db.prepare(`
    INSERT INTO cleaning_tasks (atm_id, assigned_to, scheduled_date, deadline_date, service_contract, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const created = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const deviceId = pickColumn(row, 'ID УС', 'id ус', 'Банкомат', 'банкомат');
    const scheduledDate = parseDate(pickColumn(row, 'Плановая дата', 'Дата', 'дата'));
    const deadlineDate = parseDate(pickColumn(row, 'Контрольный срок', 'контрольный срок'));
    const executor = pickColumn(row, 'Email исполнителя', 'Исполнитель', 'исполнитель', 'Email уборщика');
    const serviceContract = pickColumn(row, 'Услуга по договору', 'услуга по договору');
    const notes = pickColumn(row, 'Примечание', 'примечание');

    if (!deviceId || !scheduledDate) {
      errors.push({ line, error: 'Укажите ID УС и плановую дату' });
      return;
    }

    const atm = findDevice(deviceId);
    if (!atm) {
      errors.push({ line, error: `Устройство «${deviceId}» не найдено` });
      return;
    }

    const assignedTo = findExecutor(executor);
    if (executor && !assignedTo) {
      errors.push({ line, error: `Исполнитель «${executor}» не найден` });
      return;
    }

    try {
      const result = insert.run(atm.id, assignedTo, scheduledDate, deadlineDate, serviceContract || null, notes || null, req.user.id);
      const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(result.lastInsertRowid);
      if (assignedTo) notifyTaskAssigned(task, assignedTo);
      created.push({ line, id: task.id });
    } catch (e) {
      errors.push({ line, error: e.message });
    }
  });

  res.json({ total: rows.length, created: created.length, failed: errors.length, tasks: created, errors });
});

router.post('/', requireRole('admin', 'supervisor'), (req, res) => {
  const { atm_id, assigned_to, scheduled_date, deadline_date, service_contract, notes, priority } = req.body;
  if (!atm_id || !scheduled_date) {
    return res.status(400).json({ error: 'Укажите устройство и плановую дату' });
  }

  const result = db.prepare(`
    INSERT INTO cleaning_tasks (atm_id, assigned_to, scheduled_date, deadline_date, service_contract, priority, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    atm_id,
    assigned_to || null,
    scheduled_date,
    deadline_date || null,
    service_contract || null,
    priority || 'normal',
    notes || null,
    req.user.id,
  );

  const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(result.lastInsertRowid);
  if (assigned_to) notifyTaskAssigned(task, assigned_to);
  const full = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(result.lastInsertRowid);
  dispatchWebhooks('task.created', formatTask(full));
  res.status(201).json(task);
});

router.patch('/:id', asyncHandler(async (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });

  const executor = isExecutor(req.user);
  const {
    status, report, notes, assigned_to, scheduled_date, priority,
    deadline_date, service_contract, assign_self,
    closed_device, closed_os, closed_latitude, closed_longitude,
  } = req.body;

  if (executor && task.assigned_to && task.assigned_to !== req.user.id && !assign_self) {
    return res.status(403).json({ error: 'Заявка назначена другому сотруднику' });
  }

  const updates = [];
  const params = [];

  if (assign_self && executor) {
    if (task.status !== 'new' || task.assigned_to) {
      return res.status(400).json({ error: 'Можно взять только новую нераспределённую заявку' });
    }
    updates.push('assigned_to = ?', 'status = ?', "started_at = datetime('now')");
    params.push(req.user.id, 'in_progress');
  }

  if (!executor) {
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
    if (scheduled_date !== undefined) { updates.push('scheduled_date = ?'); params.push(scheduled_date); }
    if (deadline_date !== undefined) { updates.push('deadline_date = ?'); params.push(deadline_date); }
    if (service_contract !== undefined) { updates.push('service_contract = ?'); params.push(service_contract); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  }

  if (status) {
    const nextStatus = normalizeStatus(status) || status;
    if (nextStatus === 'completed' && executor && !hasAllRequiredPhotos(req.params.id)) {
      return res.status(400).json({ error: 'Прикрепите обязательные фото: Слева, Справа и Спереди' });
    }

    if (nextStatus === 'completed' && executor) {
      const cv = await validateTaskPhotos(req.params.id);
      if (!cv.ok) {
        if (cv.pending?.length) {
          return res.status(503).json({
            error: 'CV-проверка фото ещё не завершена. Дождитесь результата на всех снимках и повторите.',
            code: 'cv_pending',
            pending_photos: cv.pending,
          });
        }

        db.prepare(`
          UPDATE cleaning_tasks
          SET status = 'in_progress', completed_at = NULL, updated_at = datetime('now')
          WHERE id = ?
        `).run(req.params.id);

        const labels = cv.failed.map((f) => f.label || PHOTO_TYPE_LABELS[f.photo_type]).join(', ');
        notifyCvRejected(task, req.user.id, labels);

        return res.status(400).json({
          error: `Банкомат не обнаружен на фото: ${labels}. Заявка возвращена в работу — переснимите фото.`,
          code: 'cv_rejected',
          failed_photos: cv.failed,
          status: 'in_progress',
        });
      }
    }

    updates.push('status = ?');
    params.push(nextStatus);
    if (nextStatus === 'in_progress' && !task.started_at) {
      updates.push("started_at = datetime('now')");
    }
    if (nextStatus === 'completed') {
      updates.push("completed_at = datetime('now')");
      const ua = (req.headers['user-agent'] || '').slice(0, 160);
      updates.push('closed_device = ?', 'closed_os = ?', 'closed_latitude = ?', 'closed_longitude = ?');
      params.push(
        closed_device ?? (ua || null),
        closed_os ?? null,
        closed_latitude ?? null,
        closed_longitude ?? null,
      );
    }
  }

  if (report !== undefined) { updates.push('report = ?'); params.push(report); }
  if (executor && notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  updates.push("updated_at = datetime('now')");
  const prevAssigned = task.assigned_to;
  params.push(req.params.id);
  db.prepare(`UPDATE cleaning_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(req.params.id);

  if ((!executor && assigned_to !== undefined && assigned_to !== prevAssigned && assigned_to)
    || (assign_self && executor)) {
    notifyTaskAssigned(updated, updated.assigned_to);
  }
  if (status === 'completed' || normalizeStatus(status) === 'completed') {
    notifyTaskCompleted(updated, getManagerIds());
    if (updated.assigned_to) recalculateUserRating(updated.assigned_to);
  }
  if (normalizeStatus(status) === 'returned' && updated.assigned_to) {
    recalculateUserRating(updated.assigned_to);
  }

  const full = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(req.params.id);
  const norm = normalizeStatus(status);
  const event = norm === 'completed' ? 'task.completed'
    : norm === 'cancelled' ? 'task.cancelled' : 'task.updated';
  dispatchWebhooks(event, formatTask(full));

  res.json(updated);
}));

router.delete('/:id/permanent', requireBizAdmin, (req, res) => {
  const full = permanentlyDeleteTask(req.params.id);
  if (!full) return res.status(404).json({ error: 'Заявка не найдена' });
  dispatchWebhooks('task.deleted', formatTask(full));
  res.json({ ok: true, deleted: true });
});

router.delete('/:id', requireRole('admin', 'supervisor'), (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });

  db.prepare("UPDATE cleaning_tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  const full = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(req.params.id);
  const updated = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(req.params.id);
  if (task.assigned_to) notifyTaskCancelled(updated, task.assigned_to);
  dispatchWebhooks('task.cancelled', formatTask(full));
  res.json({ ok: true });
});

export default router;
