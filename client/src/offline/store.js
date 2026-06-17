const DB_NAME = 'atm-offline';
const DB_VERSION = 2;
const IDB_TIMEOUT_MS = 8000;

function withTimeout(promise, ms = IDB_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('IndexedDB timeout')), ms);
    }),
  ]);
}

function openDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  return withTimeout(new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('tasks_cache')) db.createObjectStore('tasks_cache');
      if (!db.objectStoreNames.contains('photos_cache')) db.createObjectStore('photos_cache');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('photo_blobs')) {
        db.createObjectStore('photo_blobs');
      }
    };
  }));
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheTasks(key, tasks) {
  const db = await openDb();
  const tx = db.transaction('tasks_cache', 'readwrite');
  tx.objectStore('tasks_cache').put({ tasks, at: Date.now() }, key);
  await txComplete(tx);
}

export async function getCachedTasks(key) {
  const db = await openDb();
  const row = await idbRequest(db.transaction('tasks_cache', 'readonly').objectStore('tasks_cache').get(key));
  return row?.tasks ?? null;
}

export async function cachePhotos(taskId, photos) {
  const db = await openDb();
  const tx = db.transaction('photos_cache', 'readwrite');
  tx.objectStore('photos_cache').put({ photos, at: Date.now() }, String(taskId));
  await txComplete(tx);
}

export async function getCachedPhotos(taskId) {
  const db = await openDb();
  const row = await idbRequest(
    db.transaction('photos_cache', 'readonly').objectStore('photos_cache').get(String(taskId))
  );
  return row?.photos ?? null;
}

export async function setMeta(key, value) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(value, key);
  await txComplete(tx);
}

export async function getMeta(key) {
  const db = await openDb();
  return idbRequest(db.transaction('meta', 'readonly').objectStore('meta').get(key));
}

export async function savePhotoBlob(queueId, data, mimeType) {
  const db = await openDb();
  const tx = db.transaction('photo_blobs', 'readwrite');
  tx.objectStore('photo_blobs').put({ data, mimeType, at: Date.now() }, String(queueId));
  await txComplete(tx);
}

export async function getPhotoBlob(queueId) {
  const db = await openDb();
  const row = await idbRequest(
    db.transaction('photo_blobs', 'readonly').objectStore('photo_blobs').get(String(queueId))
  );
  return row ?? null;
}

export async function deletePhotoBlob(queueId) {
  const db = await openDb();
  const tx = db.transaction('photo_blobs', 'readwrite');
  tx.objectStore('photo_blobs').delete(String(queueId));
  await txComplete(tx);
}

export async function enqueue(item) {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  const id = await idbRequest(tx.objectStore('queue').add({ ...item, createdAt: Date.now() }));
  await txComplete(tx);
  return id;
}

export async function getQueue() {
  const db = await openDb();
  const items = await idbRequest(
    db.transaction('queue', 'readonly').objectStore('queue').getAll()
  );
  return items.sort((a, b) => a.id - b.id);
}

export async function removeQueueItem(id) {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').delete(id);
  await txComplete(tx);
  await deletePhotoBlob(id).catch(() => {});
}

export async function getQueueCount() {
  const db = await openDb();
  return idbRequest(db.transaction('queue', 'readonly').objectStore('queue').count());
}

