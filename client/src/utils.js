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

  if (!navigator.geolocation) return base;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        ...base,
        closed_latitude: pos.coords.latitude,
        closed_longitude: pos.coords.longitude,
      }),
      () => resolve(base),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
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
