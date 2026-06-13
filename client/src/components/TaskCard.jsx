import { STATUS_LABELS, PRIORITY_LABELS, formatDate } from '../utils';

export default function TaskCard({ task, isManager, canDelete, onStart, onComplete, onEdit, onCancel, onDelete, onView }) {
  return (
    <div className={`task-card card status-${task.status}`}>
      <div className="task-card-top">
        <div>
          <strong>{task.serial_number}</strong>
          <span className="task-card-bank">{task.bank_name}</span>
        </div>
        <span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span>
      </div>
      <p className="task-card-address">{task.address}</p>
      <div className="task-card-meta">
        <span>📅 {formatDate(task.scheduled_date)}</span>
        <span className={`badge badge-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
        {task.photo_count > 0 && <span>📷 {task.photo_count}</span>}
      </div>
      {task.assignee_name && <p className="task-card-assignee">👤 {task.assignee_name}</p>}
      <div className="task-card-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={() => onView(task)}>Подробнее</button>
        {!isManager && task.status === 'pending' && (
          <button type="button" className="btn-primary btn-sm" onClick={() => onStart(task)}>Начать</button>
        )}
        {!isManager && task.status === 'in_progress' && (
          <button type="button" className="btn-success btn-sm" onClick={() => onComplete(task)}>Завершить</button>
        )}
        {isManager && (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => onEdit(task)}>Изменить</button>
            {!canDelete && task.status !== 'cancelled' && task.status !== 'completed' && (
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
}
