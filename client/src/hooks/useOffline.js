import { useEffect, useState, useCallback } from 'react';
import { flushOfflineQueue } from '../offline/sync.js';
import { getQueueCount } from '../offline/store.js';
import { api } from '../api';

async function canReachApi() {
  try {
    await api._requestOnline('/auth/me');
    return true;
  } catch {
    return false;
  }
}

export function useOffline() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState('');

  const refreshPending = useCallback(async () => {
    try {
      setPending(await getQueueCount());
    } catch {
      setPending(0);
    }
  }, []);

  const syncNow = useCallback(async () => {
    setLastSyncMessage('');
    if (!navigator.onLine) {
      const msg = 'Нет подключения к интернету';
      setLastSyncMessage(msg);
      return { synced: 0, failed: 0, error: msg };
    }

    setSyncing(true);
    try {
      const reachable = await canReachApi();
      if (!reachable) {
        const msg = 'Сервер недоступен. Проверьте сеть и повторите.';
        setLastSyncMessage(msg);
        return { synced: 0, failed: 0, error: msg };
      }

      const result = await flushOfflineQueue();
      await refreshPending();

      if (result.skipped) {
        setLastSyncMessage('Синхронизация уже выполняется…');
      } else if (result.error) {
        setLastSyncMessage(result.error);
      } else if (result.synced > 0 && result.failed === 0) {
        setLastSyncMessage(`Отправлено: ${result.synced}`);
      } else if (result.synced > 0 && result.failed > 0) {
        setLastSyncMessage(`Отправлено: ${result.synced}, ошибок: ${result.failed}`);
      } else if (result.failed > 0) {
        const hint = result.errors?.[0] || 'Проверьте сеть или переснимите фото';
        setLastSyncMessage(`Не удалось отправить (${result.failed}). ${hint}`);
      } else {
        setLastSyncMessage('Очередь пуста');
      }

      return result;
    } finally {
      setSyncing(false);
    }
  }, [refreshPending]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      syncNow();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('offline-queue-changed', refreshPending);
    window.addEventListener('offline-synced', refreshPending);
    refreshPending();
    const interval = setInterval(refreshPending, 10000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('offline-queue-changed', refreshPending);
      window.removeEventListener('offline-synced', refreshPending);
      clearInterval(interval);
    };
  }, [syncNow, refreshPending]);

  return { online, pending, syncing, syncNow, refreshPending, lastSyncMessage };
}
