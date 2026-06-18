import { useEntityColumns } from '../context/EntityFieldsContext';

export function EntityCustomFormFields({
  entity,
  values,
  customValues,
  onCustomChange,
  role,
}) {
  const { fields } = useEntityColumns(entity, 'form', role);
  const customFields = fields.filter((f) => f.kind === 'custom');

  if (!customFields.length) return null;

  return (
    <div className="entity-custom-fields">
      {customFields.map((field) => (
        <div className="form-group" key={field.id}>
          <label>{field.label}{field.required ? ' *' : ''}</label>
          {field.type === 'date' ? (
            <input
              type="date"
              value={customValues?.[field.key] ?? ''}
              onChange={(e) => onCustomChange(field.key, e.target.value)}
              required={field.required}
            />
          ) : field.type === 'number' ? (
            <input
              type="number"
              value={customValues?.[field.key] ?? ''}
              onChange={(e) => onCustomChange(field.key, e.target.value)}
              required={field.required}
            />
          ) : (
            <input
              type="text"
              value={customValues?.[field.key] ?? ''}
              onChange={(e) => onCustomChange(field.key, e.target.value)}
              required={field.required}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function initCustomValuesFromEntity(entityRow, entity, role) {
  const base = { ...(entityRow?.custom_fields || {}) };
  return base;
}

export function mergeCustomIntoPayload(form, customFields) {
  return {
    ...form,
    custom_fields: { ...(form.custom_fields || {}), ...customFields },
  };
}
