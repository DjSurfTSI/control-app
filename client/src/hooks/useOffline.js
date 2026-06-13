import { useEffect, useState, useCallback } from 'react';
import { flushOfflineQueue } from '../offline/sync.js';
import { getQueueCount } from '../offline/store.js';

export function useOffline() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await getQueueCount());
    } catch {
      setPending(0);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return null;
    setSyncing(true);
    try {
      const result = await flushOfflineQueue();
      await refreshPending();
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

  return { online, pending, syncing, syncNow, refreshPending };
}
