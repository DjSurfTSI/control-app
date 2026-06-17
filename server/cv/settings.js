import db from '../db.js';
import { isBizAdmin, isExecutor, isManager } from '../roles.js';

let cache = null;

export const CV_ASSIGNABLE_ROLES = ['admin', 'supervisor', 'executor'];

const DEFAULT_CV_ROLES = ['executor'];
export const EXECUTOR_PHOTO_MAX_EDGE_DEFAULT = 1280;
export const EXECUTOR_PHOTO_JPEG_QUALITY_DEFAULT = 82;
export const EXECUTOR_PHOTO_MAX_EDGE_MIN = 640;
export const EXECUTOR_PHOTO_MAX_EDGE_MAX = 2560;
export const EXECUTOR_PHOTO_JPEG_QUALITY_MIN = 50;
export const EXECUTOR_PHOTO_JPEG_QUALITY_MAX = 95;

function clampPhotoMaxEdge(value) {
  const n = Math.round(Number(value));
  if (Number.isNaN(n)) return EXECUTOR_PHOTO_MAX_EDGE_DEFAULT;
  return Math.min(EXECUTOR_PHOTO_MAX_EDGE_MAX, Math.max(EXECUTOR_PHOTO_MAX_EDGE_MIN, n));
}

function clampPhotoJpegQuality(value) {
  const n = Math.round(Number(value));
  if (Number.isNaN(n)) return EXECUTOR_PHOTO_JPEG_QUALITY_DEFAULT;
  return Math.min(EXECUTOR_PHOTO_JPEG_QUALITY_MAX, Math.max(EXECUTOR_PHOTO_JPEG_QUALITY_MIN, n));
}

function parseCvRoles(raw) {
  if (!raw) return [...DEFAULT_CV_ROLES];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [...DEFAULT_CV_ROLES];
    return parsed.filter((r) => CV_ASSIGNABLE_ROLES.includes(r));
  } catch {
    return [...DEFAULT_CV_ROLES];
  }
}

function normalizeUserRole(user) {
  if (!user?.role) return null;
  return user.role === 'cleaner' ? 'executor' : user.role;
}

function rowToSettings(row) {
  return {
    enabled: row.enabled !== 0,
    threshold: Number(row.threshold),
    margin: Number(row.margin),
    executor_mobile_camera_capture: row.executor_mobile_camera_capture !== 0,
    cv_roles: parseCvRoles(row.cv_roles),
    executor_photo_max_edge: clampPhotoMaxEdge(row.executor_photo_max_edge ?? EXECUTOR_PHOTO_MAX_EDGE_DEFAULT),
    executor_photo_jpeg_quality: clampPhotoJpegQuality(row.executor_photo_jpeg_quality ?? EXECUTOR_PHOTO_JPEG_QUALITY_DEFAULT),
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
      executor_mobile_camera_capture: true,
      cv_roles: [...DEFAULT_CV_ROLES],
      executor_photo_max_edge: EXECUTOR_PHOTO_MAX_EDGE_DEFAULT,
      executor_photo_jpeg_quality: EXECUTOR_PHOTO_JPEG_QUALITY_DEFAULT,
      updated_at: null,
      updated_by: null,
    };
    return { ...cache };
  }
  cache = rowToSettings(row);
  return { ...cache };
}

export function updateCvSettings({
  enabled, threshold, margin, executor_mobile_camera_capture, cv_roles,
  executor_photo_max_edge, executor_photo_jpeg_quality,
}, userId) {
  const current = db.prepare('SELECT * FROM cv_settings WHERE id = 1').get();
  const next = {
    enabled: enabled !== undefined ? (enabled ? 1 : 0) : (current?.enabled ?? 1),
    threshold: threshold !== undefined ? Number(threshold) : (current?.threshold ?? 0.30),
    margin: margin !== undefined ? Number(margin) : (current?.margin ?? 0.12),
    executor_mobile_camera_capture: executor_mobile_camera_capture !== undefined
      ? (executor_mobile_camera_capture ? 1 : 0)
      : (current?.executor_mobile_camera_capture ?? 1),
    cv_roles: cv_roles !== undefined
      ? JSON.stringify(parseCvRoles(cv_roles))
      : (current?.cv_roles ?? JSON.stringify(DEFAULT_CV_ROLES)),
    executor_photo_max_edge: executor_photo_max_edge !== undefined
      ? clampPhotoMaxEdge(executor_photo_max_edge)
      : clampPhotoMaxEdge(current?.executor_photo_max_edge ?? EXECUTOR_PHOTO_MAX_EDGE_DEFAULT),
    executor_photo_jpeg_quality: executor_photo_jpeg_quality !== undefined
      ? clampPhotoJpegQuality(executor_photo_jpeg_quality)
      : clampPhotoJpegQuality(current?.executor_photo_jpeg_quality ?? EXECUTOR_PHOTO_JPEG_QUALITY_DEFAULT),
  };

  if (next.threshold < 0.05 || next.threshold > 0.95) {
    throw new Error('Порог CV_ATM_THRESHOLD должен быть от 0.05 до 0.95');
  }
  if (next.margin < 0 || next.margin > 0.5) {
    throw new Error('Запас CV_ATM_MARGIN должен быть от 0 до 0.5');
  }
  if (next.executor_photo_max_edge < EXECUTOR_PHOTO_MAX_EDGE_MIN
    || next.executor_photo_max_edge > EXECUTOR_PHOTO_MAX_EDGE_MAX) {
    throw new Error(`Разрешение фото: от ${EXECUTOR_PHOTO_MAX_EDGE_MIN} до ${EXECUTOR_PHOTO_MAX_EDGE_MAX} px`);
  }
  if (next.executor_photo_jpeg_quality < EXECUTOR_PHOTO_JPEG_QUALITY_MIN
    || next.executor_photo_jpeg_quality > EXECUTOR_PHOTO_JPEG_QUALITY_MAX) {
    throw new Error(`Качество JPEG: от ${EXECUTOR_PHOTO_JPEG_QUALITY_MIN} до ${EXECUTOR_PHOTO_JPEG_QUALITY_MAX}%`);
  }

  db.prepare(`
    INSERT INTO cv_settings (id, enabled, threshold, margin, executor_mobile_camera_capture, cv_roles, executor_photo_max_edge, executor_photo_jpeg_quality, updated_at, updated_by)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      threshold = excluded.threshold,
      margin = excluded.margin,
      executor_mobile_camera_capture = excluded.executor_mobile_camera_capture,
      cv_roles = excluded.cv_roles,
      executor_photo_max_edge = excluded.executor_photo_max_edge,
      executor_photo_jpeg_quality = excluded.executor_photo_jpeg_quality,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(
    next.enabled,
    next.threshold,
    next.margin,
    next.executor_mobile_camera_capture,
    next.cv_roles,
    next.executor_photo_max_edge,
    next.executor_photo_jpeg_quality,
    userId ?? null,
  );

  cache = null;
  return getCvSettings();
}

export function isCvEnabledRuntime() {
  return getCvSettings().enabled;
}

export function isCvEnabledForUser(user) {
  if (!getCvSettings().enabled) return false;
  if (isBizAdmin(user)) return false;
  const role = normalizeUserRole(user);
  if (!role) return false;
  return getCvSettings().cv_roles.includes(role);
}

export function getExecutorPhotoCompressOptions() {
  const s = getCvSettings();
  return {
    maxEdge: s.executor_photo_max_edge,
    jpegQuality: s.executor_photo_jpeg_quality,
  };
}

export function mustAttachPhotosOnComplete(user) {
  return isExecutor(user) || isManager(user);
}
