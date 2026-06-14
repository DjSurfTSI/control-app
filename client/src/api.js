import {
  cacheTasks,
  getCachedTasks,
  enqueue,
  patchCachedTask,
  removeCachedTask,
  cachePhotos,
  getCachedPhotos,
  addPendingPhotoToCache,
  savePhotoBlob,
  getMergedPhotosForTask,
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
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const headers = { ...fetchOptions.headers };
  if (!(fetchOptions.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...fetchOptions,
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
  const blobData = await file.arrayBuffer();
  const normalizedTaskId = Number(taskId);

  const queueId = await enqueue({
    op: 'upload_photo',
    taskId: normalizedTaskId,
    photoType,
    blobUrl,
    mimeType: file.type || 'image/jpeg',
    fileName: file.name || 'photo.jpg',
  });

  await savePhotoBlob(queueId, blobData, file.type || 'image/jpeg');

  const photo = {
    id: `offline-${queueId}`,
    photo_type: photoType,
    url: blobUrl,
    offline: true,
    cv_detected: null,
    filename: file.name || 'photo.jpg',
  };

  try {
    await addPendingPhotoToCache(normalizedTaskId, photo);
  } catch {
    /* merged read will use queue */
  }
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

  getUsers: (role) => request(`/users${role ? `?role=${role === 'cleaner' ? 'executor' : role}` : ''}`),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  downloadUsersTemplate: async () => {
    const blob = await request('/users/import-template');
    downloadBlob(blob, 'shablon-sotrudniki.xlsx');
  },
  importUsers: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/users/import', { method: 'POST', body: fd });
  },

  getAtms: () => request('/atms'),
  createAtm: (data) => request('/atms', { method: 'POST', body: JSON.stringify(data) }),
  updateAtm: (id, data) => request(`/atms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  downloadAtmsTemplate: async () => {
    const blob = await request('/atms/import-template');
    downloadBlob(blob, 'shablon-us.xlsx');
  },
  importAtms: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/atms/import', { method: 'POST', body: fd });
  },

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
      await enqueue({ op: 'patch_task', taskId: Number(id), body: data });
      await patchCachedTask(id, data);
      notifyQueueChange();
      return { id, ...data, offline: true };
    };
    if (!navigator.onLine) return applyOffline();
    try {
      return await request(`/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
        timeoutMs: data.status === 'completed' ? 120000 : REQUEST_TIMEOUT_MS,
      });
    } catch (err) {
      if (isNetworkError(err)) return applyOffline();
      throw err;
    }
  },

  assignSelf: (id) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ assign_self: true }) }),

  cancelTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  deleteTask: async (id) => {
    const result = await request(`/tasks/${id}/permanent`, { method: 'DELETE' });
    await removeCachedTask(id).catch(() => {});
    return result;
  },

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
    const merged = async () => getMergedPhotosForTask(taskId);

    if (!navigator.onLine) {
      return merged();
    }

    try {
      const data = await request(`/photos/${taskId}`);
      void cachePhotos(taskId, data).catch(() => {});
      const queued = await merged();
      if (queued.length === 0) return data;
      const byType = new Map(data.map((p) => [p.photo_type, p]));
      queued.forEach((p) => {
        if (!p.offline) return;
        const server = byType.get(p.photo_type);
        if (!server || String(server.id).startsWith('offline')) {
          byType.set(p.photo_type, p);
        }
      });
      return Array.from(byType.values());
    } catch (err) {
      const fallback = await merged();
      if (fallback.length > 0) return fallback;
      if (isNetworkError(err)) return [];
      throw err;
    }
  },

  uploadPhoto: async (taskId, file, photoType, { preferOffline = false } = {}) => {
    const upload = () => {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('photo_type', photoType);
      return request(`/photos/${taskId}`, { method: 'POST', body: fd, timeoutMs: 120000 });
    };
    if (preferOffline || !navigator.onLine) return queuePhoto(taskId, file, photoType);
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
      if (!navigator.onLine || isNetworkError(err)) {
        return {
          enabled: true,
          executor_mobile_camera_capture: true,
        };
      }
      throw err;
    }
  },

  updateCvSettings: (data) => request('/settings/cv', { method: 'PATCH', body: JSON.stringify(data) }),

  getWorkspace: () => request('/workspace'),
  updateWorkspace: (config) => request('/workspace', { method: 'PUT', body: JSON.stringify({ config }) }),
  resetWorkspace: () => request('/workspace/reset', { method: 'POST' }),

  getReferenceDirectories: () => request('/reference'),
  getReferenceDirectoriesManage: () => request('/reference/manage'),
  createReferenceEntry: (data) => request('/reference', { method: 'POST', body: JSON.stringify(data) }),
  updateReferenceEntry: (id, data) => request(`/reference/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteReferenceEntry: (id) => request(`/reference/${id}`, { method: 'DELETE' }),
};

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
