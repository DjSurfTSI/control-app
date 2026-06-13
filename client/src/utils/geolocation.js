const STORAGE_KEY = 'geo_position_cache';
const PERMISSION_KEY = 'geo_permission_state';

export function getCachedGeolocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveGeolocation(latitude, longitude) {
  const data = { latitude, longitude, at: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(PERMISSION_KEY, 'granted');
  return data;
}

function savePermissionDenied() {
  localStorage.setItem(PERMISSION_KEY, 'denied');
}

export async function getGeolocationPermissionState() {
  if (!navigator.permissions?.query) return localStorage.getItem(PERMISSION_KEY) || 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return localStorage.getItem(PERMISSION_KEY) || 'unknown';
  }
}

function getCurrentCoords({ timeout = 15000, maximumAge = 0, enableHighAccuracy = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Геолокация не поддерживается'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      }),
      (err) => reject(err),
      { enableHighAccuracy, timeout, maximumAge },
    );
  });
}

/** Запросить доступ при входе (вызов из обработчика клика «Войти»). */
export async function requestGeolocationAccess() {
  if (!navigator.geolocation) return null;

  const perm = await getGeolocationPermissionState();
  if (perm === 'denied') return getCachedGeolocation();

  try {
    const coords = await getCurrentCoords({ maximumAge: 0, timeout: 15000 });
    return saveGeolocation(coords.latitude, coords.longitude);
  } catch (err) {
    if (err?.code === 1) savePermissionDenied();
    return getCachedGeolocation();
  }
}

/** Обновить координаты без диалога, если разрешение уже выдано. */
export async function refreshGeolocationIfGranted({ maximumAge = 60000, timeout = 8000 } = {}) {
  if (!navigator.geolocation) return getCachedGeolocation();

  const perm = await getGeolocationPermissionState();
  if (perm !== 'granted') return getCachedGeolocation();

  try {
    const coords = await getCurrentCoords({ maximumAge, timeout });
    return saveGeolocation(coords.latitude, coords.longitude);
  } catch {
    return getCachedGeolocation();
  }
}
