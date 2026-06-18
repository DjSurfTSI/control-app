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
