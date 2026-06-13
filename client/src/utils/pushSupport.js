export class PushSupportError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PushSupportError';
    this.code = code;
  }
}

export function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    throw new PushSupportError(
      'Service Worker не поддерживается в этом браузере',
      'no-sw',
    );
  }

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

export async function assertPushSupported() {
  if (!window.isSecureContext) {
    throw new PushSupportError(
      'Push-уведомления работают только по HTTPS. Откройте сайт по защищённому адресу (https://…), не по IP и не http://.',
      'insecure',
    );
  }

  if (!('Notification' in window)) {
    throw new PushSupportError(
      'Уведомления не поддерживаются в этом браузере',
      'no-notification',
    );
  }

  const ios = isIosDevice();
  const standalone = isStandalonePwa();

  if (ios && !standalone) {
    throw new PushSupportError(
      'На iPhone/iPad: установите приложение на главный экран (Поделиться → «На экран Домой»), откройте его оттуда и снова нажмите Push.',
      'ios-not-standalone',
    );
  }

  const reg = await getServiceWorkerRegistration();

  if (!reg.pushManager) {
    if (ios) {
      throw new PushSupportError(
        'Push недоступен: нужен iOS/iPadOS 16.4 или новее и запуск с главного экрана (не из вкладки Safari или Chrome).',
        'ios-no-push-manager',
      );
    }
    throw new PushSupportError(
      'Push-уведомления не поддерживаются в этом браузере. Используйте Chrome, Firefox, Edge или Safari 16+.',
      'no-push-manager',
    );
  }

  return reg;
}
