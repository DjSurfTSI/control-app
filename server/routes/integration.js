import { Router } from 'express';
import db from '../db.js';
import { notifyTaskAssigned } from '../push.js';
import { dispatchWebhooks } from '../integration/webhooks.js';
import { formatTask, formatAtm, TASK_SELECT_INTEGRATION } from '../integration/schemas.js';
import {
  apiKeyMiddleware,
  requireScope,
  logIntegrationResponse,
  adminOnly,
  generateApiKey,
  hashApiKey,
} from '../integration/middleware.js';

const router = Router();
const v1 = Router();

const PRIORITY_MAP = {
  low: 'low', normal: 'normal', high: 'high',
  низкий: 'low', обычный: 'normal', высокий: 'high',
};

function findAtmByRef({ atm_id, serial_number, external_id }) {
  if (atm_id) return db.prepare('SELECT * FROM atms WHERE id = ? AND active = 1').get(atm_id);
  if (external_id) return db.prepare('SELECT * FROM atms WHERE external_id = ? AND active = 1').get(external_id);
  if (serial_number) return db.prepare('SELECT * FROM atms WHERE serial_number = ? AND active = 1').get(serial_number);
  return null;
}

function findCleanerByRef({ assignee_id, assignee_email }) {
  if (assignee_id) {
    return db.prepare("SELECT id FROM users WHERE id = ? AND role = 'cleaner' AND active = 1").get(assignee_id);
  }
  if (assignee_email) {
    return db.prepare("SELECT id FROM users WHERE email = ? AND role = 'cleaner' AND active = 1").get(assignee_email);
  }
  return null;
}

function createTaskRecord(data, source = 'integration') {
  const atm = findAtmByRef(data);
  if (!atm) throw new Error('Банкомат не найден');

  if (data.external_id) {
    const dup = db.prepare('SELECT id FROM cleaning_tasks WHERE external_id = ?').get(data.external_id);
    if (dup) throw new Error(`Задание с external_id «${data.external_id}» уже существует`);
  }

  const cleaner = findCleanerByRef(data);
  const priority = PRIORITY_MAP[String(data.priority || 'normal').toLowerCase()] || 'normal';

  const result = db.prepare(`
    INSERT INTO cleaning_tasks (atm_id, assigned_to, scheduled_date, priority, notes, external_id, source_system, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    atm.id,
    cleaner?.id || null,
    data.scheduled_date,
    priority,
    data.notes || null,
    data.external_id || null,
    data.source_system || source,
  );

  const task = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(result.lastInsertRowid);
  if (cleaner?.id) notifyTaskAssigned(task, cleaner.id);
  dispatchWebhooks('task.created', formatTask(task));
  return task;
}

// --- Admin: управление API-ключами (JWT admin) ---

router.get('/clients', ...adminOnly, (_req, res) => {
  const clients = db.prepare(`
    SELECT id, name, scopes, active, created_at, last_used_at
    FROM api_clients ORDER BY created_at DESC
  `).all().map((c) => ({ ...c, scopes: JSON.parse(c.scopes) }));
  res.json(clients);
});

router.post('/clients', ...adminOnly, (req, res) => {
  const { name, scopes } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите name' });

  const apiKey = generateApiKey();
  const defaultScopes = scopes || ['tasks:read', 'tasks:write', 'atms:read'];
  const result = db.prepare(
    'INSERT INTO api_clients (name, api_key_hash, scopes) VALUES (?, ?, ?)'
  ).run(name, hashApiKey(apiKey), JSON.stringify(defaultScopes));

  res.status(201).json({
    id: result.lastInsertRowid,
    name,
    api_key: apiKey,
    scopes: defaultScopes,
    warning: 'Сохраните API-ключ — он показывается только один раз',
  });
});

router.patch('/clients/:id', ...adminOnly, (req, res) => {
  const { active, scopes, name } = req.body;
  const client = db.prepare('SELECT id FROM api_clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });

  const updates = [];
  const params = [];
  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
  if (scopes !== undefined) { updates.push('scopes = ?'); params.push(JSON.stringify(scopes)); }

  if (updates.length === 0) return res.status(400).json({ error: 'Нет данных' });
  params.push(req.params.id);
  db.prepare(`UPDATE api_clients SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

router.delete('/clients/:id', ...adminOnly, (req, res) => {
  db.prepare('DELETE FROM webhook_endpoints WHERE api_client_id = ?').run(req.params.id);
  db.prepare('DELETE FROM api_clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/webhooks', ...adminOnly, (_req, res) => {
  res.json(db.prepare(`
    SELECT w.id, w.api_client_id, c.name as client_name, w.url, w.events, w.active, w.created_at
    FROM webhook_endpoints w JOIN api_clients c ON c.id = w.api_client_id
    ORDER BY w.created_at DESC
  `).all().map((w) => ({ ...w, events: JSON.parse(w.events) })));
});

router.post('/webhooks', ...adminOnly, (req, res) => {
  const { api_client_id, url, events, secret } = req.body;
  if (!api_client_id || !url || !events?.length) {
    return res.status(400).json({ error: 'Укажите api_client_id, url, events' });
  }

  const result = db.prepare(
    'INSERT INTO webhook_endpoints (api_client_id, url, secret, events) VALUES (?, ?, ?, ?)'
  ).run(api_client_id, url, secret || generateApiKey(), JSON.stringify(events));

  res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

router.get('/logs', ...adminOnly, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(db.prepare(`
    SELECT l.*, c.name as client_name
    FROM integration_log l
    LEFT JOIN api_clients c ON c.id = l.api_client_id
    ORDER BY l.id DESC LIMIT ?
  `).all(limit));
});

// --- Public Integration API v1 (API Key) ---

v1.use(apiKeyMiddleware, logIntegrationResponse);

v1.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'atm-cleaning-control',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

v1.get('/tasks', requireScope('tasks:read'), (req, res) => {
  const { status, date, external_id, updated_since } = req.query;
  let sql = TASK_SELECT_INTEGRATION + ' WHERE 1=1';
  const params = [];

  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (date) { sql += ' AND t.scheduled_date = ?'; params.push(date); }
  if (external_id) { sql += ' AND t.external_id = ?'; params.push(external_id); }
  if (updated_since) { sql += ' AND t.created_at >= ?'; params.push(updated_since); }

  sql += ' ORDER BY t.id DESC LIMIT 500';
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows.map(formatTask), meta: { count: rows.length } });
});

v1.get('/tasks/:id', requireScope('tasks:read'), (req, res) => {
  const row = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found', message: 'Задание не найдено' });
  res.json({ data: formatTask(row) });
});

v1.post('/tasks', requireScope('tasks:write'), (req, res) => {
  const { scheduled_date, external_id } = req.body;
  if (!scheduled_date) {
    return res.status(400).json({ error: 'validation_error', message: 'scheduled_date обязателен' });
  }
  try {
    const task = createTaskRecord(req.body);
    res.status(201).json({ data: formatTask(task) });
  } catch (e) {
    res.status(400).json({ error: 'validation_error', message: e.message });
  }
});

v1.post('/tasks/batch', requireScope('tasks:write'), (req, res) => {
  const items = req.body.tasks || req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'validation_error', message: 'Ожидается массив tasks' });
  }

  const created = [];
  const errors = [];
  items.forEach((item, i) => {
    try {
      const task = createTaskRecord(item);
      created.push(formatTask(task));
    } catch (e) {
      errors.push({ index: i, message: e.message });
    }
  });

  res.status(created.length ? 201 : 400).json({ created, errors, meta: { total: items.length } });
});

