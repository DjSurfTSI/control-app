import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { isCvEnabledForUser } from '../utils';

const PHOTO_MAX_EDGE_DEFAULT = 1280;
const PHOTO_JPEG_QUALITY_DEFAULT = 82;

let cachedStatus = null;
const subscribers = new Set();

export function invalidateCvStatus() {
  cachedStatus = null;
  subscribers.forEach((fn) => fn());
}

function applyCachedStatus(setters) {
  if (!cachedStatus) return;
  setters.setCvEnabledGlobal(cachedStatus.enabled);
  setters.setCvRoles(cachedStatus.cv_roles);
  setters.setExecutorMobileCameraCapture(cachedStatus.executor_mobile_camera_capture);
  setters.setExecutorPhotoMaxEdge(cachedStatus.executor_photo_max_edge);
  setters.setExecutorPhotoJpegQuality(cachedStatus.executor_photo_jpeg_quality);
  setters.setExecutorPhotoOverlay(cachedStatus.executor_photo_overlay);
}

export function useCvStatus() {
  const { user } = useAuth();
  const [cvEnabledGlobal, setCvEnabledGlobal] = useState(cachedStatus?.enabled ?? true);
  const [cvRoles, setCvRoles] = useState(cachedStatus?.cv_roles ?? ['executor']);
  const [executorMobileCameraCapture, setExecutorMobileCameraCapture] = useState(
    cachedStatus?.executor_mobile_camera_capture ?? true,
  );
  const [executorPhotoMaxEdge, setExecutorPhotoMaxEdge] = useState(
    cachedStatus?.executor_photo_max_edge ?? PHOTO_MAX_EDGE_DEFAULT,
  );
  const [executorPhotoJpegQuality, setExecutorPhotoJpegQuality] = useState(
    cachedStatus?.executor_photo_jpeg_quality ?? PHOTO_JPEG_QUALITY_DEFAULT,
  );
  const [executorPhotoOverlay, setExecutorPhotoOverlay] = useState(
    cachedStatus?.executor_photo_overlay ?? true,
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
        applyCachedStatus({
          setCvEnabledGlobal,
          setCvRoles,
          setExecutorMobileCameraCapture,
          setExecutorPhotoMaxEdge,
          setExecutorPhotoJpegQuality,
          setExecutorPhotoOverlay,
        });
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
            executor_photo_max_edge: data.executor_photo_max_edge || PHOTO_MAX_EDGE_DEFAULT,
            executor_photo_jpeg_quality: data.executor_photo_jpeg_quality || PHOTO_JPEG_QUALITY_DEFAULT,
            executor_photo_overlay: data.executor_photo_overlay !== false,
          };
          applyCachedStatus({
            setCvEnabledGlobal,
            setCvRoles,
            setExecutorMobileCameraCapture,
            setExecutorPhotoMaxEdge,
            setExecutorPhotoJpegQuality,
            setExecutorPhotoOverlay,
          });
        }
      } catch {
        if (!cancelled && cachedStatus === null) {
          setCvEnabledGlobal(true);
          setCvRoles(['executor']);
          setExecutorMobileCameraCapture(true);
          setExecutorPhotoMaxEdge(PHOTO_MAX_EDGE_DEFAULT);
          setExecutorPhotoJpegQuality(PHOTO_JPEG_QUALITY_DEFAULT);
          setExecutorPhotoOverlay(true);
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
    executorPhotoMaxEdge,
    executorPhotoJpegQuality,
    executorPhotoOverlay,
    loading,
  };
}
