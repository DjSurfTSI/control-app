import db from '../db.js';

export function recalculateUserRating(userId) {
  if (!userId) return 0;

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'completed' AND date(completed_at) <= COALESCE(deadline_date, scheduled_date) THEN 1 ELSE 0 END) as on_time,
      SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned
    FROM cleaning_tasks
    WHERE assigned_to = ?
  `).get(userId);

  const completed = stats?.completed || 0;
  const onTime = stats?.on_time || 0;
  const overdue = stats?.overdue || 0;
  const returned = stats?.returned || 0;

  const rating = Math.round(
    Math.max(0, Math.min(100, 50 + completed * 2 + onTime * 3 - overdue * 5 - returned * 8))
  );

  db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(rating, userId);
  return rating;
}
