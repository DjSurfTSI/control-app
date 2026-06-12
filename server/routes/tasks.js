import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import db, { hasAllRequiredPhotos } from '../db.js';
import { authMiddleware, requireRole } from '../middleware.js';
import { notifyTaskAssigned, notifyTaskCompleted, notifyOverdue } from '../push.js';
import { dispatchWebhooks } from '../integration/webhooks.js';
import { formatTask, TASK_SELECT_INTEGRATION } from '../integration/schemas.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

const TASK_SELECT = `
  SELECT t.*,
    a.serial_number, a.bank_name, a.address, a.zone,
    u.full_name as assignee_name,
    (SELECT COUNT(*) FROM task_photos tp WHERE tp.task_id = t.id) as photo_count
  FROM cleaning_tasks t
  JOIN atms a ON a.id = t.atm_id
  LEFT JOIN users u ON u.id = t.assigned_to
`;

const STATUS_RU = {
  pending: 'Ожидает', in_progress: 'В работе', completed: 'Выполнено',
  overdue: 'Просрочено', cancelled: 'Отменено',
};
const PRIORITY_RU = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
const PRIORITY_MAP = {
  'низкий': 'low', 'low': 'low',
  'обычный': 'normal', 'normal': 'normal',
  'высокий': 'high', 'high': 'high',
};

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return null;
}

function findAtm(serial) {
  return db.prepare('SELECT id FROM atms WHERE serial_number = ? AND active = 1').get(String(serial).trim());
}

function findCleaner(val) {
  if (!val) return null;
  const s = String(val).trim();
  let u = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'cleaner' AND active = 1").get(s);
  if (!u) u = db.prepare("SELECT id FROM users WHERE full_name = ? AND role = 'cleaner' AND active = 1").get(s);
  return u?.id || null;
}

function getManagerIds() {
  return db.prepare("SELECT id FROM users WHERE role IN ('admin','supervisor') AND active = 1")
    .all().map((u) => u.id);
}

router.use(authMiddleware);

let lastOverdueNotify = 0;

function markOverdue() {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    UPDATE cleaning_tasks
    SET status = 'overdue'
    WHERE scheduled_date < ? AND status IN ('pending', 'in_progress')
  `).run(today);

  if (result.changes > 0 && Date.now() - lastOverdueNotify > 3600000) {
    lastOverdueNotify = Date.now();
    notifyOverdue(result.changes, getManagerIds());
  }
}

router.get('/', (req, res) => {
  markOverdue();

  const { status, date, assigned_to } = req.query;
  let sql = TASK_SELECT + ' WHERE 1=1';
  const params = [];

  if (req.user.role === 'cleaner') {
    sql += ' AND t.assigned_to = ?';
    params.push(req.user.id);
  }

  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (date) { sql += ' AND t.scheduled_date = ?'; params.push(date); }
  if (assigned_to && req.user.role !== 'cleaner') {
    sql += ' AND t.assigned_to = ?';
    params.push(assigned_to);
  }

  sql += ' ORDER BY t.scheduled_date DESC, t.priority DESC, t.id';
  res.json(db.prepare(sql).all(...params));
});

router.get('/stats', requireRole('admin', 'supervisor'), (req, res) => {
  markOverdue();
  const today = new Date().toISOString().slice(0, 10);

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' AND scheduled_date = ? THEN 1 ELSE 0 END) as today_pending,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' AND scheduled_date = ? THEN 1 ELSE 0 END) as today_completed,
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
      COUNT(*) as total
    FROM cleaning_tasks
    WHERE status != 'cancelled'
  `).get(today, today);

  const byCleaner = db.prepare(`
    SELECT u.full_name, u.id,
      SUM(CASE WHEN t.status = 'completed' AND t.scheduled_date = ? THEN 1 ELSE 0 END) as completed_today,
      SUM(CASE WHEN t.status = 'overdue' THEN 1 ELSE 0 END) as overdue
    FROM users u
    LEFT JOIN cleaning_tasks t ON t.assigned_to = u.id AND t.status != 'cancelled'
    WHERE u.role = 'cleaner' AND u.active = 1
    GROUP BY u.id
    ORDER BY u.full_name
  `).all(today);

  res.json({ ...stats, byCleaner });
});

