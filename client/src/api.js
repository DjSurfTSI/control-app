const API = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });

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

export const api = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: () => request('/auth/me'),

  getUsers: (role) => request(`/users${role ? `?role=${role}` : ''}`),
  createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  getAtms: () => request('/atms'),
  createAtm: (data) => request('/atms', { method: 'POST', body: JSON.stringify(data) }),
  updateAtm: (id, data) => request(`/atms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getTasks: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/tasks${q ? `?${q}` : ''}`);
  },
  getStats: () => request('/tasks/stats'),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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

  getPhotos: (taskId) => request(`/photos/${taskId}`),
  uploadPhoto: (taskId, file, photoType) => {
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('photo_type', photoType);
    return request(`/photos/${taskId}`, { method: 'POST', body: fd });
  },
  deletePhoto: (taskId, photoId) => request(`/photos/${taskId}/${photoId}`, { method: 'DELETE' }),

  getVapidKey: () => request('/notifications/vapid-public-key'),
  subscribePush: (data) => request('/notifications/subscribe', { method: 'POST', body: JSON.stringify(data) }),
  unsubscribePush: (data) => request('/notifications/subscribe', { method: 'DELETE', body: JSON.stringify(data) }),
  getPendingAlerts: () => request('/notifications/pending'),

  getCvSettings: () => request('/settings/cv'),
  getCvStatus: () => request('/settings/cv/status'),
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
