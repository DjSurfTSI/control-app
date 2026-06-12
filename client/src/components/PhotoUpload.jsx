import { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { PHOTO_TYPES, PHOTO_TYPE_LABELS, checkRequiredPhotos } from '../utils';

export default function PhotoUpload({ taskId, readOnly = false, onChange }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');
  const inputRefs = useRef({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getPhotos(taskId);
      setPhotos(data);
      const check = checkRequiredPhotos(data);
      onChange?.({ photos: data, ...check });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (taskId) load(); }, [taskId]);

  const getPhotoForType = (type) => photos.find((p) => p.photo_type === type);

  const handleUpload = async (type, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(type);
    try {
      await api.uploadPhoto(taskId, file, type);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(null);
      if (inputRefs.current[type]) inputRefs.current[type].value = '';
    }
  };

  const handleDelete = async (photoId) => {
    if (!confirm('Удалить фото?')) return;
    await api.deletePhoto(taskId, photoId);
    await load();
  };

  if (loading) return <p className="photo-loading">Загрузка фото...</p>;

  const check = checkRequiredPhotos(photos);

  return (
    <div className="photo-upload animate-fade-in">
      <label className="photo-title">Фотоотчёт — обязательные ракурсы</label>
      {!check.complete && !readOnly && (
        <p className="photo-hint">Не хватает: {check.missing.map((t) => PHOTO_TYPE_LABELS[t]).join(', ')}</p>
      )}
      {check.complete && <p className="photo-ok">✓ Все обязательные фото загружены</p>}
      {error && <div className="error-msg">{error}</div>}

      <div className="photo-slots">
        {PHOTO_TYPES.map((type) => {
          const photo = getPhotoForType(type);
          return (
            <div key={type} className={`photo-slot ${photo ? 'filled' : 'empty'} animate-scale-in`}>
              <span className="photo-slot-label">{PHOTO_TYPE_LABELS[type]}</span>
              {photo ? (
                <div className="photo-slot-preview">
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    <img src={photo.url} alt={PHOTO_TYPE_LABELS[type]} />
                  </a>
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
                      capture="environment"
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
                      {uploading === type ? '...' : '📷'}
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
        .photo-hint { color: var(--warning); font-size: 0.85rem; margin-bottom: 0.5rem; }
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
        .photo-slot.empty { border-color: var(--warning); }
        .photo-slot-label { font-size: 0.8rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted); }
        .photo-slot-preview { position: relative; width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; }
        .photo-slot-preview img { width: 100%; height: 100%; object-fit: cover; }
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
