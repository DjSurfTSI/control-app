import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDateTime, CV_ASSIGNABLE_ROLES } from '../utils';
import { invalidateCvStatus } from '../hooks/useCvStatus';
import ReferenceDirectoriesEditor from '../components/ReferenceDirectoriesEditor';

function CvSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    enabled: true,
    threshold: 0.3,
    margin: 0.12,
    executor_mobile_camera_capture: true,
    cv_roles: ['executor'],
  });
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
          executor_mobile_camera_capture: data.executor_mobile_camera_capture !== false,
          cv_roles: data.cv_roles?.length ? data.cv_roles : ['executor'],
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
        executor_mobile_camera_capture: data.executor_mobile_camera_capture !== false,
        cv_roles: data.cv_roles?.length ? data.cv_roles : ['executor'],
      });
      setSuccess('Настройки сохранены');
      invalidateCvStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCvRole = (roleId) => {
    setForm((f) => {
      const roles = f.cv_roles.includes(roleId)
        ? f.cv_roles.filter((r) => r !== roleId)
        : [...f.cv_roles, roleId];
      return { ...f, cv_roles: roles };
    });
  };

  if (loading) return <p className="empty-state">Загрузка...</p>;

  return (
    <>
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

        <div className={`form-group cv-roles-block ${!form.enabled ? 'disabled' : ''}`}>
          <label>CV-проверка при завершении заявки — роли</label>
          <p className="hint">Бизнес-администратор всегда завершает без CV. Для выбранных ролей при закрытии заявки фото проверяются моделью.</p>
          <div className="cv-roles-list">
            {CV_ASSIGNABLE_ROLES.map((role) => (
              <label key={role.id} className="toggle-label cv-role-item">
                <input
                  type="checkbox"
                  checked={form.cv_roles.includes(role.id)}
                  disabled={!form.enabled}
                  onChange={() => toggleCvRole(role.id)}
                />
                <span>{role.label}</span>
              </label>
            ))}
          </div>
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

        <div className="form-group toggle-row settings-mobile-photo">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.executor_mobile_camera_capture}
              onChange={(e) => setForm((f) => ({ ...f, executor_mobile_camera_capture: e.target.checked }))}
            />
            <span>Камера на мобильных (исполнитель)</span>
          </label>
          <p className="hint">
            Включено — при съёмке фотоотчёта на телефоне сразу открывается камера (нужно разрешение).
            Выключено — выбор файла из галереи без запроса доступа к камере.
          </p>
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
    </>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('cv');

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">Настройки</h2>
          <p className="page-subtitle">Параметры системы и справочники устройств</p>
        </div>
      </div>

      <div className="settings-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`settings-tab${tab === 'cv' ? ' active' : ''}`}
          onClick={() => setTab('cv')}
        >
          CV-проверка
        </button>
        <button
          type="button"
          role="tab"
          className={`settings-tab${tab === 'directories' ? ' active' : ''}`}
          onClick={() => setTab('directories')}
        >
          Справочники
        </button>
      </div>

      {tab === 'cv' ? <CvSettingsPanel /> : <ReferenceDirectoriesEditor />}
    </div>
  );
}
