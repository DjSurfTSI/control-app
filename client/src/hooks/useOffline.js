import { useEffect, useState, useCallback, useRef } from 'react';
import { flushOfflineQueue } from '../offline/sync.js';
import { getQueueCount, getCacheStats } from '../offline/store.js';
import { prefetchOfflineData } from '../offline/prefetch.js';
import {
  isManualOfflineMode,
  isNetworkOnline,
  isEffectiveOffline,
  setManualOfflineMode,
} from '../offline/mode.js';

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

async function autoSyncWithRetry(maxAttempts = 6) {
  let lastResult = { synced: 0, failed: 0 };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!isNetworkOnline()) break;
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
    const pending = await getQueueCount().catch(() => 0);
    if (pending === 0) break;

    lastResult = await flushOfflineQueue();
    await new Promise((r) => setTimeout(r, 300));

    const remaining = await getQueueCount().catch(() => 0);
    if (remaining === 0 || lastResult.synced > 0) break;
    if (lastResult.failed > 0 && attempt >= maxAttempts - 1) break;
  }
  return lastResult;
}

const EMPTY_CACHE = { taskCount: 0, photoTaskCount: 0, queueSize: 0, cachedAt: null };

let sharedState = {
  networkOnline: isNetworkOnline(),
  manualOffline: isManualOfflineMode(),
  pending: 0,
  syncing: false,
  caching: false,
  cacheStats: EMPTY_CACHE,
  lastSyncMessage: '',
};

const subscribers = new Set();
let listenersBound = false;
let autoSyncingRef = false;

function notify() {
  subscribers.forEach((fn) => fn());
}

function patchState(patch) {
  sharedState = { ...sharedState, ...patch };
  notify();
}

async function refreshCacheStatsShared() {
  const stats = await getCacheStats();
  patchState({ cacheStats: stats, pending: stats.queueSize });
  return stats;
}

async function runSyncShared({ manual = false, retry = false } = {}) {
  if (!isNetworkOnline()) {
    const msg = 'Нет подключения к интернету';
    if (manual) patchState({ lastSyncMessage: msg });
    return { synced: 0, failed: 0, error: msg };
  }

  patchState({ syncing: true });
  try {
    const result = retry || !manual
      ? await autoSyncWithRetry(manual ? 3 : 5)
      : await flushOfflineQueue();

    await refreshCacheStatsShared();

    const msg = formatSyncMessage(result);
    if (manual) {
      patchState({
        lastSyncMessage: msg || (sharedState.pending > 0
          ? 'Не удалось синхронизировать. Повторите позже.'
          : 'Очередь пуста'),
      });
    } else if (msg) {
      patchState({ lastSyncMessage: msg });
    }

    return result;
  } finally {
    patchState({ syncing: false });
  }
}

async function toggleOfflineModeShared() {
  const enabling = !sharedState.manualOffline;
  if (enabling) {
    patchState({ caching: true, lastSyncMessage: '' });
    try {
      const stats = await prefetchOfflineData();
      setManualOfflineMode(true);
      patchState({
        manualOffline: true,
        cacheStats: stats,
        pending: stats.queueSize,
        lastSyncMessage: stats.taskCount > 0
          ? `Кэш обновлён: ${stats.taskCount} заявок`
          : 'Офлайн-режим включён. Кэш пуст — обновите список при наличии сети.',
      });
    } catch (err) {
      setManualOfflineMode(true);
      patchState({
        manualOffline: true,
        lastSyncMessage: err.message || 'Не удалось обновить кэш',
      });
      await refreshCacheStatsShared();
    } finally {
      patchState({ caching: false });
    }
    return;
  }

  setManualOfflineMode(false);
  patchState({ manualOffline: false, lastSyncMessage: 'Офлайн-режим выключен' });
  if (isNetworkOnline()) {
    await runSyncShared({ manual: true, retry: true });
  }
}

function bindGlobalListeners() {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  const triggerAutoSync = async () => {
    if (autoSyncingRef || isManualOfflineMode()) return;
    autoSyncingRef = true;
    try {
      await runSyncShared({ manual: false, retry: true });
    } finally {
      autoSyncingRef = false;
    }
  };

  window.addEventListener('online', () => {
    patchState({ networkOnline: true });
    triggerAutoSync();
  });
  window.addEventListener('offline', () => patchState({ networkOnline: false }));
  window.addEventListener('offline-mode-changed', (e) => {
    patchState({ manualOffline: !!e.detail?.enabled });
  });
  window.addEventListener('offline-queue-changed', async () => {
    try {
      patchState({ pending: await getQueueCount() });
    } catch {
      patchState({ pending: 0 });
    }
  });
  window.addEventListener('offline-synced', () => { refreshCacheStatsShared(); });

  refreshCacheStatsShared();
  if (isNetworkOnline() && !isManualOfflineMode()) triggerAutoSync();
  setInterval(() => { refreshCacheStatsShared(); }, 15000);
}

export function useOffline() {
  const [, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    bindGlobalListeners();
    subscribers.add(reload);
    return () => subscribers.delete(reload);
  }, [reload]);

  const networkOnline = sharedState.networkOnline;
  const manualOffline = sharedState.manualOffline;

  return {
    online: networkOnline && !manualOffline,
    networkOnline,
    manualOffline,
    effectiveOffline: isEffectiveOffline(),
    pending: sharedState.pending,
    syncing: sharedState.syncing,
    caching: sharedState.caching,
    cacheStats: sharedState.cacheStats,
    syncNow: () => runSyncShared({ manual: true, retry: true }),
    toggleOfflineMode: toggleOfflineModeShared,
    refreshPending: async () => {
      try {
        patchState({ pending: await getQueueCount() });
      } catch {
        patchState({ pending: 0 });
      }
    },
    refreshCacheStats: refreshCacheStatsShared,
    lastSyncMessage: sharedState.lastSyncMessage,
  };
}
