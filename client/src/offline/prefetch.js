import { api } from '../api.js';
import { cacheTasks, getCacheStats } from './store.js';
import { isNetworkOnline } from './mode.js';

/**
 * Загружает актуальные данные с сервера в IndexedDB перед включением офлайн-режима.
 */
export async function prefetchOfflineData() {
  if (!isNetworkOnline()) {
    return getCacheStats();
  }

  const data = await api._requestOnline('/tasks');
  await cacheTasks('_all', data);

  try {
    await api.getCvStatus();
  } catch {
    /* CV status optional for prefetch */
  }

  return getCacheStats();
}
