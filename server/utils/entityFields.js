import db from '../db.js';

export const ENTITY_TYPES = ['tasks', 'atms', 'users'];

const SHOW_IN_DEFAULT = { table: true, card: false, form: true, detail: true };

function field(id, label, opts = {}) {
  return {
    id,
    key: opts.key ?? id,
    label,
    kind: 'system',
    type: opts.type ?? 'text',
    system: true,
    visible: opts.visible !== false,
    order: opts.order ?? 0,
    showIn: { ...SHOW_IN_DEFAULT, ...opts.showIn },
    roles: opts.roles ?? null,
    required: opts.required ?? false,
  };
}

export function getDefaultFieldCatalog() {
  return {
    tasks: [
      field('id', '№', { type: 'number', showIn: { table: true, card: true, form: false, detail: true } }),
      field('serial_number', 'ID УС', { showIn: { table: true, card: true, form: false, detail: true } }),
      field('status', 'Статус', { type: 'status', showIn: { table: true, card: true, form: false, detail: true } }),
      field('photo_count', 'Фото', { type: 'photo_count', showIn: { table: true, card: true, form: false, detail: false } }),
      field('accessibility_type', 'Доступн.', { showIn: { table: true, card: true, form: false, detail: true } }),
      field('territorial_bank', 'Терр. Банк', { showIn: { table: true, card: false, form: false, detail: true } }),
      field('gosb', 'ГОСБ', { showIn: { table: true, card: false, form: false, detail: true } }),
      field('address', 'Адрес', { showIn: { table: true, card: true, form: false, detail: true } }),
      field('installation_name', 'Место', { showIn: { table: true, card: true, form: false, detail: true } }),
      field('scheduled_date', 'План', { type: 'date', showIn: { table: true, card: true, form: true, detail: true } }),
      field('deadline_date', 'Контроль', { type: 'date', showIn: { table: true, card: true, form: true, detail: true } }),
      field('started_at', 'Начало', { type: 'datetime', showIn: { table: true, card: false, form: false, detail: true } }),
      field('completed_at', 'Конец', { type: 'datetime', showIn: { table: true, card: false, form: false, detail: true } }),
      field('service_contract', 'Услуга', { showIn: { table: true, card: false, form: true, detail: true } }),
      field('assignee_name', 'Исполнитель', { showIn: { table: true, card: true, form: true, detail: true } }),
      field('notes', 'Примечания', { showIn: { table: false, card: false, form: true, detail: true } }),
      field('report', 'Отчёт', { showIn: { table: false, card: false, form: false, detail: true } }),
      field('geo', 'Гео', { type: 'geo', roles: ['bizadmin', 'admin', 'supervisor'], showIn: { table: true, card: false, form: false, detail: true } }),
      field('actions', 'Действия', { type: 'actions', showIn: { table: true, card: true, form: false, detail: false } }),
    ],
    atms: [
      field('serial_number', 'ID УС', { required: true, showIn: { table: true, card: true, form: true, detail: true } }),
      field('territorial_bank', 'Терр. Банк', { type: 'directory', required: true }),
      field('gosb', 'ГОСБ', { type: 'directory', required: true }),
      field('address', 'Адрес', { required: true }),
      field('accessibility_type', 'Доступн.', { type: 'directory', required: true }),
      field('installation_name', 'Место', { required: true }),
      field('notes', 'Примечания', { showIn: { table: false, card: false, form: true, detail: true } }),
      field('actions', 'Действия', { type: 'actions', showIn: { table: true, card: true, form: false, detail: false } }),
    ],
    users: [
      field('full_name', 'ФИО', { required: true, showIn: { table: true, card: true, form: true, detail: true } }),
      field('email', 'Email', { required: true }),
      field('role', 'Роль', { type: 'role', roles: ['bizadmin', 'admin'] }),
      field('phone', 'Тел.', { required: true }),
      field('employee_number', 'Таб. №', { required: true }),
      field('rating', 'Рейт.', { type: 'number' }),
      field('active', 'Статус', { type: 'active' }),
      field('position', 'Должность', { showIn: { table: false, card: true, form: true, detail: true } }),
      field('territorial_bank', 'Терр. Банк', { required: true, showIn: { table: false, card: false, form: true, detail: true } }),
      field('actions', 'Действия', { type: 'actions', showIn: { table: true, card: true, form: false, detail: false } }),
    ],
  };
}

