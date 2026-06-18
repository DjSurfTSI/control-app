export const ENTITY_TYPES = ['tasks', 'atms', 'users'];

const SHOW_IN_DEFAULT = { table: true, card: false, form: true, detail: true };

export function fieldVisibleForRole(field, role) {
  if (!field.roles?.length) return true;
  const r = role === 'cleaner' ? 'executor' : role;
  return field.roles.includes(r);
}

export function getVisibleFields(config, entity, { view = 'table', role } = {}) {
  return (config?.[entity] || [])
    .filter((f) => f.visible !== false && fieldVisibleForRole(f, role))
    .filter((f) => f.showIn?.[view] !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getEntityFieldValue(row, field) {
  if (!row || !field) return '—';
  if (field.kind === 'custom') {
    const v = row.custom_fields?.[field.key];
    return v === undefined || v === null || v === '' ? '—' : v;
  }
  const v = row[field.key];
  if (v === undefined || v === null || v === '') return '—';
  return v;
}

export function slugifyFieldId(label) {
  const base = String(label || 'field')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'field';
  return `custom_${base}_${Date.now().toString(36).slice(-4)}`;
}

export function createCustomField({ label, type = 'text' }) {
  const id = slugifyFieldId(label);
  return {
    id,
    key: id,
    label: label.trim(),
    kind: 'custom',
    type,
    system: false,
    visible: true,
    order: 999,
    showIn: { table: true, card: false, form: true, detail: true },
    roles: null,
    required: false,
  };
}

export function moveField(list, index, direction) {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, i) => ({ ...item, order: i }));
}

export const VIEW_LABELS = {
  table: 'Таблица',
  card: 'Карточка',
  form: 'Форма',
  detail: 'Детали',
};

export const FIELD_TYPE_LABELS = {
  text: 'Текст',
  number: 'Число',
  date: 'Дата',
  datetime: 'Дата и время',
  status: 'Статус',
  photo_count: 'Счётчик фото',
  geo: 'Геолокация',
  actions: 'Действия',
  directory: 'Справочник',
  role: 'Роль',
  active: 'Активность',
};

export { SHOW_IN_DEFAULT };
