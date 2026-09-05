import path from 'path';
import { fileURLToPath } from 'url';
import db, { REQUIRED_PHOTO_TYPES } from '../db.js';
import { detectAtmInPhoto, isCvEnabled } from './atmDetector.js';
import { detectPhotoAngle, ANGLE_LABELS_RU } from './angleDetector.js';
import { detectCleanliness, CLEANLINESS_LABELS_RU } from './cleanlinessDetector.js';
import { readImage } from './classifier.js';
import { getCvSettings } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');

export const PHOTO_TYPE_LABELS = ANGLE_LABELS_RU;
export { CLEANLINESS_LABELS_RU };

let cvQueue = Promise.resolve();

function runInCvQueue(fn) {
  const job = cvQueue.then(fn, fn);
  cvQueue = job.catch(() => {});
  return job;
}

export function saveCvResult(photoId, result) {
  if (!photoId) return;
  try {
    db.prepare(`
      UPDATE task_photos
      SET cv_detected = ?, cv_confidence = ?, cv_checked_at = datetime('now'),
          cv_angle = ?, cv_angle_confidence = ?, cv_angle_match = ?,
          cv_cleanliness = ?, cv_cleanliness_score = ?, cv_issues = ?
      WHERE id = ?
    `).run(
      result.detected ? 1 : 0,
      result.confidence ?? 0,
      result.angle?.angle ?? null,
      result.angle?.confidence ?? null,
      result.angle?.match === null || result.angle?.match === undefined
        ? null
        : (result.angle.match ? 1 : 0),
      result.cleanliness?.level ?? null,
      result.cleanliness?.score ?? null,
      result.cleanliness?.issues?.length ? JSON.stringify(result.cleanliness.issues) : null,
      photoId,
    );
  } catch (err) {
    console.error('saveCvResult error:', err.message);
  }
}

/**
 * Полный анализ фото: наличие банкомата, ракурс съёмки и чистота уборки.
 * Изображение читается один раз и переиспользуется всеми детекторами.
 */
async function analyzePhoto(filePath, photoType) {
  const settings = getCvSettings();
  let image;
  try {
    image = await readImage(filePath);
  } catch (err) {
    console.error('CV read image error:', err.message);
    return { detected: true, confidence: 0, skipped: true, error: err.message };
  }

  const atm = await detectAtmInPhoto(image);

  const angle = settings.angle_check_enabled
    ? await detectPhotoAngle(image, photoType)
    : null;

  const cleanliness = settings.cleanliness_check_enabled
    ? await detectCleanliness(image)
    : null;

  return { ...atm, angle, cleanliness };
}

export async function validatePhoto(filePath, photoId, photoType = null) {
  return runInCvQueue(async () => {
    let result = { detected: true, confidence: 0, skipped: true, error: 'cv_unavailable' };
    try {
      result = await analyzePhoto(filePath, photoType);
    } catch (err) {
      console.error('validatePhoto error:', err.message);
      result = { detected: true, confidence: 0, skipped: true, error: err.message };
    } finally {
      saveCvResult(photoId, result);
    }
    return result;
  });
}

function parseIssues(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Замечания по ракурсу и чистоте. Блокируют завершение заявки,
 * только если это включено в настройках; иначе — предупреждения.
 */
export function getPhotoWarnings(photos) {
  const settings = getCvSettings();
  const angleMismatch = [];
  const cleanliness = [];

  for (const photo of photos) {
    if (!photo.photo_type) continue;

    if (settings.angle_check_enabled && photo.cv_angle_match === 0) {
      angleMismatch.push({
        photo_type: photo.photo_type,
        label: PHOTO_TYPE_LABELS[photo.photo_type],
        detected_angle: photo.cv_angle,
        detected_label: ANGLE_LABELS_RU[photo.cv_angle] || null,
        confidence: photo.cv_angle_confidence,
      });
    }

    if (settings.cleanliness_check_enabled) {
      const issues = parseIssues(photo.cv_issues);
      if (issues.length) {
        cleanliness.push({
          photo_type: photo.photo_type,
          label: PHOTO_TYPE_LABELS[photo.photo_type],
          level: photo.cv_cleanliness,
          level_label: CLEANLINESS_LABELS_RU[photo.cv_cleanliness] || null,
          issues,
          issue_labels: issues.map((i) => CLEANLINESS_LABELS_RU[i] || i),
          score: photo.cv_cleanliness_score,
        });
      }
    }
  }

  return {
    angle_mismatch: angleMismatch,
    cleanliness,
    angle_blocking: settings.angle_block_on_mismatch && angleMismatch.length > 0,
    cleanliness_blocking: settings.cleanliness_block_on_dirty && cleanliness.length > 0,
  };
}

export function getPhotoCvStatus(photos) {
  const byType = new Map(photos.map((p) => [p.photo_type, p]));
  const missing = REQUIRED_PHOTO_TYPES.filter((t) => !byType.has(t));
  if (missing.length) return { ok: false, failed: missing.map((t) => ({ photo_type: t, reason: 'missing' })) };

  if (!isCvEnabled()) return { ok: true, failed: [] };

  const failed = [];
  const pending = [];

  for (const type of REQUIRED_PHOTO_TYPES) {
    const photo = byType.get(type);
    if (photo.cv_checked_at == null || photo.cv_detected == null) {
      pending.push(type);
    } else if (photo.cv_detected !== 1) {
      failed.push({
        photo_type: type,
        label: PHOTO_TYPE_LABELS[type],
        confidence: photo.cv_confidence,
      });
    }
  }

  if (pending.length) return { ok: false, pending, failed };

  const warnings = getPhotoWarnings(photos);
  const blocked = warnings.angle_blocking || warnings.cleanliness_blocking;

  return {
    ok: failed.length === 0 && !blocked,
    failed,
    pending: [],
    warnings,
  };
}

export async function validateTaskPhotos(taskId) {
  const photos = db.prepare(
    'SELECT * FROM task_photos WHERE task_id = ? AND photo_type IS NOT NULL'
  ).all(taskId);

  const status = getPhotoCvStatus(photos);
  if (!status.ok && status.pending?.length && isCvEnabled()) {
    for (const type of status.pending) {
      const photo = photos.find((p) => p.photo_type === type);
      const filePath = path.join(uploadsDir, String(taskId), photo.filename);
      await validatePhoto(filePath, photo.id, photo.photo_type);
    }
    const refreshed = db.prepare(
      'SELECT * FROM task_photos WHERE task_id = ? AND photo_type IS NOT NULL'
    ).all(taskId);
    const after = getPhotoCvStatus(refreshed);
    return { ok: after.ok, failed: after.failed, pending: after.pending, warnings: after.warnings };
  }

  return {
    ok: status.ok,
    failed: status.failed || [],
    pending: status.pending,
    warnings: status.warnings,
  };
}
