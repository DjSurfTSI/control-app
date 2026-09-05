import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

const KIND_HINTS = {
  cleanliness: 'Отметьте, что видно на снимке: чисто, пыль, грязь или мусор. По этим примерам модель научится оценивать уборку на ваших банкоматах.',
  view: 'Отметьте, с какого ракурса сделан снимок. Модель научится отличать съёмку сбоку, спереди и сверху именно на вашем парке.',
};

const PHOTO_TYPE_FILTERS = [
  { id: '', label: 'Все ракурсы' },
  { id: 'left', label: 'Слева' },
  { id: 'right', label: 'Справа' },
  { id: 'front', label: 'Спереди' },
  { id: 'top', label: 'Сверху' },
  { id: 'before_top', label: 'До уборки' },
];

const LABELED_FILTERS = [
  { id: 'all', label: 'Все фото' },
  { id: 'none', label: 'Без разметки' },
  { id: 'only', label: 'Размеченные' },
];

const PAGE_SIZE = 24;

function formatAccuracy(value) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
}

export default function CvTrainingPanel() {
  const [kind, setKind] = useState('cleanliness');
  const [summary, setSummary] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [labeled, setLabeled] = useState('all');
  const [photoType, setPhotoType] = useState('');
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const current = summary?.kinds.find((k) => k.kind === kind) || null;

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.getCvTrainingSummary());
    } catch (err) {
      setError(err.message || 'Не удалось загрузить сводку');
    }
  }, []);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCvTrainingPhotos({
        kind, labeled, photo_type: photoType, limit: PAGE_SIZE, offset,
      });
      setPhotos(data.photos);
      setTotal(data.total);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить фото');
    } finally {
      setLoading(false);
    }
  }, [kind, labeled, photoType, offset]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadPhotos(); }, [loadPhotos]);
  useEffect(() => { setOffset(0); }, [kind, labeled, photoType]);

  const setLabel = async (photoId, label) => {
    setError('');
    try {
      const res = await api.setCvTrainingLabel({ photo_id: photoId, kind, label });
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, label: res.label } : p)));
      setSummary((prev) => (prev
        ? { ...prev, kinds: prev.kinds.map((k) => (k.kind === kind ? res.summary : k)) }
        : prev));
    } catch (err) {
      setError(err.message || 'Не удалось сохранить метку');
    }
  };

  const handleTrain = async () => {
    setTraining(true);
    setError('');
    setMessage('');
    try {
      const res = await api.trainCvModel(kind);
      setSummary((prev) => (prev
        ? { ...prev, kinds: prev.kinds.map((k) => (k.kind === kind ? res.summary : k)) }
        : prev));
      setMessage(
        `Модель обучена на ${res.model.samples_count} фото. Точность на отложенных примерах: ${formatAccuracy(res.model.accuracy)}.`
      );
    } catch (err) {
      setError(err.message || 'Не удалось обучить модель');
    } finally {
      setTraining(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Отключить обученную модель и вернуться к базовым правилам? Разметка сохранится.')) return;
    setError('');
    setMessage('');
    try {
      const res = await api.resetCvModel(kind);
      setSummary((prev) => (prev
        ? { ...prev, kinds: prev.kinds.map((k) => (k.kind === kind ? res.summary : k)) }
        : prev));
      setMessage('Модель отключена, проверки снова идут по базовым правилам.');
    } catch (err) {
      setError(err.message || 'Не удалось отключить модель');
    }
  };

  const pages = Math.ceil(total / PAGE_SIZE) || 1;
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="cv-training animate-fade-in">
      <div className="cv-training-kinds" role="tablist">
        {(summary?.kinds || []).map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={kind === k.kind}
            className={`cv-training-kind${kind === k.kind ? ' active' : ''}`}
            onClick={() => setKind(k.kind)}
          >
            {k.label}
            <span className="cv-training-kind-count">{k.total}</span>
          </button>
        ))}
      </div>

      {current && (
        <>
          <p className="cv-training-hint">{KIND_HINTS[kind]}</p>

          <div className="cv-training-stats">
            {current.classes.map((cls) => (
              <div key={cls} className="cv-training-stat">
                <span className="cv-training-stat-label">{current.class_labels[cls]}</span>
                <strong
                  className={current.counts[cls] >= current.min_samples_per_class ? 'ok' : 'low'}
                >
                  {current.counts[cls]}
                </strong>
              </div>
            ))}
          </div>

          <div className="cv-training-model">
            {current.model ? (
              <p>
                <strong>Активна обученная модель.</strong>
                {' '}Примеров: {current.model.samples_count}, точность: {formatAccuracy(current.model.accuracy)}.
                {' '}Обучена {new Date(`${current.model.trained_at}Z`).toLocaleString('ru-RU')}.
              </p>
            ) : (
              <p>Обученной модели нет — проверки идут по базовым правилам (описания на естественном языке).</p>
            )}
            <div className="cv-training-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleTrain}
                disabled={training || !current.can_train}
              >
                {training ? 'Обучение…' : current.model ? 'Переобучить' : 'Обучить модель'}
              </button>
              {current.model && (
                <button type="button" className="btn-secondary" onClick={handleReset}>
                  Отключить модель
                </button>
              )}
            </div>
            {!current.can_train && (
              <p className="cv-training-warn">
                Для обучения нужно минимум два класса, в каждом от {current.min_samples_per_class} размеченных фото.
              </p>
            )}
            {training && (
              <p className="cv-training-progress">
                Считаем признаки для новых фото — это может занять до минуты.
              </p>
            )}
          </div>
        </>
      )}

      {error && <div className="error-msg">{error}</div>}
      {message && <div className="success-msg">{message}</div>}

      <div className="cv-training-filters">
        <select value={labeled} onChange={(e) => setLabeled(e.target.value)}>
          {LABELED_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select value={photoType} onChange={(e) => setPhotoType(e.target.value)}>
          {PHOTO_TYPE_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <span className="cv-training-count">Найдено: {total}</span>
      </div>

      {loading ? (
        <p className="cv-training-loading">Загрузка фото…</p>
      ) : photos.length === 0 ? (
        <p className="cv-training-loading">Фото не найдены. Загрузите фотоотчёты по заявкам.</p>
      ) : (
        <div className="cv-training-grid">
          {photos.map((photo) => (
            <div key={photo.id} className={`cv-training-card${photo.label ? ' labeled' : ''}`}>
              <a href={photo.url} target="_blank" rel="noreferrer">
                <img src={photo.url} alt={photo.photo_type_label} loading="lazy" />
              </a>
              <div className="cv-training-card-meta">
                <span>#{photo.task_id} · {photo.photo_type_label}</span>
                {photo.serial_number && <span className="muted">{photo.serial_number}</span>}
              </div>
              <div className="cv-training-card-labels">
                {current?.classes.map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    className={`cv-training-label${photo.label === cls ? ' active' : ''}`}
                    onClick={() => setLabel(photo.id, photo.label === cls ? null : cls)}
                  >
                    {current.class_labels[cls]}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="cv-training-pager">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            ← Назад
          </button>
          <span>{page} из {pages}</span>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Вперёд →
          </button>
        </div>
      )}

      <style>{`
        .cv-training-kinds { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
        .cv-training-kind {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.5rem 0.9rem; border-radius: 8px;
          border: 1px solid var(--border); background: var(--surface);
        }
        .cv-training-kind.active { border-color: var(--primary); background: var(--surface-hover); }
        .cv-training-kind-count {
          font-size: 0.7rem; font-weight: 700; padding: 1px 6px;
          border-radius: 999px; background: var(--surface-hover);
        }
        .cv-training-hint { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem; }
        .cv-training-stats { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
        .cv-training-stat {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
          min-width: 72px; padding: 0.5rem 0.75rem;
          border: 1px solid var(--border); border-radius: 8px;
        }
        .cv-training-stat-label { font-size: 0.75rem; color: var(--text-muted); }
        .cv-training-stat strong { font-size: 1.1rem; }
        .cv-training-stat strong.ok { color: var(--success); }
        .cv-training-stat strong.low { color: var(--text-muted); }
        .cv-training-model {
          padding: 0.85rem; border: 1px solid var(--border); border-radius: 10px;
          margin-bottom: 1rem; font-size: 0.88rem;
        }
        .cv-training-actions { display: flex; gap: 0.5rem; margin-top: 0.6rem; flex-wrap: wrap; }
        .cv-training-warn { color: var(--warning); font-size: 0.8rem; margin-top: 0.5rem; }
        .cv-training-progress { color: var(--text-muted); font-size: 0.8rem; margin-top: 0.5rem; }
        .cv-training-filters {
          display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.75rem;
        }
        .cv-training-count { color: var(--text-muted); font-size: 0.82rem; }
        .cv-training-loading { color: var(--text-muted); font-size: 0.88rem; }
        .cv-training-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem;
        }
        .cv-training-card {
          border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
          display: flex; flex-direction: column;
        }
        .cv-training-card.labeled { border-color: var(--success); }
        .cv-training-card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
        .cv-training-card-meta {
          display: flex; flex-direction: column; gap: 1px;
          padding: 0.35rem 0.5rem; font-size: 0.72rem;
        }
        .cv-training-card-meta .muted { color: var(--text-muted); }
        .cv-training-card-labels {
          display: flex; flex-wrap: wrap; gap: 3px; padding: 0 0.4rem 0.45rem;
        }
        .cv-training-label {
          flex: 1 1 auto; font-size: 0.72rem; padding: 3px 6px; border-radius: 6px;
          border: 1px solid var(--border); background: var(--surface);
        }
        .cv-training-label.active { background: var(--primary); border-color: var(--primary); color: white; }
        .cv-training-pager {
          display: flex; align-items: center; justify-content: center; gap: 0.75rem;
          margin-top: 1rem; font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