export async function removeCachedTask(taskId) {
  const db = await openDb();
  const id = String(taskId);
  await new Promise((resolve, reject) => {
    const tx = db.transaction('tasks_cache', 'readwrite');
    const store = tx.objectStore('tasks_cache');
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const keys = keysReq.result;
      const valsReq = store.getAll();
      valsReq.onsuccess = () => {
        valsReq.result.forEach((val, i) => {
          if (val?.tasks) {
            val.tasks = val.tasks.filter((t) => Number(t.id) !== Number(taskId));
            store.put(val, keys[i]);
          }
        });
      };
      valsReq.onerror = () => reject(valsReq.error);
    };
    keysReq.onerror = () => reject(keysReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const photosTx = db.transaction('photos_cache', 'readwrite');
  photosTx.objectStore('photos_cache').delete(id);
  await txComplete(photosTx);
}

export async function patchCachedTask(taskId, patch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks_cache', 'readwrite');
    const store = tx.objectStore('tasks_cache');
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const keys = keysReq.result;
      const valsReq = store.getAll();
      valsReq.onsuccess = () => {
        valsReq.result.forEach((val, i) => {
          if (val?.tasks) {
            val.tasks = val.tasks.map((t) => (
              Number(t.id) === Number(taskId) ? { ...t, ...patch } : t
            ));
            store.put(val, keys[i]);
          }
        });
      };
      valsReq.onerror = () => reject(valsReq.error);
    };
    keysReq.onerror = () => reject(keysReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addPendingPhotoToCache(taskId, photo) {
  const cached = (await getCachedPhotos(taskId)) || [];
  const filtered = cached.filter((p) => p.photo_type !== photo.photo_type);
  const next = [...filtered, photo];
  await cachePhotos(taskId, next);
  return next;
}

export async function removeCachedPhoto(taskId, { photoId, photoType } = {}) {
  const cached = (await getCachedPhotos(taskId)) || [];
  const next = cached.filter((p) => {
    if (photoId != null && (p.id === photoId || String(p.id) === String(photoId))) return false;
    if (photoType && p.photo_type === photoType) return false;
    return true;
  });
  await cachePhotos(taskId, next);
  return next;
}

export async function removeOfflineQueuedPhoto(taskId, queueId) {
  const queue = await getQueue();
  const item = queue.find((i) => i.id === queueId);
  if (item?.blobUrl?.startsWith('blob:')) {
    try { URL.revokeObjectURL(item.blobUrl); } catch { /* ignore */ }
  }
  previewUrlCache.delete(`${queueId}-${item?.photoType}`);
  await removeQueueItem(queueId);
  await removeCachedPhoto(taskId, { photoType: item?.photoType, photoId: `offline-${queueId}` });
}

export async function removeQueuedPhotosForType(taskId, photoType) {
  const queue = await getQueue();
  const items = queue.filter(
    (i) => i.op === 'upload_photo'
      && Number(i.taskId) === Number(taskId)
      && i.photoType === photoType
  );
  for (const item of items) {
    await removeOfflineQueuedPhoto(taskId, item.id);
  }
}

const previewUrlCache = new Map();

export async function getQueuePhotoPreview(item) {
  const cacheKey = `${item.id}-${item.photoType}`;
  if (previewUrlCache.has(cacheKey)) {
    return previewUrlCache.get(cacheKey);
  }

  let url = item.blobUrl;
  if (url) {
    try {
      const res = await fetch(url);
      if (!res.ok) url = null;
    } catch {
      url = null;
    }
  }

  if (!url) {
    const blob = await getPhotoBlob(item.id);
    if (blob?.data) {
      url = URL.createObjectURL(new Blob([blob.data], { type: blob.mimeType || 'image/jpeg' }));
    }
  }

  const preview = {
    id: `offline-${item.id}`,
    photo_type: item.photoType,
    url: url || '',
    offline: true,
    cv_detected: null,
    filename: item.fileName || 'photo.jpg',
  };

  if (url) previewUrlCache.set(cacheKey, preview);
  return preview;
}

export async function getMergedPhotosForTask(taskId) {
  const cached = (await getCachedPhotos(taskId).catch(() => null)) || [];
  const queue = await getQueue();
  const pendingItems = queue.filter(
    (i) => i.op === 'upload_photo' && Number(i.taskId) === Number(taskId)
  );

  const pendingPhotos = await Promise.all(pendingItems.map(getQueuePhotoPreview));
  const byType = new Map();

  cached.forEach((p) => {
    if (p?.photo_type) byType.set(p.photo_type, p);
  });
  pendingPhotos.forEach((p) => {
    if (p?.photo_type && p.url) byType.set(p.photo_type, p);
  });

  return Array.from(byType.values());
}