router.get('/export', requireRole('admin', 'supervisor'), (req, res) => {
  markOverdue();
  const { status, date_from, date_to } = req.query;

  let sql = `
    SELECT t.id, a.serial_number, a.bank_name, a.address, a.zone,
      t.scheduled_date, t.status, t.priority, u.full_name as assignee,
      t.started_at, t.completed_at, t.report, t.notes,
      (SELECT COUNT(*) FROM task_photos tp WHERE tp.task_id = t.id) as photos
    FROM cleaning_tasks t
    JOIN atms a ON a.id = t.atm_id
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.status != 'cancelled'
  `;
  const params = [];

  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (date_from) { sql += ' AND t.scheduled_date >= ?'; params.push(date_from); }
  if (date_to) { sql += ' AND t.scheduled_date <= ?'; params.push(date_to); }

  sql += ' ORDER BY t.scheduled_date DESC, t.id';
  const rows = db.prepare(sql).all(...params);

  const data = rows.map((r) => ({
    '№ задания': r.id,
    'Банкомат': r.serial_number,
    'Банк': r.bank_name,
    'Адрес': r.address,
    'Зона': r.zone || '',
    'Дата': r.scheduled_date,
    'Статус': STATUS_RU[r.status] || r.status,
    'Приоритет': PRIORITY_RU[r.priority] || r.priority,
    'Уборщик': r.assignee || '',
    'Начато': r.started_at || '',
    'Завершено': r.completed_at || '',
    'Отчёт': r.report || '',
    'Примечание': r.notes || '',
    'Фото': r.photos,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Задания');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="otchet-uborka-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(buf);
});

router.get('/import-template', requireRole('admin', 'supervisor'), (_req, res) => {
  const data = [
    {
      'Банкомат': 'ATM-001',
      'Дата': '2026-06-10',
      'Email уборщика': 'cleaner1@bank.ru',
      'Приоритет': 'обычный',
      'Примечание': 'Плановая уборка',
    },
    {
      'Банкомат': 'ATM-002',
      'Дата': '10.06.2026',
      'Email уборщика': 'Мария Сидорова',
      'Приоритет': 'высокий',
      'Примечание': '',
    },
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Задания');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="shablon-zadaniy.xlsx"');
  res.send(buf);
});

router.post('/import', requireRole('admin', 'supervisor'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Загрузите Excel-файл (.xlsx)' });

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch {
    return res.status(400).json({ error: 'Не удалось прочитать файл Excel' });
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Файл пуст' });
  }

  const insert = db.prepare(`
    INSERT INTO cleaning_tasks (atm_id, assigned_to, scheduled_date, priority, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const created = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const serial = row['Банкомат'] || row['банкомат'] || row['ATM'] || row['atm'];
    const dateRaw = row['Дата'] || row['дата'] || row['Date'];
    const cleaner = row['Email уборщика'] || row['Уборщик'] || row['уборщик'] || '';
    const priorityRaw = String(row['Приоритет'] || row['приоритет'] || 'обычный').toLowerCase().trim();
    const notes = row['Примечание'] || row['примечание'] || '';

    if (!serial) {
      errors.push({ line, error: 'Не указан банкомат' });
      return;
    }

    const atm = findAtm(serial);
    if (!atm) {
      errors.push({ line, error: `Банкомат «${serial}» не найден` });
      return;
    }

    const scheduledDate = parseDate(dateRaw);
    if (!scheduledDate) {
      errors.push({ line, error: 'Некорректная дата (формат: ГГГГ-ММ-ДД или ДД.ММ.ГГГГ)' });
      return;
    }

    const assignedTo = findCleaner(cleaner);
    if (cleaner && !assignedTo) {
      errors.push({ line, error: `Уборщик «${cleaner}» не найден` });
      return;
    }

    const priority = PRIORITY_MAP[priorityRaw] || 'normal';

    try {
      const result = insert.run(atm.id, assignedTo, scheduledDate, priority, notes || null, req.user.id);
      const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(result.lastInsertRowid);
      if (assignedTo) notifyTaskAssigned(task, assignedTo);
      created.push({ line, id: task.id, serial_number: task.serial_number });
    } catch (e) {
      errors.push({ line, error: e.message });
    }
  });

  res.json({
    total: rows.length,
    created: created.length,
    failed: errors.length,
    tasks: created,
    errors,
  });
});

router.post('/', requireRole('admin', 'supervisor'), (req, res) => {
  const { atm_id, assigned_to, scheduled_date, priority, notes } = req.body;
  if (!atm_id || !scheduled_date) {
    return res.status(400).json({ error: 'Укажите банкомат и дату' });
  }

  const result = db.prepare(`
    INSERT INTO cleaning_tasks (atm_id, assigned_to, scheduled_date, priority, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    atm_id,
    assigned_to || null,
    scheduled_date,
    priority || 'normal',
    notes || null,
    req.user.id
  );

  const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(result.lastInsertRowid);
  if (assigned_to) notifyTaskAssigned(task, assigned_to);
  const full = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(result.lastInsertRowid);
  dispatchWebhooks('task.created', formatTask(full));
  res.status(201).json(task);
});

router.patch('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задание не найдено' });

  const isCleaner = req.user.role === 'cleaner';
  if (isCleaner && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Задание назначено другому сотруднику' });
  }

  const { status, report, notes, assigned_to, scheduled_date, priority } = req.body;
  const updates = [];
  const params = [];

  if (!isCleaner) {
    if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
    if (scheduled_date !== undefined) { updates.push('scheduled_date = ?'); params.push(scheduled_date); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  }

  if (status) {
    if (status === 'completed' && isCleaner && !hasAllRequiredPhotos(req.params.id)) {
      return res.status(400).json({
        error: 'Прикрепите обязательные фото: Слева, Справа и Спереди',
      });
    }
    updates.push('status = ?');
    params.push(status);
    if (status === 'in_progress') {
      updates.push("started_at = datetime('now')");
    }
    if (status === 'completed') {
      updates.push("completed_at = datetime('now')");
    }
  }

  if (report !== undefined) { updates.push('report = ?'); params.push(report); }
  if (isCleaner && notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  const prevAssigned = task.assigned_to;
  params.push(req.params.id);
  db.prepare(`UPDATE cleaning_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(req.params.id);

  if (!isCleaner && assigned_to !== undefined && assigned_to !== prevAssigned && assigned_to) {
    notifyTaskAssigned(updated, assigned_to);
  }
  if (status === 'completed') {
    notifyTaskCompleted(updated, getManagerIds());
  }

  const full = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(req.params.id);
  const event = status === 'completed' ? 'task.completed'
    : status === 'cancelled' ? 'task.cancelled' : 'task.updated';
  dispatchWebhooks(event, formatTask(full));

  res.json(updated);
});

router.delete('/:id', requireRole('admin', 'supervisor'), (req, res) => {
  const task = db.prepare('SELECT id FROM cleaning_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Задание не найдено' });

  db.prepare("UPDATE cleaning_tasks SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  const full = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(req.params.id);
  dispatchWebhooks('task.cancelled', formatTask(full));
  res.json({ ok: true });
});

export default router;
