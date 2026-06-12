import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'atm-cleaning.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('bizadmin', 'admin', 'supervisor', 'cleaner')),
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS atms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    serial_number TEXT UNIQUE NOT NULL,
    bank_name TEXT NOT NULL,
    address TEXT NOT NULL,
    zone TEXT,
    notes TEXT,
    external_id TEXT UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cleaning_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    atm_id INTEGER NOT NULL REFERENCES atms(id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    scheduled_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending', 'in_progress', 'completed', 'overdue', 'cancelled')),
    priority TEXT NOT NULL DEFAULT 'normal'
      CHECK(priority IN ('low', 'normal', 'high')),
    started_at TEXT,
    completed_at TEXT,
    notes TEXT,
    report TEXT,
    created_by INTEGER REFERENCES users(id),
    external_id TEXT UNIQUE,
    source_system TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES cleaning_tasks(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT,
    photo_type TEXT CHECK(photo_type IN ('left', 'right', 'front')),
    uploaded_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL DEFAULT '["tasks:read"]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_client_id INTEGER NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '["*"]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS integration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_client_id INTEGER REFERENCES api_clients(id) ON DELETE SET NULL,
    direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
    method TEXT,
    path TEXT,
    status_code INTEGER,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cv_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 1,
    threshold REAL NOT NULL DEFAULT 0.30,
    margin REAL NOT NULL DEFAULT 0.12,
    updated_at TEXT,
    updated_by INTEGER REFERENCES users(id)
  );
`);

const migrations = [
  { table: 'atms', column: 'external_id', sql: 'ALTER TABLE atms ADD COLUMN external_id TEXT UNIQUE' },
  { table: 'cleaning_tasks', column: 'external_id', sql: 'ALTER TABLE cleaning_tasks ADD COLUMN external_id TEXT UNIQUE' },
  { table: 'cleaning_tasks', column: 'source_system', sql: 'ALTER TABLE cleaning_tasks ADD COLUMN source_system TEXT' },
  { table: 'cleaning_tasks', column: 'updated_at', sql: "ALTER TABLE cleaning_tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))" },
  { table: 'task_photos', column: 'cv_detected', sql: 'ALTER TABLE task_photos ADD COLUMN cv_detected INTEGER' },
  { table: 'task_photos', column: 'cv_confidence', sql: 'ALTER TABLE task_photos ADD COLUMN cv_confidence REAL' },
  { table: 'task_photos', column: 'cv_checked_at', sql: 'ALTER TABLE task_photos ADD COLUMN cv_checked_at TEXT' },
];

for (const m of migrations) {
  const cols = db.prepare(`PRAGMA table_info(${m.table})`).all();
  if (!cols.some((c) => c.name === m.column)) {
    try { db.exec(m.sql); } catch { /* ignore */ }
  }
}

const photoCols = db.prepare('PRAGMA table_info(task_photos)').all();
if (!photoCols.some((c) => c.name === 'photo_type')) {
  db.exec("ALTER TABLE task_photos ADD COLUMN photo_type TEXT CHECK(photo_type IN ('left', 'right', 'front'))");
}

function migrateUsersForBizadmin() {
  const usersTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || '';
  const usersMigExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users_mig'").get();
  if (usersTableSql.includes('bizadmin') && !usersMigExists) return;

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    if (usersMigExists) {
      db.exec('DROP TABLE IF EXISTS users');
      db.exec('ALTER TABLE users_mig RENAME TO users');
      return;
    }
    if (!usersTableSql.includes('bizadmin')) {
      db.exec(`
        CREATE TABLE users_mig (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('bizadmin', 'admin', 'supervisor', 'cleaner')),
          phone TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_mig SELECT * FROM users;
        DROP TABLE users;
        ALTER TABLE users_mig RENAME TO users;
      `);
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

migrateUsersForBizadmin();

db.exec(`
  INSERT OR IGNORE INTO cv_settings (id, enabled, threshold, margin)
  VALUES (1, 1, 0.30, 0.12)
`);

const bizadminExists = db.prepare("SELECT id FROM users WHERE email = 'bizadmin@bank.ru'").get();
if (!bizadminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    'INSERT INTO users (email, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?)'
  ).run('bizadmin@bank.ru', hash, 'Бизнес-администратор', 'bizadmin', '+7 900 000-00-03');
}

export const REQUIRED_PHOTO_TYPES = ['left', 'right', 'front'];

export function hasAllRequiredPhotos(taskId) {
  const types = db.prepare(
    'SELECT DISTINCT photo_type FROM task_photos WHERE task_id = ? AND photo_type IS NOT NULL'
  ).all(taskId).map((r) => r.photo_type);
  return REQUIRED_PHOTO_TYPES.every((t) => types.includes(t));
}

export function hasAllPhotosCvPassed(taskId) {
  for (const type of REQUIRED_PHOTO_TYPES) {
    const row = db.prepare(
      'SELECT cv_detected FROM task_photos WHERE task_id = ? AND photo_type = ?'
    ).get(taskId, type);
    if (!row || row.cv_detected !== 1) return false;
  }
  return true;
}

const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

if (userCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, full_name, role, phone) VALUES (?, ?, ?, ?, ?)'
  );

  insertUser.run('admin@bank.ru', hash, 'Администратор', 'admin', '+7 900 000-00-01');
  insertUser.run('bizadmin@bank.ru', hash, 'Бизнес-администратор', 'bizadmin', '+7 900 000-00-03');
  insertUser.run('supervisor@bank.ru', hash, 'Иван Петров', 'supervisor', '+7 900 000-00-02');
  insertUser.run('cleaner1@bank.ru', hash, 'Мария Сидорова', 'cleaner', '+7 900 111-11-11');
  insertUser.run('cleaner2@bank.ru', hash, 'Алексей Козлов', 'cleaner', '+7 900 222-22-22');

  const insertAtm = db.prepare(
    'INSERT INTO atms (serial_number, bank_name, address, zone) VALUES (?, ?, ?, ?)'
  );

  insertAtm.run('ATM-001', 'Сбербанк', 'ул. Ленина, 15, ТЦ «Центральный»', 'Центр');
  insertAtm.run('ATM-002', 'Сбербанк', 'пр. Мира, 42, у входа в метро', 'Север');
  insertAtm.run('ATM-003', 'ВТБ', 'ул. Гагарина, 8, отделение банка', 'Юг');
  insertAtm.run('ATM-004', 'Альфа-Банк', 'ул. Пушкина, 3, аптека', 'Запад');
  insertAtm.run('ATM-005', 'Тинькофф', 'ул. Советская, 100, бизнес-центр', 'Центр');

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const insertTask = db.prepare(`
    INSERT INTO cleaning_tasks (atm_id, assigned_to, scheduled_date, status, priority, created_by, notes)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);

  insertTask.run(1, 3, today, 'pending', 'high', 'Еженедельная уборка');
  insertTask.run(2, 3, today, 'in_progress', 'normal', null);
  insertTask.run(3, 4, today, 'completed', 'normal', null);
  insertTask.run(4, 4, yesterday, 'overdue', 'high', 'Срочно — просрочено');
  insertTask.run(5, 3, tomorrow, 'pending', 'normal', 'Плановая уборка');
}

const apiClientCount = db.prepare('SELECT COUNT(*) as c FROM api_clients').get().c;
if (apiClientCount === 0) {
  const devKey = 'atk_dev_integration_key_2026';
  const hash = crypto.createHash('sha256').update(devKey).digest('hex');
  db.prepare(
    'INSERT INTO api_clients (name, api_key_hash, scopes) VALUES (?, ?, ?)'
  ).run(
    'Dev Integration (ERP)',
    hash,
    JSON.stringify(['*'])
  );
}

export default db;
