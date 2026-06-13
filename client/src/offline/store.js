const DB_NAME = 'atm-offline';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
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
    };
  });
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheTasks(key, tasks) {
  const db = await openDb();
  const tx = db.transaction('tasks_cache', 'readwrite');
  tx.objectStore('tasks_cache').put({ tasks, at: Date.now() }, key);
  return idbRequest(tx);
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
  return idbRequest(tx);
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
  return idbRequest(tx);
}

export async function getMeta(key) {
  const db = await openDb();
  return idbRequest(db.transaction('meta', 'readonly').objectStore('meta').get(key));
}

export async function enqueue(item) {
  const db = await openDb();
  return idbRequest(
    db.transaction('queue', 'readwrite').objectStore('queue').add({ ...item, createdAt: Date.now() })
  );
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
  return idbRequest(tx);
}

export async function getQueueCount() {
  const db = await openDb();
  return idbRequest(db.transaction('queue', 'readonly').objectStore('queue').count());
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
