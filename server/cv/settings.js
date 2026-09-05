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

export const ANGLE_THRESHOLD_DEFAULT = 0.30;
export const CLEANLINESS_THRESHOLD_DEFAULT = 0.35;

function clampUnit(value, fallback, min = 0.05, max = 0.95) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

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
    executor_photo_overlay: row.executor_photo_overlay !== 0,
    angle_check_enabled: row.angle_check_enabled !== 0,
    angle_threshold: clampUnit(row.angle_threshold, ANGLE_THRESHOLD_DEFAULT),
    angle_block_on_mismatch: row.angle_block_on_mismatch === 1,
    cleanliness_check_enabled: row.cleanliness_check_enabled !== 0,
    cleanliness_threshold: clampUnit(row.cleanliness_threshold, CLEANLINESS_THRESHOLD_DEFAULT),
    cleanliness_block_on_dirty: row.cleanliness_block_on_dirty === 1,
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
      executor_photo_overlay: true,
      angle_check_enabled: true,
      angle_threshold: ANGLE_THRESHOLD_DEFAULT,
      angle_block_on_mismatch: false,
      cleanliness_check_enabled: true,
      cleanliness_threshold: CLEANLINESS_THRESHOLD_DEFAULT,
      cleanliness_block_on_dirty: false,
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
  executor_photo_max_edge, executor_photo_jpeg_quality, executor_photo_overlay,
  angle_check_enabled, angle_threshold, angle_block_on_mismatch,
  cleanliness_check_enabled, cleanliness_threshold, cleanliness_block_on_dirty,
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
    executor_photo_overlay: executor_photo_overlay !== undefined
      ? (executor_photo_overlay ? 1 : 0)
      : (current?.executor_photo_overlay ?? 1),
    angle_check_enabled: angle_check_enabled !== undefined
      ? (angle_check_enabled ? 1 : 0)
      : (current?.angle_check_enabled ?? 1),
    angle_threshold: angle_threshold !== undefined
      ? Number(angle_threshold)
      : (current?.angle_threshold ?? ANGLE_THRESHOLD_DEFAULT),
    angle_block_on_mismatch: angle_block_on_mismatch !== undefined
      ? (angle_block_on_mismatch ? 1 : 0)
      : (current?.angle_block_on_mismatch ?? 0),
    cleanliness_check_enabled: cleanliness_check_enabled !== undefined
      ? (cleanliness_check_enabled ? 1 : 0)
      : (current?.cleanliness_check_enabled ?? 1),
    cleanliness_threshold: cleanliness_threshold !== undefined
      ? Number(cleanliness_threshold)
      : (current?.cleanliness_threshold ?? CLEANLINESS_THRESHOLD_DEFAULT),
    cleanliness_block_on_dirty: cleanliness_block_on_dirty !== undefined
      ? (cleanliness_block_on_dirty ? 1 : 0)
      : (current?.cleanliness_block_on_dirty ?? 0),
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
  if (next.angle_threshold < 0.05 || next.angle_threshold > 0.95) {
    throw new Error('Порог определения ракурса должен быть от 0.05 до 0.95');
  }
  if (next.cleanliness_threshold < 0.05 || next.cleanliness_threshold > 0.95) {
    throw new Error('Порог оценки чистоты должен быть от 0.05 до 0.95');
  }

  db.prepare(`
    INSERT INTO cv_settings (
      id, enabled, threshold, margin, executor_mobile_camera_capture, cv_roles,
      executor_photo_max_edge, executor_photo_jpeg_quality, executor_photo_overlay,
      angle_check_enabled, angle_threshold, angle_block_on_mismatch,
      cleanliness_check_enabled, cleanliness_threshold, cleanliness_block_on_dirty,
      updated_at, updated_by
    )
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      enabled = excluded.enabled,
      threshold = excluded.threshold,
      margin = excluded.margin,
      executor_mobile_camera_capture = excluded.executor_mobile_camera_capture,
      cv_roles = excluded.cv_roles,
      executor_photo_max_edge = excluded.executor_photo_max_edge,
      executor_photo_jpeg_quality = excluded.executor_photo_jpeg_quality,
      executor_photo_overlay = excluded.executor_photo_overlay,
      angle_check_enabled = excluded.angle_check_enabled,
      angle_threshold = excluded.angle_threshold,
      angle_block_on_mismatch = excluded.angle_block_on_mismatch,
      cleanliness_check_enabled = excluded.cleanliness_check_enabled,
      cleanliness_threshold = excluded.cleanliness_threshold,
      cleanliness_block_on_dirty = excluded.cleanliness_block_on_dirty,
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
    next.executor_photo_overlay,
    next.angle_check_enabled,
    next.angle_threshold,
    next.angle_block_on_mismatch,
    next.cleanliness_check_enabled,
    next.cleanliness_threshold,
    next.cleanliness_block_on_dirty,
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