function normalizeShowIn(showIn) {
  const base = { ...SHOW_IN_DEFAULT };
  if (!showIn || typeof showIn !== 'object') return base;
  return {
    table: showIn.table !== false,
    card: showIn.card === true,
    form: showIn.form !== false,
    detail: showIn.detail !== false,
  };
}

function normalizeField(raw, systemField) {
  const base = systemField || {
    id: raw.id,
    key: raw.key || raw.id,
    label: raw.label || raw.id,
    kind: raw.kind === 'custom' ? 'custom' : 'system',
    type: raw.type || 'text',
    system: !!raw.system,
    visible: raw.visible !== false,
    order: raw.order ?? 0,
    showIn: normalizeShowIn(raw.showIn),
    roles: raw.roles ?? null,
    required: !!raw.required,
  };

  return {
    ...base,
    label: raw.label ?? base.label,
    visible: raw.visible !== false,
    order: typeof raw.order === 'number' ? raw.order : base.order,
    showIn: normalizeShowIn(raw.showIn ?? base.showIn),
    roles: raw.roles !== undefined ? raw.roles : base.roles,
    required: raw.required !== undefined ? !!raw.required : base.required,
    type: raw.type || base.type,
  };
}

export function mergeEntityFieldConfig(saved) {
  const defaults = getDefaultFieldCatalog();
  const result = {};

  for (const entity of ENTITY_TYPES) {
    const catalog = defaults[entity];
    const catalogMap = new Map(catalog.map((f) => [f.id, f]));
    const savedList = Array.isArray(saved?.[entity]) ? saved[entity] : [];
    const savedMap = new Map(savedList.map((f) => [f.id, f]));

    const merged = [];

    for (const sys of catalog) {
      merged.push(normalizeField(savedMap.get(sys.id) || {}, sys));
    }

    for (const item of savedList) {
      if (item.kind === 'custom' && item.id && !catalogMap.has(item.id)) {
        merged.push(normalizeField(item, null));
      }
    }

    merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    result[entity] = merged.map((f, i) => ({ ...f, order: i }));
  }

  return result;
}

export function parseEntityFieldConfig(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export function getEntityFieldConfig() {
  const row = db.prepare('SELECT config FROM entity_field_config WHERE id = 1').get();
  const saved = parseEntityFieldConfig(row?.config);
  return mergeEntityFieldConfig(saved);
}

export function saveEntityFieldConfig(config, userId) {
  const merged = mergeEntityFieldConfig(config);
  const json = JSON.stringify(merged);
  db.prepare(`
    INSERT INTO entity_field_config (id, config, updated_at, updated_by)
    VALUES (1, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      config = excluded.config,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(json, userId ?? null);
  return merged;
}

export function parseCustomData(raw) {
  if (!raw) return {};
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function serializeCustomData(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') clean[k] = v;
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

export function attachCustomFields(row) {
  if (!row) return row;
  const custom_fields = parseCustomData(row.custom_data);
  return { ...row, custom_fields };
}

export function extractCustomFieldsFromBody(body, entity) {
  const config = getEntityFieldConfig();
  const customKeys = (config[entity] || [])
    .filter((f) => f.kind === 'custom' && f.visible !== false)
    .map((f) => f.key);

  const source = body?.custom_fields && typeof body.custom_fields === 'object'
    ? body.custom_fields
    : {};

  const picked = {};
  for (const key of customKeys) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
}

export function fieldVisibleForRole(field, role) {
  if (!field.roles || !Array.isArray(field.roles) || field.roles.length === 0) return true;
  const r = role === 'cleaner' ? 'executor' : role;
  return field.roles.includes(r);
}

export function getVisibleFields(entity, config, { view = 'table', role } = {}) {
  return (config[entity] || [])
    .filter((f) => f.visible !== false && fieldVisibleForRole(f, role))
    .filter((f) => f.showIn?.[view] !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
