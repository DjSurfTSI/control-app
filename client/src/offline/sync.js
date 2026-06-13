import { api } from '../api';
import {
  getQueue,
  removeQueueItem,
  cachePhotos,
  getCachedPhotos,
} from './store.js';

let syncing = false;

function notifySyncEvents(result) {
  window.dispatchEvent(new CustomEvent('offline-queue-changed'));
  if (result.synced > 0) {
    window.dispatchEvent(new CustomEvent('offline-synced', { detail: result }));
  }
}

async function blobFromQueueItem(item) {
  if (item.blobData) {
    return new Blob([item.blobData], { type: item.mimeType || 'image/jpeg' });
  }
  if (item.blobUrl) {
    const res = await fetch(item.blobUrl);
    if (!res.ok) throw new Error('Файл фото недоступен');
    return res.blob();
  }
  throw new Error('Нет данных фото в очереди');
}

export async function flushOfflineQueue() {
  if (syncing) return { synced: 0, failed: 0, skipped: true };
  if (!navigator.onLine) return { synced: 0, failed: 0, error: 'Нет подключения к интернету' };

  syncing = true;
  let synced = 0;
  let failed = 0;
  const errors = [];

  try {
    const queue = await getQueue();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    for (const item of queue) {
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
          if (item.blobUrl?.startsWith('blob:')) URL.revokeObjectURL(item.blobUrl);
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
        if (!navigator.onLine) break;
      }
    }
  } finally {
    syncing = false;
  }

  const result = { synced, failed, errors };
  notifySyncEvents(result);
  return result;
}

export function setupAutoSync(onSynced) {
  const run = async () => {
    const result = await flushOfflineQueue();
    if (result.synced > 0 && onSynced) onSynced(result);
  };

  const onOnline = () => { run(); };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) run();
  });

  if (navigator.onLine) setTimeout(run, 2000);

  return () => window.removeEventListener('online', onOnline);
}
