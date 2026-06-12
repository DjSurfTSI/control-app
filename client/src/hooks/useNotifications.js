import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function useNotifications(enabled) {
  const [alerts, setAlerts] = useState([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await api.getPendingAlerts();
      setAlerts(data);
      for (const alert of data) {
        if (Notification.permission === 'granted' && alert.type === 'warning') {
          new Notification('Контроль уборки', { body: alert.message, icon: '/icon.svg' });
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 120000);
    return () => clearInterval(interval);
  }, [enabled, fetchAlerts]);

  const enablePush = async () => {
    setPushLoading(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push-уведомления не поддерживаются браузером');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Разрешение на уведомления не получено');
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const { publicKey } = await api.getVapidKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = sub.toJSON();
      await api.subscribePush({
        endpoint: json.endpoint,
        keys: json.keys,
      });

      setPushEnabled(true);
      return true;
    } catch (err) {
      throw err;
    } finally {
      setPushLoading(false);
    }
  };

  const disablePush = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await api.unsubscribePush({ endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setPushEnabled(false);
  };

  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => setPushEnabled(!!sub));
    });
  }, [enabled]);

  return { alerts, pushEnabled, pushLoading, enablePush, disablePush, fetchAlerts };
}
