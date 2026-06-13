import { useEffect, useState, useCallback, useRef } from 'react';
import { flushOfflineQueue } from '../offline/sync.js';
import { getQueueCount } from '../offline/store.js';
import { api } from '../api';

function formatSyncMessage(result) {
  if (result.error) return result.error;
  if (result.synced > 0 && result.failed === 0) return `Отправлено: ${result.synced}`;
  if (result.synced > 0 && result.failed > 0) return `Отправлено: ${result.synced}, ошибок: ${result.failed}`;
  if (result.failed > 0) {
    const hint = result.errors?.[0] || 'Проверьте сеть или переснимите фото';
    return `Не удалось отправить (${result.failed}). ${hint}`;
  }
  return '';
}

async function autoSyncWithRetry(maxAttempts = 5) {
  let lastResult = { synced: 0, failed: 0 };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!navigator.onLine) break;
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    lastResult = await flushOfflineQueue();
    if (lastResult.synced > 0 || lastResult.failed > 0) break;
    const pending = await getQueueCount().catch(() => 0);
    if (pending === 0) break;
    try {
      await api._requestOnline('/auth/me');
      lastResult = await flushOfflineQueue();
      break;
    } catch {
      /* server not ready yet */
    }
  }
  return lastResult;
}

export function useOffline() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState('');
  const autoSyncingRef = useRef(false);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await getQueueCount());
    } catch {
      setPending(0);
    }
  }, []);

  const runSync = useCallback(async ({ manual = false, retry = false } = {}) => {
    if (!navigator.onLine) {
      const msg = 'Нет подключения к интернету';
      if (manual) setLastSyncMessage(msg);
      return { synced: 0, failed: 0, error: msg };
    }

    setSyncing(true);
    try {
      const result = retry || !manual
        ? await autoSyncWithRetry(manual ? 3 : 5)
        : await flushOfflineQueue();

      await refreshPending();
      const remaining = await getQueueCount().catch(() => 0);

      const msg = formatSyncMessage(result);
      if (manual) {
        setLastSyncMessage(msg || (remaining > 0 ? 'Не удалось синхронизировать. Повторите позже.' : 'Очередь пуста'));
      } else if (msg) {
        setLastSyncMessage(msg);
      }

      return result;
    } finally {
      setSyncing(false);
    }
  }, [refreshPending]);

  const syncNow = useCallback(() => runSync({ manual: true }), [runSync]);

  useEffect(() => {
    const triggerAutoSync = async () => {
      if (autoSyncingRef.current) return;
      autoSyncingRef.current = true;
      try {
        await runSync({ manual: false, retry: true });
      } finally {
        autoSyncingRef.current = false;
      }
    };

    const onOnline = () => {
      setOnline(true);
      triggerAutoSync();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('offline-queue-changed', refreshPending);
    window.addEventListener('offline-synced', refreshPending);
    refreshPending();

    if (navigator.onLine) triggerAutoSync();

    const interval = setInterval(refreshPending, 10000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('offline-queue-changed', refreshPending);
      window.removeEventListener('offline-synced', refreshPending);
      clearInterval(interval);
    };
  }, [runSync, refreshPending]);

  return { online, pending, syncing, syncNow, refreshPending, lastSyncMessage };
}
