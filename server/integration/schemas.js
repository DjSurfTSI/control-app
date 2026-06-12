export function formatTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    external_id: row.external_id || null,
    atm: {
      id: row.atm_id,
      serial_number: row.serial_number,
      bank_name: row.bank_name,
      address: row.address,
      zone: row.zone || null,
      external_id: row.atm_external_id || null,
    },
    assignee: row.assigned_to ? {
      id: row.assigned_to,
      full_name: row.assignee_name || null,
      email: row.assignee_email || null,
    } : null,
    scheduled_date: row.scheduled_date,
    status: row.status,
    priority: row.priority,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    report: row.report || null,
    notes: row.notes || null,
    photo_count: row.photo_count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

export function formatAtm(row) {
  if (!row) return null;
  return {
    id: row.id,
    external_id: row.external_id || null,
    serial_number: row.serial_number,
    bank_name: row.bank_name,
    address: row.address,
    zone: row.zone || null,
    notes: row.notes || null,
    active: !!row.active,
    created_at: row.created_at,
  };
}

export const TASK_SELECT_INTEGRATION = `
  SELECT t.*,
    a.serial_number, a.bank_name, a.address, a.zone, a.external_id as atm_external_id,
    u.full_name as assignee_name, u.email as assignee_email,
    (SELECT COUNT(*) FROM task_photos tp WHERE tp.task_id = t.id) as photo_count
  FROM cleaning_tasks t
  JOIN atms a ON a.id = t.atm_id
  LEFT JOIN users u ON u.id = t.assigned_to
`;
