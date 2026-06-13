import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDateTime } from '../utils';
import { invalidateCvStatus } from '../hooks/useCvStatus';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({ enabled: true, threshold: 0.3, margin: 0.12 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getCvSettings();
        setSettings(data);
        setForm({
          enabled: data.enabled,
          threshold: data.threshold,
          margin: data.margin,
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const data = await api.updateCvSettings(form);
      setSettings(data);
      setForm({
        enabled: data.enabled,
        threshold: data.threshold,
        margin: data.margin,
      });
      setSuccess('Настройки сохранены');
      invalidateCvStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="empty-state">Загрузка...</p>;

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">Настройки CV</h2>
          <p className="page-subtitle">
            Управление проверкой банкомата на фотографиях (модель CLIP)
          </p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="card animate-slide-up settings-card">
        <div className="form-group toggle-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span>CV-проверка включена</span>
          </label>
          <p className="hint">
            При отключении фото принимаются без распознавания банкомата Сбербанка.
          </p>
        </div>

        <div className={`cv-sliders ${!form.enabled ? 'disabled' : ''}`}>
          <div className="form-group">
            <label>
              Порог уверенности: <strong>{form.threshold.toFixed(2)}</strong>
            </label>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={form.threshold}
              disabled={!form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, threshold: parseFloat(e.target.value) }))}
            />
            <p className="hint">
              Минимальная уверенность модели, что на фото банкомат. Выше — строже (меньше ложных срабатываний, больше отклонений).
            </p>
          </div>

          <div className="form-group">
            <label>
              Запас над «отрицательными» метками: <strong>{form.margin.toFixed(2)}</strong>
            </label>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={form.margin}
              disabled={!form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, margin: parseFloat(e.target.value) }))}
            />
            <p className="hint">
              Насколько сильнее должна быть метка «банкомат» по сравнению с полом, стеной и т.п. Выше — строже.
            </p>
          </div>
        </div>

        {settings?.updated_at && (
          <p className="meta">
            Последнее изменение: {formatDateTime(settings.updated_at)}
          </p>
        )}

        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      <style>{`
        .page-header { margin-bottom: 1.5rem; }
        .page-title { font-size: 1.75rem; margin-bottom: 0.25rem; }
        .page-subtitle { color: var(--text-muted); }
        .settings-card { max-width: 560px; }
        .toggle-row { margin-bottom: 1.5rem; }
        .toggle-label {
          display: flex; align-items: center; gap: 0.75rem;
          font-weight: 600; cursor: pointer;
        }
        .toggle-label input { width: auto; }
        .hint { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.35rem; }
        .cv-sliders.disabled { opacity: 0.5; pointer-events: none; }
        .meta { font-size: 0.8rem; color: var(--text-muted); margin: 1rem 0; }
        .success-msg {
          background: #14532d33; color: #86efac;
          padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem;
        }
        input[type="range"] { width: 100%; margin-top: 0.5rem; }
      `}</style>
    </div>
  );
}
