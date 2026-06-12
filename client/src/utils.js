export const STATUS_LABELS = {
  pending: 'Ожидает',
  in_progress: 'В работе',
  completed: 'Выполнено',
  overdue: 'Просрочено',
  cancelled: 'Отменено',
};

export const PRIORITY_LABELS = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
};

export const ROLE_LABELS = {
  admin: 'Администратор',
  supervisor: 'Супервайзер',
  cleaner: 'Уборщик',
};

export const PHOTO_TYPES = ['left', 'right', 'front'];

export const PHOTO_TYPE_LABELS = {
  left: 'Слева',
  right: 'Справа',
  front: 'Спереди',
};

export function checkRequiredPhotos(photos) {
  const types = photos.map((p) => p.photo_type).filter(Boolean);
  const missing = PHOTO_TYPES.filter((t) => !types.includes(t));
  return { complete: missing.length === 0, missing };
}

export function checkPhotoCv(photos) {
  const required = PHOTO_TYPES.map((t) => photos.find((p) => p.photo_type === t)).filter(Boolean);
  const missing = PHOTO_TYPES.filter((t) => !photos.some((p) => p.photo_type === t));
  const failed = required.filter((p) => p.cv_detected === 0).map((p) => p.photo_type);
  const pending = required.filter((p) => p.cv_detected == null).map((p) => p.photo_type);
  const passed = missing.length === 0 && failed.length === 0 && pending.length === 0;
  return { passed, failed, pending, missing };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
