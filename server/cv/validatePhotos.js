import path from 'path';
import { fileURLToPath } from 'url';
import db, { REQUIRED_PHOTO_TYPES } from '../db.js';
import { detectAtmInPhoto } from './atmDetector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');

export const PHOTO_TYPE_LABELS = {
  left: 'Слева',
  right: 'Справа',
  front: 'Спереди',
};

export function saveCvResult(photoId, result) {
  db.prepare(`
    UPDATE task_photos
    SET cv_detected = ?, cv_confidence = ?, cv_checked_at = datetime('now')
    WHERE id = ?
  `).run(result.detected ? 1 : 0, result.confidence ?? 0, photoId);
}

export async function validatePhoto(filePath, photoId) {
  const result = await detectAtmInPhoto(filePath);
  if (photoId) saveCvResult(photoId, result);
  return result;
}

export async function validateTaskPhotos(taskId) {
  const photos = db.prepare(
    'SELECT * FROM task_photos WHERE task_id = ? AND photo_type IS NOT NULL'
  ).all(taskId);

  const failed = [];

  for (const type of REQUIRED_PHOTO_TYPES) {
    const photo = photos.find((p) => p.photo_type === type);
    if (!photo) {
      return { ok: false, failed: [{ photo_type: type, reason: 'missing' }] };
    }

    const filePath = path.join(uploadsDir, String(taskId), photo.filename);
    const result = await validatePhoto(filePath, photo.id);

    if (!result.detected) {
      failed.push({
        photo_type: type,
        label: PHOTO_TYPE_LABELS[type],
        confidence: result.confidence,
      });
    }
  }

  return { ok: failed.length === 0, failed };
}
