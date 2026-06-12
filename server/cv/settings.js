import db from '../db.js';

let cache = null;

function rowToSettings(row) {
  return {
    enabled: row.enabled !== 0,
    threshold: Number(row.threshold),
    margin: Number(row.margin),
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

export function getCvSettings() {
  if (cache) return { ...cache };
  const row = db.prepare('SELECT * FROM cv_settings WHERE id = 1').get();
  if (!row) {
    cache = {
      enabled: process.env.CV_ENABLED !== 'false',
      threshold: parseFloat(process.env.CV_ATM_THRESHOLD || '0.30'),
      margin: parseFloat(process.env.CV_ATM_MARGIN || '0.12'),
      updated_at: null,
      updated_by: null,
    };
    return { ...cache };
  }
  cache = rowToSettings(row);
  return { ...cache };
}

export function updateCvSettings({ enabled, threshold, margin }, userId) {
  const current = db.prepare('SELECT * FROM cv_settings WHERE id = 1').get();
  const next = {
    enabled: enabled !== undefined ? (enabled ? 1 : 0) : (current?.enabled ?? 1),
    threshold: threshold !== undefined ? Number(threshold) : (current?.threshold ?? 0.30),
    margin: margin !== undefined ? Number(margin) : (current?.margin ?? 0.12),
  };

  if (next.threshold < 0.05 || next.threshold > 0.95) {
    throw new Error('Порог CV_ATM_THRESHOLD должен быть от 0.05 до 0.95');
  }
  if (next.margin < 0 || next.margin > 0.5) {
    throw new Error('Запас CV_ATM_MARGIN должен быть от 0 до 0.5');
  }

  db.prepare(`
    INSERT INTO cv_settings (id, enabled, threshold, margin, updated_at, updated_by)
    VALUES (1, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      threshold = excluded.threshold,
      margin = excluded.margin,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(next.enabled, next.threshold, next.margin, userId ?? null);

  cache = null;
  return getCvSettings();
}

export function isCvEnabledRuntime() {
  return getCvSettings().enabled;
}
