import { useEffect, useState } from 'react';
import { useEntityFields } from '../context/EntityFieldsContext';
import {
  ENTITY_TYPES,
  VIEW_LABELS,
  FIELD_TYPE_LABELS,
  createCustomField,
  moveField,
} from '../utils/entityFields';

const ENTITY_META = {
  tasks: { label: 'Заявки', icon: '📋', hint: 'Колонки таблицы, карточки и поля в форме заявки' },
  atms: { label: 'Устройства', icon: '🏧', hint: 'Список устройств и форма добавления/редактирования' },
  users: { label: 'Сотрудники', icon: '👥', hint: 'Таблица персонала и карточка сотрудника' },
};

function ViewTogglePills({ field, onChange }) {
  return (
    <div className="field-view-pills">
      <span className="field-view-pills-label">Показывать в:</span>
      {Object.entries(VIEW_LABELS).map(([key, label]) => {
        const active = field.showIn?.[key] !== false;
        const disabled = field.type === 'actions' && key !== 'table' && key !== 'card';
        return (
          <button
            key={key}
            type="button"
            className={`field-view-pill${active ? ' active' : ''}`}
            disabled={disabled}
            title={disabled ? 'Недоступно для этого типа поля' : undefined}
            onClick={() => {
              if (disabled) return;
              onChange({ ...field.showIn, [key]: !active });
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function FieldEditorList({ fields, onChange, onRemoveCustom }) {
  if (!fields.length) {
    return <p className="hint">Нет полей для отображения.</p>;
  }

  return (
    <ol className="field-builder-list">
      {fields.map((field, index) => (
        <li
          key={field.id}
          className={`field-builder-card${field.visible === false ? ' field-builder-card-hidden' : ''}`}
        >
          <div className="field-builder-card-head">
            <span className="field-builder-order">{index + 1}</span>
            <div className="field-builder-card-title">
              <strong>{field.label}</strong>
              <span className={`field-builder-badge field-builder-badge-${field.kind}`}>
                {field.kind === 'custom' ? 'Своё поле' : 'Системное'}
              </span>
              <span className="field-builder-type">{FIELD_TYPE_LABELS[field.type] || field.type}</span>
            </div>
            <label className="field-visible-toggle" title="Показывать поле в интерфейсе">
              <input
                type="checkbox"
                checked={field.visible !== false}
                onChange={(e) => {
                  onChange(fields.map((f) => (
                    f.id === field.id ? { ...f, visible: e.target.checked } : f
                  )));
                }}
              />
              <span>Включено</span>
            </label>
          </div>

          <ViewTogglePills
            field={field}
            onChange={(showIn) => {
              onChange(fields.map((f) => (f.id === field.id ? { ...f, showIn } : f)));
            }}
          />

          <div className="field-builder-card-actions">
            <button
              type="button"
              className="btn-secondary btn-xs"
              disabled={index === 0}
              onClick={() => onChange(moveField(fields, index, -1))}
            >
              ↑ Выше
            </button>
            <button
              type="button"
              className="btn-secondary btn-xs"
              disabled={index === fields.length - 1}
              onClick={() => onChange(moveField(fields, index, 1))}
            >
              ↓ Ниже
            </button>
            {field.kind === 'custom' && (
              <button
                type="button"
                className="btn-danger btn-xs"
                onClick={() => onRemoveCustom(field.id)}
              >
                Удалить
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function FieldBuilderPanel({ initialEntity = 'tasks' }) {
  const { config, loading, save, reset } = useEntityFields();
  const [entity, setEntity] = useState(
    ENTITY_TYPES.includes(initialEntity) ? initialEntity : 'tasks',
  );
  const [draft, setDraft] = useState(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (config) setDraft(JSON.parse(JSON.stringify(config)));
  }, [config]);

  useEffect(() => {
    if (ENTITY_TYPES.includes(initialEntity)) setEntity(initialEntity);
  }, [initialEntity]);

  if (loading || !draft) {
    return (
      <div className="loading-state loading-state-inline">
        <div className="loading-spinner" />
        <span>Загрузка полей...</span>
      </div>
    );
  }

  const fields = draft[entity] || [];
  const meta = ENTITY_META[entity];

  const updateFields = (nextFields) => {
    setDraft((d) => ({ ...d, [entity]: nextFields.map((f, i) => ({ ...f, order: i })) }));
  };

  const handleAddField = () => {
    if (!newLabel.trim()) {
      setError('Введите название нового поля');
      return;
    }
    setError('');
    updateFields([...fields, createCustomField({ label: newLabel, type: newType })]);
    setNewLabel('');
    setNewType('text');
    setSuccess(`Поле «${newLabel.trim()}» добавлено. Не забудьте нажать «Сохранить».`);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await save(draft);
      setSuccess('Настройки полей сохранены для всех пользователей');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(`Вернуть стандартные поля для «${meta.label}»? Свои поля будут удалены.`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await reset(entity);
      setDraft(data);
      setSuccess(`Поля «${meta.label}» восстановлены по умолчанию`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="field-builder-panel">
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="field-builder-intro card">
        <h3>Как это работает</h3>
        <ul className="field-builder-help-list">
          <li>Выберите раздел — <strong>Заявки</strong>, <strong>Устройства</strong> или <strong>Сотрудники</strong>.</li>
          <li>Отметьте, какие поля показывать и где: в таблице, карточке, форме или деталях.</li>
          <li>Кнопками <strong>Выше / Ниже</strong> меняйте порядок колонок и строк.</li>
          <li>Добавьте своё поле — оно появится в формах и таблицах после сохранения.</li>
        </ul>
      </div>

      <div className="field-builder-entity-tabs" role="tablist" aria-label="Раздел для настройки">
        {ENTITY_TYPES.map((key) => {
          const m = ENTITY_META[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={entity === key}
              className={`field-builder-entity-tab${entity === key ? ' active' : ''}`}
              onClick={() => { setEntity(key); setError(''); setSuccess(''); }}
            >
              <span className="field-builder-entity-icon">{m.icon}</span>
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="card field-builder-add-card">
        <h3>➕ Добавить своё поле</h3>
        <p className="hint">Дополнительная колонка или поле в форме — например, «Комментарий диспетчера».</p>
        <div className="form-row field-builder-add">
          <div className="form-group">
            <label>Название поля</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Комментарий диспетчера"
              onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
            />
          </div>
          <div className="form-group">
            <label>Тип данных</label>
            <select value={newType} onChange={(e) => setNewType(e.target.value)}>
              <option value="text">Текст</option>
              <option value="number">Число</option>
              <option value="date">Дата</option>
            </select>
          </div>
          <div className="form-group field-builder-add-btn">
            <label>&nbsp;</label>
            <button type="button" className="btn-primary" onClick={handleAddField}>Добавить в список</button>
          </div>
        </div>
      </div>

      <div className="card workspace-section">
        <h3>{meta.icon} Поля — {meta.label}</h3>
        <p className="hint">{meta.hint}</p>
        <FieldEditorList
          fields={fields}
          onChange={updateFields}
          onRemoveCustom={(id) => updateFields(fields.filter((f) => f.id !== id))}
        />
      </div>

      <div className="workspace-actions">
        <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Сохранение...' : 'Сохранить изменения'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={handleReset}>
          Вернуть по умолчанию
        </button>
      </div>
    </div>
  );
}
