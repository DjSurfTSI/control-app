import { getCachedGeolocation, refreshGeolocationIfGranted } from './utils/geolocation.js';

export const STATUS_LABELS = {
  new: 'Новая',
  in_progress: 'В работе',
  completed: 'Выполнено',
  overdue: 'Просрочено',
  returned: 'Возврат',
  cancelled: 'Отменено',
  no_access: 'Нет доступа',
  emergency: 'Экстренная заявка',
  pending: 'Новая',
};

export const PRIORITY_LABELS = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
};

export const ROLE_LABELS = {
  bizadmin: 'Бизнес-администратор',
  admin: 'Администратор',
  supervisor: 'Супервайзер',
  executor: 'Исполнитель',
  cleaner: 'Исполнитель',
};

export function isBizAdmin(user) {
  return user?.role === 'bizadmin';
}

export function isManager(user) {
  return isBizAdmin(user) || user?.role === 'admin' || user?.role === 'supervisor';
}

export function isAdmin(user) {
  return isBizAdmin(user) || user?.role === 'admin';
}

export function isExecutor(user) {
  return user?.role === 'executor' || user?.role === 'cleaner';
}

export const EXECUTOR_COMPLETABLE_STATUSES = ['in_progress', 'overdue', 'returned', 'emergency'];

/** Статусы в фильтре заявок (без legacy pending) */
export const TASK_FILTER_STATUSES = Object.keys(STATUS_LABELS).filter((k) => k !== 'pending');

const EXECUTOR_STATUS_SHORT = {
  new: 'Новая',
  in_progress: 'В работе',
  completed: 'Выполн.',
  overdue: 'Просроч.',
  returned: 'Возврат',
  cancelled: 'Отмена',
  no_access: 'Нет дост.',
  emergency: 'Срочная',
};

/** Вкладки мобильного списка заявок для исполнителя — по одному статусу из фильтра */
export const EXECUTOR_MOBILE_TABS = TASK_FILTER_STATUSES.map((id) => ({
  id,
  label: STATUS_LABELS[id],
  shortLabel: EXECUTOR_STATUS_SHORT[id] ?? STATUS_LABELS[id],
  statuses: [id],
}));

export const BULK_ASSIGNABLE_STATUSES = ['new', 'in_progress', 'overdue', 'returned', 'no_access', 'emergency'];

export function canBulkAssignTask(task) {
  return task && BULK_ASSIGNABLE_STATUSES.includes(task.status);
}

export const EXECUTOR_SELF_ASSIGNABLE_STATUSES = ['new', 'overdue'];

export function canExecutorTakeTask(task) {
  return task && EXECUTOR_SELF_ASSIGNABLE_STATUSES.includes(task.status) && !task.assigned_to;
}

/** Исполнитель может взять на себя новую или просроченную нераспределённую заявку */
export function canBulkAssignSelfTask(task) {
  return canExecutorTakeTask(task);
}

export function filterTasksByExecutorTab(tasks, tabId) {
  const tab = EXECUTOR_MOBILE_TABS.find((t) => t.id === tabId);
  if (!tab) return tasks;
  return tasks.filter((t) => tab.statuses.includes(t.status));
}

export function countTasksForExecutorTab(tasks, tab) {
  return tasks.filter((t) => tab.statuses.includes(t.status)).length;
}

export function isTaskAssignedToUser(task, userId) {
  if (!task || userId == null) return false;
  return Number(task.assigned_to) === Number(userId);
}

export function canExecutorCompleteTask(task, userId) {
  return isTaskAssignedToUser(task, userId) && EXECUTOR_COMPLETABLE_STATUSES.includes(task.status);
}

export function canManagerCompleteTask(task) {
  return task && EXECUTOR_COMPLETABLE_STATUSES.includes(task.status);
}

export function canUserCompleteTask(task, user) {
  if (!task || !user) return false;
  if (isManager(user)) return canManagerCompleteTask(task);
  if (isExecutor(user)) return canExecutorCompleteTask(task, user.id);
  return false;
}

export function userMustAttachPhotosToComplete(user) {
  return isExecutor(user) || isManager(user);
}

export const CV_ASSIGNABLE_ROLES = [
  { id: 'admin', label: 'Администратор' },
  { id: 'supervisor', label: 'Супервайзер' },
  { id: 'executor', label: 'Исполнитель' },
];

export function normalizeUserRole(user) {
  if (!user?.role) return null;
  return user.role === 'cleaner' ? 'executor' : user.role;
}

export function isCvEnabledForUser(cvStatus, user) {
  if (!cvStatus?.enabled) return false;
  if (isBizAdmin(user)) return false;
  const role = normalizeUserRole(user);
  if (!role) return false;
  const roles = cvStatus?.cv_roles || ['executor'];
  return roles.includes(role);
}

export function hasRouteAccess(user, roles) {
  if (!roles) return true;
  if (isBizAdmin(user)) return true;
  const normalized = roles.map((r) => (r === 'cleaner' ? 'executor' : r));
  const userRole = user?.role === 'cleaner' ? 'executor' : user?.role;
  return normalized.includes(userRole);
}

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

export function checkPhotoCv(photos, cvEnabled = true) {
  const missing = PHOTO_TYPES.filter((t) => !photos.some((p) => p.photo_type === t));
  if (!cvEnabled) {
    return { passed: missing.length === 0, failed: [], pending: [], missing };
  }
  const required = PHOTO_TYPES.map((t) => photos.find((p) => p.photo_type === t)).filter(Boolean);
  const failed = required.filter((p) => Number(p.cv_detected) === 0 && !p.offline).map((p) => p.photo_type);
  const pending = required.filter((p) => p.cv_detected == null && !p.offline).map((p) => p.photo_type);
  const passed = missing.length === 0 && failed.length === 0 && pending.length === 0
    && (!cvEnabled || required.every((p) => Number(p.cv_detected) === 1 || p.offline));
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

function detectClientDevice() {
  let closed_os = navigator.userAgentData?.platform || navigator.platform || 'Unknown';
  let closed_device = 'Web';

  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  let browser = 'Браузер';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  closed_device = `${mobile ? 'Мобильное устройство' : 'Компьютер'} • ${browser}`;
  return { closed_os, closed_device };
}

export async function getCloseMetadata() {
  let { closed_os, closed_device } = detectClientDevice();

  try {
    if (navigator.userAgentData?.getHighEntropyValues) {
      const hints = await navigator.userAgentData.getHighEntropyValues(['platform', 'model', 'mobile']);
      if (hints.platform) closed_os = hints.platform;
      const kind = hints.mobile ? 'Мобильное устройство' : 'Компьютер';
      closed_device = hints.model ? `${kind} (${hints.model})` : kind;
    }
  } catch {
    /* ignore */
  }

  const base = { closed_device, closed_os, closed_latitude: null, closed_longitude: null };

  const cached = getCachedGeolocation();
  if (cached) {
    base.closed_latitude = cached.latitude;
    base.closed_longitude = cached.longitude;
  }

  const fresh = await refreshGeolocationIfGranted({ maximumAge: 0, timeout: 10000 });
  if (fresh) {
    base.closed_latitude = fresh.latitude;
    base.closed_longitude = fresh.longitude;
  }

  return base;
}

export function formatCloseLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return {
    text,
    mapsUrl: `https://maps.google.com/?q=${lat},${lng}`,
  };
}
