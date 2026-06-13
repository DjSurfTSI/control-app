import {
  cacheTasks,
  getCachedTasks,
  enqueue,
  patchCachedTask,
  cachePhotos,
  getCachedPhotos,
  addPendingPhotoToCache,
  setMeta,
  getMeta,
} from './offline/store.js';

const API = '/api';
const REQUEST_TIMEOUT_MS = 20000;

function getToken() {
  return localStorage.getItem('token');
}

export function isNetworkError(err) {
  return err instanceof TypeError
    || err?.name === 'AbortError'
    || err?.message?.includes('Failed to fetch')
    || err?.message?.includes('NetworkError')
    || err?.message?.includes('Превышено время ожидания')
    || err?.message?.includes('Ошибка сервера (502)')
    || err?.message?.includes('Ошибка сервера (503)')
    || err?.message?.includes('Ошибка сервера (504)');
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Превышено время ожидания ответа сервера');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('spreadsheet') || ct.includes('octet-stream')) {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка загрузки файла');
    }
    return res.blob();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || `Ошибка сервера (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function notifyQueueChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-queue-changed'));
  }
}

async function queuePhoto(taskId, file, photoType) {
  const blobUrl = URL.createObjectURL(file);
  await enqueue({
    op: 'upload_photo',
    taskId,
    photoType,
    blobUrl,
    fileName: file.name,
  });
  const photo = {
    id: `offline-${Date.now()}`,
    photo_type: photoType,
    url: blobUrl,
    offline: true,
    cv_detected: null,
    filename: file.name,
  };
  await addPendingPhotoToCache(taskId, photo);
  notifyQueueChange();
  return { ...photo, cv_pending: false, offline_queued: true };
}

export const api = {
  _requestOnline: request,

  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: async () => {
    try {
      const u = await request('/auth/me');
      localStorage.setItem('offline_user', JSON.stringify(u));
      return u;
    } catch (err) {
      const cached = localStorage.getItem('offline_user');
      if (cached && (!navigator.onLine || isNetworkError(err))) {
        return JSON.parse(cached);
      }
      throw err;
    }
  },

  getUsers: (role) => request(`/users${role ? `?role=${role}` : ''}`),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  getAtms: () => request('/atms'),
  createAtm: (data) => request('/atms', { method: 'POST', body: JSON.stringify(data) }),
  updateAtm: (id, data) => request(`/atms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getTasks: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const cacheKey = q || '_all';
    try {
      const data = await request(`/tasks${q ? `?${q}` : ''}`);
      void cacheTasks(cacheKey, data).catch(() => {});
      return data;
    } catch (err) {
      try {
        const cached = await getCachedTasks(cacheKey);
        if (cached) return cached;
      } catch {
        /* ignore IDB errors */
      }
      throw err;
    }
  },

  getStats: async () => {
    try {
      return await request('/tasks/stats');
    } catch (err) {
      if (!navigator.onLine || isNetworkError(err)) return null;
      throw err;
    }
  },

  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),

  updateTask: async (id, data) => {
    const applyOffline = async () => {
      await enqueue({ op: 'patch_task', taskId: id, body: data });
      await patchCachedTask(id, data);
      notifyQueueChange();
      return { id, ...data, offline: true };
    };
    if (!navigator.onLine) return applyOffline();
    try {
      return await request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    } catch (err) {
      if (isNetworkError(err)) return applyOffline();
      throw err;
    }
  },

  cancelTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  exportTasks: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    const blob = await request(`/tasks/export${q ? `?${q}` : ''}`);
    downloadBlob(blob, `otchet-uborka-${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  downloadImportTemplate: async () => {
    const blob = await request('/tasks/import-template');
    downloadBlob(blob, 'shablon-zadaniy.xlsx');
  },

  importTasks: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/tasks/import', { method: 'POST', body: fd });
  },

  getPhotos: async (taskId) => {
    try {
      const data = await request(`/photos/${taskId}`);
      void cachePhotos(taskId, data).catch(() => {});
      return data;
    } catch (err) {
      try {
        const cached = await getCachedPhotos(taskId);
        if (cached) return cached;
      } catch {
        /* ignore IDB errors */
      }
      if (!navigator.onLine || isNetworkError(err)) return [];
      throw err;
    }
  },

  uploadPhoto: async (taskId, file, photoType) => {
    const upload = () => {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('photo_type', photoType);
      return request(`/photos/${taskId}`, { method: 'POST', body: fd });
    };
    if (!navigator.onLine) return queuePhoto(taskId, file, photoType);
    try {
      return await upload();
    } catch (err) {
      if (isNetworkError(err)) return queuePhoto(taskId, file, photoType);
      throw err;
    }
  },

  deletePhoto: (taskId, photoId) => request(`/photos/${taskId}/${photoId}`, { method: 'DELETE' }),

  getVapidKey: () => request('/notifications/vapid-public-key'),
  subscribePush: (data) => request('/notifications/subscribe', { method: 'POST', body: JSON.stringify(data) }),
  unsubscribePush: (data) => request('/notifications/subscribe', { method: 'DELETE', body: JSON.stringify(data) }),
  getPendingAlerts: () => request('/notifications/pending'),

  getCvSettings: () => request('/settings/cv'),

  getCvStatus: async () => {
    try {
      const data = await request('/settings/cv/status');
      void setMeta('cv_enabled', data.enabled).catch(() => {});
      return data;
    } catch (err) {
      try {
        const cached = await getMeta('cv_enabled');
        if (cached !== undefined) return { enabled: !!cached };
      } catch {
        /* ignore IDB errors */
      }
      if (!navigator.onLine || isNetworkError(err)) return { enabled: true };
      throw err;
    }
  },

  updateCvSettings: (data) => request('/settings/cv', { method: 'PATCH', body: JSON.stringify(data) }),
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
