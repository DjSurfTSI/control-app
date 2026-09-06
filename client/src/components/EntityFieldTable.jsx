import { useEntityColumns } from '../context/EntityFieldsContext';

export default function EntityFieldTable({
  entity,
  rows,
  view = 'table',
  role,
  tableClass = 'directory-table',
  rowKey = 'id',
  renderCell,
  emptyMessage = 'Нет данных',
  cards = false,
}) {
  const { fields, loading } = useEntityColumns(entity, view, role);

  if (loading) {
    return (
      <div className="loading-state loading-state-inline">
        <div className="loading-spinner" />
        <span>Загрузка полей...</span>
      </div>
    );
  }

  if (!rows.length) {
    return <p className="hint">{emptyMessage}</p>;
  }

  // На узком экране таблица уезжает в горизонтальную прокрутку, поэтому те же
  // колонки показываем как список «подпись — значение».
  if (cards) {
    const actionsField = fields.find((f) => f.type === 'actions');
    const [titleField, ...restFields] = fields.filter((f) => f.type !== 'actions');
    return (
      <div className="entity-cards">
        {rows.map((row) => {
          // Прочерк вместо кнопок нужен таблице, чтобы не разъезжалась колонка;
          // в карточке выравнивать нечего, и он выглядит мусором.
          const actions = actionsField ? renderCell(actionsField, row) : null;
          const hasActions = actions && typeof actions !== 'string' && typeof actions !== 'number';
          return (
            <article className="entity-card" key={row[rowKey] ?? row.id}>
              <div className="entity-card-head">
                <div className="entity-card-title">{titleField ? renderCell(titleField, row) : null}</div>
                {hasActions && <div className="entity-card-actions">{actions}</div>}
              </div>
              <dl className="entity-card-rows">
                {restFields.map((field) => (
                  <div className="entity-card-row" key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>{renderCell(field, row)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className={tableClass}>
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field.id}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey] ?? row.id}>
              {fields.map((field) => (
                <td
                  key={field.id}
                  className={field.type === 'actions' ? 'actions' : undefined}
                  title={field.type === 'actions' ? undefined : String(renderCell?.(field, row)?.title ?? getTitle(row, field, renderCell))}
                >
                  {renderCell(field, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getTitle(row, field, renderCell) {
  try {
    const node = renderCell?.(field, row);
    if (typeof node === 'string' || typeof node === 'number') return node;
  } catch { /* ignore */ }
  return '';
}
