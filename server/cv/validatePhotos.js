import path from 'path';
import { fileURLToPath } from 'url';
import db, { REQUIRED_PHOTO_TYPES } from '../db.js';
import { detectAtmInPhoto, isCvEnabled } from './atmDetector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');

export const PHOTO_TYPE_LABELS = {
  left: 'Слева',
  right: 'Справа',
  front: 'Спереди',
  top: 'Сверху',
};

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
      SET cv_detected = ?, cv_confidence = ?, cv_checked_at = datetime('now')
      WHERE id = ?
    `).run(result.detected ? 1 : 0, result.confidence ?? 0, photoId);
  } catch (err) {
    console.error('saveCvResult error:', err.message);
  }
}

export async function validatePhoto(filePath, photoId) {
  return runInCvQueue(async () => {
    let result = { detected: true, confidence: 0, skipped: true, error: 'cv_unavailable' };
    try {
      result = await detectAtmInPhoto(filePath);
    } catch (err) {
      console.error('validatePhoto error:', err.message);
      result = { detected: true, confidence: 0, skipped: true, error: err.message };
    } finally {
      saveCvResult(photoId, result);
    }
    return result;
  });
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
  return { ok: failed.length === 0, failed, pending: [] };
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
      await validatePhoto(filePath, photo.id);
    }
    const refreshed = db.prepare(
      'SELECT * FROM task_photos WHERE task_id = ? AND photo_type IS NOT NULL'
    ).all(taskId);
    const after = getPhotoCvStatus(refreshed);
    return { ok: after.ok, failed: after.failed, pending: after.pending };
  }

  return { ok: status.ok, failed: status.failed || [], pending: status.pending };
}
