import { api } from '../api.js';
import { isNetworkOnline } from './mode.js';
import {
  getQueue,
  removeQueueItem,
  cachePhotos,
  getPhotoBlob,
} from './store.js';

let syncPromise = null;

function notifySyncEvents(result) {
  window.dispatchEvent(new CustomEvent('offline-queue-changed'));
  if (result.synced > 0 || result.failed > 0) {
    window.dispatchEvent(new CustomEvent('offline-synced', { detail: result }));
  }
}

async function blobFromQueueItem(item) {
  const stored = await getPhotoBlob(item.id);
  if (stored?.data) {
    return new Blob([stored.data], { type: stored.mimeType || item.mimeType || 'image/jpeg' });
  }
  if (item.blobData) {
    return new Blob([item.blobData], { type: item.mimeType || 'image/jpeg' });
  }
  if (item.blobUrl) {
    const res = await fetch(item.blobUrl);
    if (!res.ok) throw new Error('Файл фото недоступен — переснимите');
    return res.blob();
  }
  throw new Error('Нет данных фото в очереди — переснимите');
}

async function runFlush() {
  if (!isNetworkOnline()) return { synced: 0, failed: 0, error: 'Нет подключения к интернету' };

  let synced = 0;
  let failed = 0;
  const errors = [];

  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const sorted = [...queue].sort((a, b) => {
    const priority = { upload_photo: 0, delete_photo: 0, patch_task: 1 };
    return (priority[a.op] ?? 2) - (priority[b.op] ?? 2);
  });

  for (const item of sorted) {
    try {
      if (item.op === 'patch_task') {
        await api._requestOnline(`/tasks/${item.taskId}`, {
          method: 'PATCH',
          body: JSON.stringify(item.body),
        });
      } else if (item.op === 'upload_photo') {
        const blob = await blobFromQueueItem(item);
        const file = new File([blob], item.fileName || 'photo.jpg', { type: item.mimeType || 'image/jpeg' });
        await api._requestOnline(`/photos/${item.taskId}`, {
          method: 'POST',
          body: (() => {
            const fd = new FormData();
            fd.append('photo', file);
            fd.append('photo_type', item.photoType);
            return fd;
          })(),
        });
        if (item.blobUrl?.startsWith('blob:')) {
          try { URL.revokeObjectURL(item.blobUrl); } catch { /* ignore */ }
        }
        const photos = await api._requestOnline(`/photos/${item.taskId}`);
        void cachePhotos(item.taskId, photos).catch(() => {});
      } else if (item.op === 'delete_photo') {
        await api._requestOnline(`/photos/${item.taskId}/${item.photoId}`, { method: 'DELETE' });
        const photos = await api._requestOnline(`/photos/${item.taskId}`);
        void cachePhotos(item.taskId, photos).catch(() => {});
      } else {
        throw new Error(`Неизвестная операция: ${item.op}`);
      }
      await removeQueueItem(item.id);
      synced += 1;
    } catch (err) {
      const msg = err.message || 'Ошибка синхронизации';
      console.warn('Offline sync item failed:', item.op, msg);
      errors.push(msg);
      failed += 1;
      if (!isNetworkOnline()) break;
    }
  }

  return { synced, failed, errors };
}

export async function flushOfflineQueue() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    try {
      const result = await runFlush();
      notifySyncEvents(result);
      return result;
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

export function setupAutoSync(onSynced) {
  const run = async () => {
    const result = await flushOfflineQueue();
    if (result.synced > 0 && onSynced) onSynced(result);
  };

  const onOnline = () => { run(); };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isNetworkOnline()) run();
  });

  if (isNetworkOnline()) setTimeout(run, 2000);

  return () => window.removeEventListener('online', onOnline);
}
