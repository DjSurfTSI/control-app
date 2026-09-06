import { useEffect, useRef, useState } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  // Главное действие показывается кнопкой, остальные уезжают в меню «…»:
  // ряд из четырёх кнопок переносился на вторую строку и раздувал карточку.
  const actions = [];
  if (canTake) actions.push({ id: 'take', label: 'Взять в работу', variant: 'btn-primary', run: () => onAssignSelf(task) });
  if (canComplete) actions.push({ id: 'complete', label: 'Завершить', variant: 'btn-success', run: () => onComplete(task) });
  if (isManager) {
    actions.push({ id: 'edit', label: 'Изменить', variant: 'btn-secondary', run: () => onEdit(task) });
    if (!canDelete && !['cancelled', 'completed'].includes(task.status)) {
      actions.push({ id: 'cancel', label: 'Отмена', variant: 'btn-danger', run: () => onCancel(task.id) });
    }
  }
  if (canDelete) actions.push({ id: 'delete', label: 'Удалить', variant: 'btn-danger', run: () => onDelete(task.id) });

  const [primary, ...secondary] = actions;

  const runAction = (action) => {
    setMenuOpen(false);
    action.run();
  };

  const card = (
    <div className={`task-card card status-${task.status}${selected ? ' task-card-selected' : ''}`}>
      <button type="button" className="task-card-open" onClick={() => onView(task)}>
        <span className="task-card-top">
          <span className="task-card-head">
            <span className="task-card-id">№{task.id}</span>
            <span className="task-card-sep">·</span>
            <span className="task-card-device-id" title="ID УС">{task.serial_number || '—'}</span>
            {task.installation_name && (
              <>
                <span className="task-card-sep">·</span>
                <span className="task-card-bank">{task.installation_name}</span>
              </>
            )}
          </span>
          <span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span>
        </span>

        <span className="task-card-address" title={task.address}>{task.address}</span>

        <span className="task-card-meta">
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
        </span>
      </button>

      {(primary || secondary.length > 0) && (
        <div className="task-card-actions" ref={menuRef}>
          {primary && (
            <button type="button" className={`${primary.variant} btn-xs`} onClick={() => runAction(primary)}>
              {primary.label}
            </button>
          )}
          {secondary.length > 0 && (
            <>
              <button
                type="button"
                className="btn-secondary btn-xs task-card-more"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Ещё действия"
                onClick={() => setMenuOpen((open) => !open)}
              >
                …
              </button>
              {menuOpen && (
                <div className="task-card-menu" role="menu">
                  {secondary.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      role="menuitem"
                      className={`task-card-menu-item${action.variant === 'btn-danger' ? ' danger' : ''}`}
                      onClick={() => runAction(action)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
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
