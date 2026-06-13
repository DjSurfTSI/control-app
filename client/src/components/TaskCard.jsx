import { STATUS_LABELS, formatDate, canExecutorCompleteTask } from '../utils';

export default function TaskCard({
  task, isManager, isExecutor, currentUserId, canDelete,
  onStart, onComplete, onAssignSelf, onEdit, onCancel, onDelete, onView,
  selectable, selected, onSelectToggle,
}) {
  const canTake = isExecutor && task.status === 'new' && !task.assigned_to;

  const card = (
    <div className={`task-card card status-${task.status}${selected ? ' task-card-selected' : ''}`}>
      <div className="task-card-top">
        <div>
          <strong>№{task.id}</strong>
          <span className="task-card-bank">{task.installation_name || task.serial_number}</span>
        </div>
        <span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span>
      </div>
      <p className="task-card-address">{task.address}</p>
      <div className="task-card-meta">
        <span>📅 {formatDate(task.scheduled_date)}</span>
        {task.deadline_date && <span>⏰ {formatDate(task.deadline_date)}</span>}
        {task.accessibility_type && <span>{task.accessibility_type}</span>}
        {task.photo_count > 0 && <span>📷 {task.photo_count}</span>}
      </div>
      {task.assignee_name && <p className="task-card-assignee">👤 {task.assignee_name}</p>}
      <div className="task-card-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={() => onView(task)}>Подробнее</button>
        {canTake && (
          <button type="button" className="btn-primary btn-sm" onClick={() => onAssignSelf(task)}>Взять заявку</button>
        )}
        {isExecutor && canExecutorCompleteTask(task, currentUserId) && (
          <button type="button" className="btn-success btn-sm" onClick={() => onComplete(task)}>Завершить</button>
        )}
        {isManager && (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => onEdit(task)}>Изменить</button>
            {!canDelete && !['cancelled', 'completed'].includes(task.status) && (
              <button type="button" className="btn-danger btn-sm" onClick={() => onCancel(task.id)}>Отмена</button>
            )}
          </>
        )}
        {canDelete && (
          <button type="button" className="btn-danger btn-sm" onClick={() => onDelete(task.id)}>Удалить</button>
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
