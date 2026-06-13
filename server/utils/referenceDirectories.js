import db from '../db.js';

export const REFERENCE_DIRECTORY_TYPES = [
  'territorial_bank',
  'gosb',
  'accessibility_type',
];

export const REFERENCE_DIRECTORY_LABELS = {
  territorial_bank: 'Территориальный Банк',
  gosb: 'ГОСБ',
  accessibility_type: 'Вид доступности',
};

export function listReferenceDirectories() {
  const rows = db.prepare(`
    SELECT type, value FROM reference_directories
    WHERE active = 1
    ORDER BY type, sort_order, value
  `).all();

  const result = {
    territorial_bank: [],
    gosb: [],
    accessibility_type: [],
  };
  for (const row of rows) {
    if (result[row.type]) result[row.type].push(row.value);
  }
  return result;
}

export function listReferenceDirectoriesManage() {
  return db.prepare(`
    SELECT id, type, value, active, sort_order, created_at
    FROM reference_directories
    ORDER BY type, sort_order, value
  `).all();
}

export function isValueInDirectory(type, value) {
  if (!value || !REFERENCE_DIRECTORY_TYPES.includes(type)) return false;
  return !!db.prepare(
    'SELECT 1 FROM reference_directories WHERE type = ? AND value = ? AND active = 1',
  ).get(type, String(value).trim());
}

export function validateDeviceReferenceFields({ territorial_bank, gosb, accessibility_type }) {
  const fields = [
    ['territorial_bank', territorial_bank, REFERENCE_DIRECTORY_LABELS.territorial_bank],
    ['gosb', gosb, REFERENCE_DIRECTORY_LABELS.gosb],
    ['accessibility_type', accessibility_type, REFERENCE_DIRECTORY_LABELS.accessibility_type],
  ];

  for (const [type, val, label] of fields) {
    const count = db.prepare(
      'SELECT COUNT(*) as c FROM reference_directories WHERE type = ? AND active = 1',
    ).get(type).c;
    if (count > 0 && !isValueInDirectory(type, val)) {
      const err = new Error(`${label}: выберите значение из справочника`);
      err.status = 400;
      throw err;
    }
  }
}

export function addReferenceEntry(type, value) {
  if (!REFERENCE_DIRECTORY_TYPES.includes(type)) {
    const err = new Error('Неизвестный тип справочника');
    err.status = 400;
    throw err;
  }
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    const err = new Error('Укажите значение');
    err.status = 400;
    throw err;
  }

  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) as m FROM reference_directories WHERE type = ?',
  ).get(type).m;

  try {
    const result = db.prepare(`
      INSERT INTO reference_directories (type, value, sort_order)
      VALUES (?, ?, ?)
    `).run(type, trimmed, maxOrder + 1);
    return db.prepare('SELECT * FROM reference_directories WHERE id = ?').get(result.lastInsertRowid);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      const err = new Error('Такое значение уже есть в справочнике');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

export function updateReferenceEntry(id, { value, active }) {
  const entry = db.prepare('SELECT * FROM reference_directories WHERE id = ?').get(id);
  if (!entry) {
    const err = new Error('Запись не найдена');
    err.status = 404;
    throw err;
  }

  const updates = [];
  const params = [];

  if (value !== undefined) {
    const trimmed = String(value).trim();
    if (!trimmed) {
      const err = new Error('Укажите значение');
      err.status = 400;
      throw err;
    }
    updates.push('value = ?');
    params.push(trimmed);
  }
  if (active !== undefined) {
    updates.push('active = ?');
    params.push(active ? 1 : 0);
  }

  if (updates.length === 0) {
    const err = new Error('Нет данных для обновления');
    err.status = 400;
    throw err;
  }

  try {
    params.push(id);
    db.prepare(`UPDATE reference_directories SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return db.prepare('SELECT * FROM reference_directories WHERE id = ?').get(id);
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      const err = new Error('Такое значение уже есть в справочнике');
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

export function deleteReferenceEntry(id) {
  const entry = db.prepare('SELECT * FROM reference_directories WHERE id = ?').get(id);
  if (!entry) {
    const err = new Error('Запись не найдена');
    err.status = 404;
    throw err;
  }
  db.prepare('DELETE FROM reference_directories WHERE id = ?').run(id);
  return { ok: true };
}
