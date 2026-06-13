import { api } from '../api';
import {
  getQueue,
  removeQueueItem,
  cachePhotos,
  getCachedPhotos,
} from './store.js';

let syncing = false;

export function isSyncing() {
  return syncing;
}

export async function flushOfflineQueue() {
  if (syncing || !navigator.onLine) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const queue = await getQueue();
    for (const item of queue) {
      try {
        if (item.op === 'patch_task') {
          await api._requestOnline(`/tasks/${item.taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(item.body),
          });
        } else if (item.op === 'upload_photo') {
          const blob = await fetch(item.blobUrl).then((r) => r.blob());
          const file = new File([blob], item.fileName || 'photo.jpg', { type: 'image/jpeg' });
          const result = await api._requestOnline(`/photos/${item.taskId}`, {
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
          await cachePhotos(item.taskId, photos);
          void result;
        }
        await removeQueueItem(item.id);
        synced += 1;
      } catch (err) {
        console.warn('Offline sync item failed:', item.op, err.message);
        failed += 1;
        if (!navigator.onLine) break;
      }
    }
  } finally {
    syncing = false;
  }

  return { synced, failed };
}

export function setupAutoSync(onSynced) {
  const run = async () => {
    const result = await flushOfflineQueue();
    if (result.synced > 0 && onSynced) onSynced(result);
  };

  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) run();
  });

  if (navigator.onLine) setTimeout(run, 2000);

  return () => window.removeEventListener('online', run);
}
