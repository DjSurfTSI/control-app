/** Телефон/планшет — не зависит от ширины экрана (ландшафт не отключает mobile). */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  if (navigator.userAgentData?.mobile) return true;

  return window.matchMedia('(pointer: coarse)').matches;
}
