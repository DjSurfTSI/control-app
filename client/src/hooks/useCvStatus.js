import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { isCvEnabledForUser } from '../utils';

let cachedStatus = null;
const subscribers = new Set();

export function invalidateCvStatus() {
  cachedStatus = null;
  subscribers.forEach((fn) => fn());
}

export function useCvStatus() {
  const { user } = useAuth();
  const [cvEnabledGlobal, setCvEnabledGlobal] = useState(cachedStatus?.enabled ?? true);
  const [cvRoles, setCvRoles] = useState(cachedStatus?.cv_roles ?? ['executor']);
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
        setCvEnabledGlobal(cachedStatus.enabled);
        setCvRoles(cachedStatus.cv_roles);
        setExecutorMobileCameraCapture(cachedStatus.executor_mobile_camera_capture);
        return;
      }
      setLoading(true);
      try {
        const data = await api.getCvStatus();
        if (!cancelled) {
          cachedStatus = {
            enabled: data.enabled,
            cv_roles: data.cv_roles || ['executor'],
            executor_mobile_camera_capture: data.executor_mobile_camera_capture !== false,
          };
          setCvEnabledGlobal(cachedStatus.enabled);
          setCvRoles(cachedStatus.cv_roles);
          setExecutorMobileCameraCapture(cachedStatus.executor_mobile_camera_capture);
        }
      } catch {
        if (!cancelled && cachedStatus === null) {
          setCvEnabledGlobal(true);
          setCvRoles(['executor']);
          setExecutorMobileCameraCapture(true);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const cvEnabled = useMemo(
    () => isCvEnabledForUser({ enabled: cvEnabledGlobal, cv_roles: cvRoles }, user),
    [cvEnabledGlobal, cvRoles, user],
  );

  return {
    cvEnabled,
    cvEnabledGlobal,
    cvRoles,
    executorMobileCameraCapture,
    loading,
  };
}
