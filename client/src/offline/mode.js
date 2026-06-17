const STORAGE_KEY = 'offline_mode_manual';

let manualOffline = false;

function readStored() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

manualOffline = readStored();

export function isManualOfflineMode() {
  return manualOffline;
}

export function isNetworkOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function isEffectiveOffline() {
  return !isNetworkOnline() || manualOffline;
}

export function setManualOfflineMode(enabled) {
  manualOffline = !!enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, manualOffline ? 'true' : 'false');
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-mode-changed', { detail: { enabled: manualOffline } }));
  }
}

export function toggleManualOfflineMode() {
  setManualOfflineMode(!manualOffline);
  return manualOffline;
}
