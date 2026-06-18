import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useEntityFields } from '../context/EntityFieldsContext';
import {
  ENTITY_TYPES,
  VIEW_LABELS,
  FIELD_TYPE_LABELS,
  createCustomField,
  moveField,
} from '../utils/entityFields';

const ENTITY_LABELS = {
  tasks: 'Заявки',
  atms: 'Устройства',
  users: 'Сотрудники',
};

const ENTITY_LINKS = {
  tasks: '/tasks',
  atms: '/atms',
  users: '/users',
};

function FieldEditorList({ fields, onChange, onRemoveCustom }) {
  return (
    <ul className="workspace-sortable-list field-builder-list">
      {fields.map((field, index) => (
        <li key={field.id} className="workspace-sortable-item field-builder-item">
          <div className="field-builder-main">
            <label className="workspace-check">
              <input
                type="checkbox"
                checked={field.visible !== false}
                onChange={(e) => {
                  onChange(fields.map((f) => (
                    f.id === field.id ? { ...f, visible: e.target.checked } : f
                  )));
                }}
              />
              <span>
                <strong>{field.label}</strong>
                <small className="field-builder-meta">
                  {field.kind === 'custom' ? 'пользовательское' : 'системное'}
                  {' · '}
                  {FIELD_TYPE_LABELS[field.type] || field.type}
                </small>
              </span>
            </label>
            <div className="field-builder-views">
              {Object.entries(VIEW_LABELS).map(([key, label]) => (
                <label key={key} className="field-builder-view-check">
                  <input
                    type="checkbox"
                    checked={field.showIn?.[key] !== false}
                    disabled={field.type === 'actions' && key !== 'table' && key !== 'card'}
                    onChange={(e) => {
                      onChange(fields.map((f) => (
                        f.id === field.id
                          ? { ...f, showIn: { ...f.showIn, [key]: e.target.checked } }
                          : f
                      )));
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="workspace-sort-actions">
            {field.kind === 'custom' && (
              <button
                type="button"
                className="btn-danger btn-xs"
                onClick={() => onRemoveCustom(field.id)}
                title="Удалить поле"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={index === 0}
              onClick={() => onChange(moveField(fields, index, -1))}
              aria-label="Выше"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={index === fields.length - 1}
              onClick={() => onChange(moveField(fields, index, 1))}
              aria-label="Ниже"
            >
              ↓
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function FieldBuilder() {
  const { config, loading, save, reset } = useEntityFields();
  const [searchParams, setSearchParams] = useSearchParams();
  const entity = ENTITY_TYPES.includes(searchParams.get('entity'))
    ? searchParams.get('entity')
    : 'tasks';
  const [draft, setDraft] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (config) setDraft(JSON.parse(JSON.stringify(config)));
  }, [config]);

  const setEntity = (next) => {
    setSearchParams({ entity: next });
  };

  if (loading || !draft) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Загрузка...</span>
      </div>
    );
  }

  const fields = draft[entity] || [];

  const updateFields = (nextFields) => {
    setDraft((d) => ({ ...d, [entity]: nextFields.map((f, i) => ({ ...f, order: i })) }));
  };

  const handleAddField = () => {
    if (!newLabel.trim()) {
      setError('Укажите название поля');
      return;
    }
    setError('');
    updateFields([...fields, createCustomField({ label: newLabel, type: newType })]);
    setNewLabel('');
    setNewType('text');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await save(draft);
      setSuccess('Конфигурация полей сохранена');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Сбросить поля «${ENTITY_LABELS[entity]}» по умолчанию?`)) return;
    setSaving(true);
    setError('');
    try {
      const data = await reset(entity);
      setDraft(data);
      setSuccess('Поля сброшены');
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
          <h2 className="page-title">Конструктор полей</h2>
          <p className="page-subtitle">
            Настройка отображения и порядка полей в заявках, устройствах и справочнике сотрудников
          </p>
        </div>
        <div className="header-actions">
          <Link to={ENTITY_LINKS[entity]} className="btn-secondary btn-sm">← К разделу</Link>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="field-builder-tabs">
        {ENTITY_TYPES.map((key) => (
          <button
            key={key}
            type="button"
            className={`btn-secondary btn-sm${entity === key ? ' active-tab' : ''}`}
            onClick={() => setEntity(key)}
          >
            {ENTITY_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="card workspace-section">
        <h3>Поля — {ENTITY_LABELS[entity]}</h3>
        <p className="hint">
          Отметьте видимость, выберите где показывать поле, измените порядок. Системные поля нельзя удалить.
        </p>
        <FieldEditorList
          fields={fields}
          onChange={updateFields}
          onRemoveCustom={(id) => updateFields(fields.filter((f) => f.id !== id))}
        />
      </div>

      <div className="card workspace-section">
        <h3>Добавить поле</h3>
        <div className="form-row field-builder-add">
          <div className="form-group">
            <label>Название</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Например: Комментарий диспетчера"
            />
          </div>
          <div className="form-group">
            <label>Тип</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="text">Текст</option>
              <option value="number">Число</option>
              <option value="date">Дата</option>
            </select>
          </div>
          <div className="form-group field-builder-add-btn">
            <label>&nbsp;</label>
            <button type="button" className="btn-primary" onClick={handleAddField}>Добавить</button>
          </div>
        </div>
      </div>

      <div className="workspace-actions">
        <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={handleReset}>
          Сбросить раздел
        </button>
      </div>
    </div>
  );
}
