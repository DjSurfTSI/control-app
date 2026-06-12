import { STATUS_LABELS, PRIORITY_LABELS, formatDate } from '../utils';

export default function TaskCard({ task, isManager, onStart, onComplete, onEdit, onCancel, onView }) {
  return (
    <div className="task-card card">
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
        <button className="btn-secondary btn-sm" onClick={() => onView(task)}>Подробнее</button>
        {!isManager && task.status === 'pending' && (
          <button className="btn-primary btn-sm" onClick={() => onStart(task)}>Начать</button>
        )}
        {!isManager && task.status === 'in_progress' && (
          <button className="btn-success btn-sm" onClick={() => onComplete(task)}>Завершить</button>
        )}
        {isManager && (
          <>
            <button className="btn-secondary btn-sm" onClick={() => onEdit(task)}>Изменить</button>
            {task.status !== 'cancelled' && task.status !== 'completed' && (
              <button className="btn-danger btn-sm" onClick={() => onCancel(task.id)}>Отмена</button>
            )}
          </>
        )}
      </div>
      <style>{`
        .task-card { margin-bottom: 0.75rem; }
        .task-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
        .task-card-bank { display: block; font-size: 0.8rem; color: var(--text-muted); font-weight: 400; }
        .task-card-address { font-size: 0.9rem; color: var(--text-muted); margin: 0.5rem 0; }
        .task-card-meta { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; font-size: 0.85rem; }
        .task-card-assignee { font-size: 0.85rem; color: var(--text-muted); margin: 0.5rem 0; }
        .task-card-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.75rem; }
      `}</style>
    </div>
  );
}
