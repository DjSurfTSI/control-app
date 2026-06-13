import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

let cachedEnabled = null;
const subscribers = new Set();

export function invalidateCvStatus() {
  cachedEnabled = null;
  subscribers.forEach((fn) => fn());
}

export function useCvStatus() {
  const [cvEnabled, setCvEnabled] = useState(cachedEnabled ?? true);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    subscribers.add(reload);
    return () => subscribers.delete(reload);
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cachedEnabled !== null && tick === 0) {
        setCvEnabled(cachedEnabled);
        return;
      }
      setLoading(true);
      try {
        const data = await api.getCvStatus();
        if (!cancelled) {
          cachedEnabled = data.enabled;
          setCvEnabled(data.enabled);
        }
      } catch {
        if (!cancelled && cachedEnabled === null) setCvEnabled(true);
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return { cvEnabled, loading };
}
