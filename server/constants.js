export const TASK_STATUSES = [
  'new', 'in_progress', 'completed', 'overdue', 'returned', 'cancelled', 'no_access', 'emergency',
];

export const STATUS_LABELS = {
  new: 'Новая',
  in_progress: 'В работе',
  completed: 'Выполнено',
  overdue: 'Просрочено',
  returned: 'Возврат',
  cancelled: 'Отменено',
  no_access: 'Нет доступа',
  emergency: 'Экстренная заявка',
};

export const EXECUTOR_SELF_ASSIGNABLE_STATUSES = ['new', 'overdue'];

export function canExecutorSelfAssignTask(task) {
  return task
    && EXECUTOR_SELF_ASSIGNABLE_STATUSES.includes(task.status)
    && !task.assigned_to;
}

export const STATUS_ALIASES = {
  pending: 'new',
  новая: 'new',
  'в работе': 'in_progress',
  выполнено: 'completed',
  просрочено: 'overdue',
  возврат: 'returned',
  отменено: 'cancelled',
  'нет доступа': 'no_access',
  'экстренная заявка': 'emergency',
  emergency: 'emergency',
};

export const ROLE_LABELS = {
  bizadmin: 'Бизнес-администратор',
  admin: 'Администратор',
  supervisor: 'Супервайзер',
  executor: 'Исполнитель',
};

export const ROLE_ALIASES = {
  cleaner: 'executor',
  уборщик: 'executor',
  исполнитель: 'executor',
  'бизнес-администратор': 'bizadmin',
  администратор: 'admin',
  супервайзер: 'supervisor',
};

export function normalizeStatus(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  if (TASK_STATUSES.includes(key)) return key;
  return STATUS_ALIASES[key] || null;
}

export function normalizeRole(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  if (ROLE_LABELS[key]) return key;
  return ROLE_ALIASES[key] || null;
}
