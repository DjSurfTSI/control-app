import { setupAutoSync } from './sync.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return () => {};

  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.warn('SW register failed:', err.message);
  });

  return setupAutoSync(() => {
    window.dispatchEvent(new CustomEvent('offline-synced'));
  });
}
