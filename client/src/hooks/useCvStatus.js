import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';

let cachedStatus = null;
const subscribers = new Set();

export function invalidateCvStatus() {
  cachedStatus = null;
  subscribers.forEach((fn) => fn());
}

export function useCvStatus() {
  const [cvEnabled, setCvEnabled] = useState(cachedStatus?.enabled ?? true);
  const [executorMobileCameraCapture, setExecutorMobileCameraCapture] = useState(
    cachedStatus?.executor_mobile_camera_capture ?? true,
  );
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
      if (cachedStatus !== null && tick === 0) {
        setCvEnabled(cachedStatus.enabled);
        setExecutorMobileCameraCapture(cachedStatus.executor_mobile_camera_capture);
        return;
      }
      setLoading(true);
      try {
        const data = await api.getCvStatus();
        if (!cancelled) {
          cachedStatus = {
            enabled: data.enabled,
            executor_mobile_camera_capture: data.executor_mobile_camera_capture !== false,
          };
          setCvEnabled(cachedStatus.enabled);
          setExecutorMobileCameraCapture(cachedStatus.executor_mobile_camera_capture);
        }
      } catch {
        if (!cancelled && cachedStatus === null) {
          setCvEnabled(true);
          setExecutorMobileCameraCapture(true);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return { cvEnabled, executorMobileCameraCapture, loading };
}
