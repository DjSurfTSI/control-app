import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  WORKSPACE_NAV_CATALOG,
  WORKSPACE_WIDGET_CATALOG,
  getCatalogNavForRole,
  getCatalogWidgetsForRole,
  getDefaultWorkspace,
  getHomeRouteOptions,
  mergeWorkspaceConfig,
} from '../config/workspaceCatalog';

function moveItem(list, index, direction) {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];
  return next.map((item, i) => ({ ...item, order: i }));
}

function SortableList({ items, catalog, onChange, type }) {
  const byId = Object.fromEntries(catalog.map((c) => [c.id, c]));

  return (
    <ul className="workspace-sortable-list">
      {items.map((item, index) => {
        const meta = byId[item.id];
        if (!meta) return null;
        const label = type === 'nav' ? `${meta.icon} ${meta.label}` : meta.label;
        return (
          <li key={item.id} className="workspace-sortable-item">
            <label className="workspace-check">
              <input
                type="checkbox"
                checked={item.visible !== false}
                onChange={(e) => {
                  const updated = items.map((n) => (
                    n.id === item.id ? { ...n, visible: e.target.checked } : n
                  ));
                  onChange(updated);
                }}
              />
              <span>{label}</span>
            </label>
            <div className="workspace-sort-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={index === 0}
                onClick={() => onChange(moveItem(items, index, -1))}
                aria-label="Выше"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={index === items.length - 1}
                onClick={() => onChange(moveItem(items, index, 1))}
                aria-label="Ниже"
              >
                ↓
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function WorkspaceBuilder() {
  const { user } = useAuth();
  const { config, loading, save, reset } = useWorkspace();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const role = user?.role;

  useEffect(() => {
    if (config) setDraft(mergeWorkspaceConfig(config, role));
  }, [config, role]);

  if (loading || !draft) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Загрузка...</span>
      </div>
    );
  }

  const navCatalog = getCatalogNavForRole(role);
  const widgetCatalog = getCatalogWidgetsForRole(role);
  const homeOptions = getHomeRouteOptions(draft, role);
  const homeLabels = Object.fromEntries(
    WORKSPACE_NAV_CATALOG.map((n) => [n.to, `${n.icon} ${n.label}`]),
  );

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await save(draft);
      setSuccess('Рабочее пространство сохранено');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Сбросить настройки рабочего пространства по умолчанию?')) return;
    setSaving(true);
    setError('');
    try {
      const defaults = getDefaultWorkspace(role);
      await reset();
      setDraft(defaults);
      setSuccess('Настройки сброшены');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">Конструктор рабочего пространства</h2>
          <p className="page-subtitle">
            Настройте навигацию, стартовую страницу и виджеты дашборда под вашу роль
          </p>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="card workspace-section">
        <h3>Стартовая страница</h3>
        <p className="hint">Открывается после входа и по клику на логотип</p>
        <select
          className="workspace-select"
          value={draft.homeRoute}
          onChange={(e) => setDraft((d) => ({ ...d, homeRoute: e.target.value }))}
        >
          {homeOptions.map((route) => (
            <option key={route} value={route}>{homeLabels[route] || route}</option>
          ))}
        </select>
      </div>

      <div className="card workspace-section">
        <h3>Навигация</h3>
        <p className="hint">Отметьте разделы и измените порядок в меню</p>
        <SortableList
          items={draft.nav}
          catalog={navCatalog}
          type="nav"
          onChange={(nav) => setDraft((d) => ({ ...d, nav }))}
        />
      </div>

      <div className="card workspace-section">
        <h3>Виджеты дашборда</h3>
        <p className="hint">Блоки на главной странице (Дашборд)</p>
        <SortableList
          items={draft.dashboardWidgets}
          catalog={widgetCatalog}
          type="widget"
          onChange={(dashboardWidgets) => setDraft((d) => ({ ...d, dashboardWidgets }))}
        />
      </div>

      <div className="workspace-actions">
        <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={handleReset}>
          Сбросить по умолчанию
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(draft.homeRoute || '/')}
        >
          Перейти на стартовую
        </button>
      </div>
    </div>
  );
}
