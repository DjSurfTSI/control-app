import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { PHOTO_TYPES, PHOTO_TYPE_LABELS, checkRequiredPhotos, checkPhotoCv } from '../utils';
import { compressImageForUpload } from '../utils/compressImage';
import { isMobileDevice } from '../utils/isMobileDevice';
import { useCvStatus } from '../hooks/useCvStatus';
import { useOffline } from '../hooks/useOffline';

export default function PhotoUpload({ taskId, readOnly = false, onChange }) {
  const { cvEnabled, executorMobileCameraCapture, executorPhotoMaxEdge, executorPhotoJpegQuality, loading: cvLoading } = useCvStatus();
  const { effectiveOffline, networkOnline } = useOffline();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [photosError, setPhotosError] = useState('');
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const inputRefs = useRef({});

  useEffect(() => {
    const refresh = () => setIsMobile(isMobileDevice());
    refresh();
    window.addEventListener('orientationchange', refresh);
    window.addEventListener('resize', refresh);
    return () => {
      window.removeEventListener('orientationchange', refresh);
      window.removeEventListener('resize', refresh);
    };
  }, []);

  const useCameraCapture = executorMobileCameraCapture && isMobile;

  const emitChange = useCallback((data, enabled = cvEnabled) => {
    const required = checkRequiredPhotos(data);
    const cv = checkPhotoCv(data, enabled);
    onChange?.({
      photos: data,
      cvEnabled: enabled,
      ...required,
      cvPassed: cv.passed,
      cvFailed: cv.failed,
      cvPending: cv.pending,
    });
  }, [cvEnabled, onChange]);

  const load = async ({ keepExisting = false } = {}) => {
    if (!keepExisting) setLoading(true);
    setPhotosError('');
    const safety = setTimeout(() => setLoading(false), 25000);
    try {
      const data = await api.getPhotos(taskId);
      setPhotos((prev) => {
        if (keepExisting && data.length === 0 && prev.length > 0) return prev;
        const next = data.length > 0 ? data : (keepExisting ? prev : data);
        emitChange(next);
        return next;
      });
    } catch (err) {
      if (!keepExisting) {
        setPhotosError(err.message || 'Не удалось загрузить фото');
      }
    } finally {
      clearTimeout(safety);
      setLoading(false);
    }
  };

  useEffect(() => { if (taskId) load(); }, [taskId]);

  useEffect(() => {
    const onSynced = () => { if (taskId) load({ keepExisting: false }); };
    window.addEventListener('offline-synced', onSynced);
    return () => window.removeEventListener('offline-synced', onSynced);
  }, [taskId]);

  useEffect(() => {
    if (!loading && photos.length > 0) emitChange(photos);
  }, [cvEnabled, loading, photos]);

  useEffect(() => {
    if (!cvEnabled || !networkOnline || !taskId) return undefined;
    const hasPending = photos.some((p) => p.cv_detected == null && !p.offline);
    if (!hasPending) return undefined;

    let cancelled = false;
    const tick = async () => {
      try {
        const data = await api.getPhotos(taskId);
        if (!cancelled) {
          setPhotos(data);
          emitChange(data);
        }
      } catch {
        /* ignore poll errors */
      }
    };
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [photos, cvEnabled, networkOnline, taskId, emitChange]);

  const getPhotoForType = (type) => photos.find((p) => p.photo_type === type);

  const handleUpload = async (type, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(type);
    try {
      const compressed = await compressImageForUpload(file, {
        maxEdge: executorPhotoMaxEdge,
        jpegQuality: executorPhotoJpegQuality,
      });
      const result = await api.uploadPhoto(taskId, compressed, type, { preferOffline: effectiveOffline });
      if (result?.offline_queued || result?.offline) {
        setPhotos((prev) => {
          const next = [
            ...prev.filter((p) => p.photo_type !== type),
            { ...result, photo_type: type, url: result.url, offline: true },
          ];
          emitChange(next);
          return next;
        });
      } else {
        setPhotos((prev) => {
          const next = [
            ...prev.filter((p) => p.photo_type !== type),
            { ...result, photo_type: type, cv_detected: result.cv_detected ?? null },
          ];
          emitChange(next);
          return next;
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(null);
      if (inputRefs.current[type]) inputRefs.current[type].value = '';
    }
  };

  const handleDelete = async (photoId) => {
    if (!confirm('Удалить фото?')) return;
    setError('');
    try {
      await api.deletePhoto(taskId, photoId);
      setPhotos((prev) => {
        const next = prev.filter((p) => p.id !== photoId && String(p.id) !== String(photoId));
        emitChange(next);
        return next;
      });
    } catch (err) {
      setError(err.message || 'Не удалось удалить фото');
    }
  };

  const check = checkRequiredPhotos(photos);
  const cv = checkPhotoCv(photos, cvEnabled);
  const canComplete = cvEnabled ? cv.passed : check.complete;
  const showInitialLoad = loading && photos.length === 0 && readOnly;

  if (showInitialLoad) return <p className="photo-loading">Загрузка фото...</p>;

  return (
    <div className="photo-upload animate-fade-in">
      <label className="photo-title">Фотоотчёт — обязательные ракурсы</label>
      {(loading || cvLoading) && (
        <p className="photo-loading">Загрузка фото...</p>
      )}
      {photosError && (
        <div className="error-msg">
          {photosError}
          {' '}
          <button type="button" className="btn-secondary btn-sm" onClick={load}>Повторить</button>
        </div>
      )}
      {cvEnabled ? (
        <p className="photo-cv-hint">
          Фото проверяются CV-моделью: на снимке должен быть виден банкомат Сбербанка (зелёный или серый терминал)
        </p>
      ) : (
        <p className="photo-cv-hint photo-cv-off">
          CV-проверка отключена. Достаточно трёх фото с разных ракурсов.
        </p>
      )}
      {effectiveOffline && !readOnly && (
        <p className="photo-offline-hint">Фото сохранятся на устройстве и отправятся при появлении сети.</p>
      )}

      {!check.complete && !readOnly && (
        <p className="photo-hint">Не хватает: {check.missing.map((t) => PHOTO_TYPE_LABELS[t]).join(', ')}</p>
      )}
      {canComplete && (
        <p className="photo-ok">
          {cvEnabled ? '✓ Все фото загружены и банкомат подтверждён' : '✓ Все фото загружены'}
        </p>
      )}
      {cvEnabled && cv.pending.length > 0 && (
        <p className="photo-hint">Проверка CV: {cv.pending.map((t) => PHOTO_TYPE_LABELS[t]).join(', ')}…</p>
      )}
      {cvEnabled && cv.failed.length > 0 && (
        <p className="photo-cv-fail">
          Банкомат не обнаружен: {cv.failed.map((t) => PHOTO_TYPE_LABELS[t]).join(', ')} — переснимите
        </p>
      )}
      {error && <div className="error-msg">{error}</div>}

      <div className="photo-slots">
        {PHOTO_TYPES.map((type) => {
          const photo = getPhotoForType(type);
          const cvOk = cvEnabled && photo?.cv_detected === 1;
          const cvFail = cvEnabled && photo?.cv_detected === 0;
          const cvPending = cvEnabled && photo && photo.cv_detected == null;
          const slotClass = photo
            ? (cvFail ? 'cv-fail' : (cvPending && !photo.offline) ? 'cv-pending' : 'filled')
            : 'empty';

          return (
            <div key={type} className={`photo-slot ${slotClass} animate-scale-in`}>
              <span className="photo-slot-label">{PHOTO_TYPE_LABELS[type]}</span>
              {photo ? (
                <div className="photo-slot-preview">
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    <img src={photo.url} alt={PHOTO_TYPE_LABELS[type]} />
                  </a>
                  {cvOk && <span className="photo-cv-badge ok">✓ ATM</span>}
                  {cvFail && <span className="photo-cv-badge fail">✗</span>}
                  {photo.offline && <span className="photo-cv-badge pending">📡</span>}
                  {cvPending && !photo.offline && uploading !== type && (
                    <span className="photo-cv-badge pending">…</span>
                  )}
                  {!readOnly && (
                    <button type="button" className="photo-delete" onClick={() => handleDelete(photo.id)}>×</button>
                  )}
                </div>
              ) : (
                !readOnly && (
                  <>
                    <input
                      ref={(el) => { inputRefs.current[type] = el; }}
                      type="file"
                      accept="image/*"
                      {...(useCameraCapture ? { capture: 'environment' } : {})}
                      onChange={(e) => handleUpload(type, e)}
                      style={{ display: 'none' }}
                      id={`photo-${taskId}-${type}`}
                    />
                    <button
                      type="button"
                      className="photo-add-btn"
                      onClick={() => inputRefs.current[type]?.click()}
                      disabled={uploading === type}
                    >
                      {uploading === type ? (cvEnabled ? 'Проверка CV...' : 'Загрузка…') : '📷'}
                    </button>
                  </>
                )
              )}
              {readOnly && !photo && <span className="photo-missing">Нет фото</span>}
            </div>
          );
        })}
      </div>

      <style>{`
        .photo-upload { margin-top: 0.75rem; }
        .photo-title { display: block; font-weight: 600; margin-bottom: 0.5rem; }
        .photo-cv-hint { color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.5rem; }
        .photo-cv-off { color: var(--success); }
        .photo-offline-hint { color: #93c5fd; font-size: 0.8rem; margin-bottom: 0.5rem; }
        .photo-hint { color: var(--warning); font-size: 0.85rem; margin-bottom: 0.5rem; }
        .photo-cv-fail { color: var(--danger); font-size: 0.85rem; margin-bottom: 0.5rem; }
        .photo-ok { color: var(--success); font-size: 0.85rem; margin-bottom: 0.5rem; }
        .photo-loading { color: var(--text-muted); font-size: 0.85rem; }
        .photo-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
        .photo-slot {
          border: 2px dashed var(--border); border-radius: 10px;
          padding: 0.75rem; text-align: center; min-height: 130px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          transition: border-color 0.3s, background 0.3s;
        }
        .photo-slot.filled { border-style: solid; border-color: var(--success); background: #14532d22; }
        .photo-slot.cv-fail { border-style: solid; border-color: var(--danger); background: #7f1d1d22; }
        .photo-slot.cv-pending { border-style: solid; border-color: var(--warning); background: #78350f22; }
        .photo-slot.empty { border-color: var(--warning); }
        .photo-slot-label { font-size: 0.8rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted); }
        .photo-slot-preview { position: relative; width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; }
        .photo-slot-preview img { width: 100%; height: 100%; object-fit: cover; }
        .photo-cv-badge {
          position: absolute; bottom: 4px; left: 4px;
          font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;
        }
        .photo-cv-badge.ok { background: var(--success); color: white; }
        .photo-cv-badge.fail { background: var(--danger); color: white; }
        .photo-cv-badge.pending { background: var(--warning); color: black; }
        .photo-add-btn {
          width: 56px; height: 56px; border-radius: 50%;
          background: var(--surface-hover); border: 1px solid var(--border);
          font-size: 1.5rem; transition: transform 0.2s, background 0.2s;
        }
        .photo-add-btn:hover { transform: scale(1.08); background: var(--primary); }
        .photo-delete {
          position: absolute; top: 4px; right: 4px;
          width: 24px; height: 24px; border-radius: 50%;
          background: rgba(0,0,0,0.7); color: white; font-size: 1rem; padding: 0;
        }
        .photo-missing { color: var(--text-muted); font-size: 0.8rem; }
        @media (max-width: 480px) {
          .photo-slots { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
