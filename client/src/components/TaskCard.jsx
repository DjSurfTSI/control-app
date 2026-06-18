import { STATUS_LABELS, formatDate, canExecutorTakeTask } from '../utils';
import { useAuth } from '../context/AuthContext';
import { useEntityColumns } from '../context/EntityFieldsContext';
import { getEntityFieldValue } from '../utils/entityFields';

export default function TaskCard({
  task, isManager, isExecutor, currentUserId, canDelete, canComplete,
  onStart, onComplete, onAssignSelf, onEdit, onCancel, onDelete, onView,
  selectable, selected, onSelectToggle,
}) {
  const { user } = useAuth();
  const { fields: cardFields } = useEntityColumns('tasks', 'card', user?.role);
  const customCardFields = cardFields.filter((f) => f.kind === 'custom');
  const canTake = isExecutor && canExecutorTakeTask(task);

  const card = (
    <div className={`task-card card status-${task.status}${selected ? ' task-card-selected' : ''}`}>
      <div className="task-card-top">
        <div className="task-card-head">
          <span className="task-card-id">№{task.id}</span>
          <span className="task-card-sep">·</span>
          <span className="task-card-device-id" title="ID УС">{task.serial_number || '—'}</span>
          {task.installation_name && (
            <>
              <span className="task-card-sep">·</span>
              <span className="task-card-bank">{task.installation_name}</span>
            </>
          )}
        </div>
        <span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span>
      </div>

      <p className="task-card-address" title={task.address}>{task.address}</p>

      <div className="task-card-meta">
        <span>📅 {formatDate(task.scheduled_date)}</span>
        {task.deadline_date && <span>⏰ {formatDate(task.deadline_date)}</span>}
        <span className={`task-card-photo-count${(task.photo_count ?? 0) > 0 ? ' has-photos' : ''}`} title="Фото в заявке">
          📷 {task.photo_count ?? 0}
        </span>
        {task.accessibility_type && <span className="task-card-chip">{task.accessibility_type}</span>}
        {task.assignee_name && <span className="task-card-assignee-inline">👤 {task.assignee_name}</span>}
        {customCardFields.map((field) => {
          const val = getEntityFieldValue(task, field);
          if (val === '—') return null;
          return <span key={field.id} className="task-card-custom-field">{field.label}: {val}</span>;
        })}
      </div>

      <div className="task-card-actions">
        <button type="button" className="btn-secondary btn-xs" onClick={() => onView(task)}>Открыть</button>
        {canTake && (
          <button type="button" className="btn-primary btn-xs" onClick={() => onAssignSelf(task)}>Взять в работу</button>
        )}
        {canComplete && (
          <button type="button" className="btn-success btn-xs" onClick={() => onComplete(task)}>Завершить</button>
        )}
        {isManager && (
          <>
            <button type="button" className="btn-secondary btn-xs" onClick={() => onEdit(task)}>Изменить</button>
            {!canDelete && !['cancelled', 'completed'].includes(task.status) && (
              <button type="button" className="btn-danger btn-xs" onClick={() => onCancel(task.id)}>Отмена</button>
            )}
          </>
        )}
        {canDelete && (
          <button type="button" className="btn-danger btn-xs" onClick={() => onDelete(task.id)}>Удалить</button>
        )}
      </div>
    </div>
  );

  if (!selectable) return card;

  return (
    <div className="task-card-selectable">
      <input
        type="checkbox"
        className="task-select-checkbox"
        checked={!!selected}
        onChange={() => onSelectToggle?.(task.id)}
        aria-label={`Выбрать заявку №${task.id}`}
      />
      <div className="task-card-body">{card}</div>
    </div>
  );
}