v1.patch('/tasks/:id', requireScope('tasks:write'), (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'not_found', message: 'Задание не найдено' });

  const { status, scheduled_date, priority, notes, assignee_id, assignee_email } = req.body;
  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?'); params.push(status);
    if (status === 'in_progress') updates.push("started_at = datetime('now')");
    if (status === 'completed') updates.push("completed_at = datetime('now')");
  }
  if (scheduled_date) { updates.push('scheduled_date = ?'); params.push(scheduled_date); }
  if (priority) { updates.push('priority = ?'); params.push(PRIORITY_MAP[priority] || priority); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }

  const cleaner = findCleanerByRef({ assignee_id, assignee_email });
  if (assignee_id || assignee_email) {
    updates.push('assigned_to = ?'); params.push(cleaner?.id || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'validation_error', message: 'Нет данных для обновления' });
  }

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE cleaning_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(TASK_SELECT_INTEGRATION + ' WHERE t.id = ?').get(req.params.id);
  const event = status === 'completed' ? 'task.completed' : status === 'cancelled' ? 'task.cancelled' : 'task.updated';
  dispatchWebhooks(event, formatTask(updated));
  res.json({ data: formatTask(updated) });
});

v1.get('/atms', requireScope('atms:read'), (req, res) => {
  const { zone, external_id } = req.query;
  let sql = 'SELECT * FROM atms WHERE active = 1';
  const params = [];
  if (zone) { sql += ' AND zone = ?'; params.push(zone); }
  if (external_id) { sql += ' AND external_id = ?'; params.push(external_id); }
  sql += ' ORDER BY serial_number';
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows.map(formatAtm), meta: { count: rows.length } });
});

v1.get('/atms/:ref', requireScope('atms:read'), (req, res) => {
  const ref = req.params.ref;
  const row = db.prepare('SELECT * FROM atms WHERE (serial_number = ? OR external_id = ?) AND active = 1')
    .get(ref, ref);
  if (!row) return res.status(404).json({ error: 'not_found', message: 'Банкомат не найден' });
  res.json({ data: formatAtm(row) });
});

v1.post('/atms', requireScope('atms:write'), (req, res) => {
  const { serial_number, bank_name, address, zone, notes, external_id } = req.body;
  if (!serial_number || !bank_name || !address) {
    return res.status(400).json({ error: 'validation_error', message: 'serial_number, bank_name, address обязательны' });
  }

  const existing = external_id
    ? db.prepare('SELECT id FROM atms WHERE external_id = ?').get(external_id)
    : null;

  if (existing) {
    db.prepare('UPDATE atms SET serial_number=?, bank_name=?, address=?, zone=?, notes=? WHERE id=?')
      .run(serial_number, bank_name, address, zone || null, notes || null, existing.id);
    const atm = db.prepare('SELECT * FROM atms WHERE id = ?').get(existing.id);
    dispatchWebhooks('atm.updated', formatAtm(atm));
    return res.json({ data: formatAtm(atm), upserted: true });
  }

  try {
    const result = db.prepare(
      'INSERT INTO atms (serial_number, bank_name, address, zone, notes, external_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(serial_number, bank_name, address, zone || null, notes || null, external_id || null);
    const atm = db.prepare('SELECT * FROM atms WHERE id = ?').get(result.lastInsertRowid);
    dispatchWebhooks('atm.created', formatAtm(atm));
    res.status(201).json({ data: formatAtm(atm) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'conflict', message: 'Банкомат с таким serial_number уже существует' });
    }
    throw e;
  }
});

v1.get('/stats', requireScope('tasks:read'), (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN status = 'pending' AND scheduled_date = ? THEN 1 ELSE 0 END) as today_pending
    FROM cleaning_tasks WHERE status != 'cancelled'
  `).get(today);
  res.json({ data: stats, meta: { date: today } });
});

router.use('/v1', v1);

export default router;
