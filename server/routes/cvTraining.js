import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, requireBizAdmin } from '../middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  MIN_SAMPLES_PER_CLASS,
  TRAINING_CLASSES,
  TRAINING_KINDS,
  deactivateModel,
  getTrainingSummary,
  trainModel,
} from '../cv/training.js';
import { PHOTO_TYPE_LABELS } from '../cv/validatePhotos.js';

const router = Router();
router.use(authMiddleware, requireBizAdmin);

const PAGE_SIZE_MAX = 200;

function photoUrl(req, taskId, filename) {
  const token = req.headers.authorization?.slice(7) || req.query.token || '';
  const qs = token ? `?token=${token}` : '';
  return `/api/photos/${taskId}/file/${filename}${qs}`;
}

function assertKind(kind) {
  if (!TRAINING_KINDS.includes(kind)) {
    const err = new Error(`Тип модели должен быть одним из: ${TRAINING_KINDS.join(', ')}`);
    err.status = 400;
    throw err;
  }
}

/** Сводка по обеим моделям: сколько размечено и что сейчас активно. */
router.get('/summary', asyncHandler(async (_req, res) => {
  res.json({
    kinds: TRAINING_KINDS.map((kind) => getTrainingSummary(kind)),
    min_samples_per_class: MIN_SAMPLES_PER_CLASS,
  });
}));

/**
 * Фото из заявок для разметки. Параметр labeled=only|none фильтрует
 * уже размеченные, чтобы администратор не проходил их повторно.
 */
router.get('/photos', asyncHandler(async (req, res) => {
  const kind = req.query.kind || 'cleanliness';
  assertKind(kind);

  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit || '60', 10)));
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10));
  const labeled = req.query.labeled || 'all';
  const photoType = req.query.photo_type || null;

  const filters = ['p.photo_type IS NOT NULL'];
  const params = { kind };

  if (labeled === 'only') filters.push('s.id IS NOT NULL');
  if (labeled === 'none') filters.push('s.id IS NULL');
  if (photoType) {
    filters.push('p.photo_type = @photo_type');
    params.photo_type = photoType;
  }

  const where = `WHERE ${filters.join(' AND ')}`;
  const total = db.prepare(`
    SELECT COUNT(*) AS n FROM task_photos p
    LEFT JOIN cv_training_samples s ON s.photo_id = p.id AND s.kind = @kind
    ${where}
  `).get(params).n;

  const rows = db.prepare(`
    SELECT p.id, p.task_id, p.filename, p.photo_type, p.created_at,
           p.cv_angle, p.cv_angle_confidence, p.cv_cleanliness, p.cv_cleanliness_score, p.cv_issues,
           s.id AS sample_id, s.label AS sample_label,
           a.serial_number, a.address
    FROM task_photos p
    LEFT JOIN cv_training_samples s ON s.photo_id = p.id AND s.kind = @kind
    LEFT JOIN cleaning_tasks t ON t.id = p.task_id
    LEFT JOIN atms a ON a.id = t.atm_id
    ${where}
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });

  res.json({
    total,
    limit,
    offset,
    kind,
    classes: TRAINING_CLASSES[kind],
    photos: rows.map((r) => ({
      id: r.id,
      task_id: r.task_id,
      photo_type: r.photo_type,
      photo_type_label: PHOTO_TYPE_LABELS[r.photo_type] || r.photo_type,
      serial_number: r.serial_number,
      address: r.address,
      created_at: r.created_at,
      cv_angle: r.cv_angle,
      cv_cleanliness: r.cv_cleanliness,
      label: r.sample_label || null,
      url: photoUrl(req, r.task_id, r.filename),
    })),
  });
}));

/** Ставит или обновляет метку. label=null снимает разметку. */
router.post('/samples', asyncHandler(async (req, res) => {
  const { photo_id: photoId, kind, label } = req.body;
  assertKind(kind);

  const photo = db.prepare('SELECT id, task_id FROM task_photos WHERE id = ?').get(photoId);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });

  if (label === null || label === '') {
    db.prepare('DELETE FROM cv_training_samples WHERE photo_id = ? AND kind = ?').run(photoId, kind);
    return res.json({ ok: true, label: null, summary: getTrainingSummary(kind) });
  }

  if (!TRAINING_CLASSES[kind].includes(label)) {
    return res.status(400).json({ error: `Метка должна быть одной из: ${TRAINING_CLASSES[kind].join(', ')}` });
  }

  db.prepare(`
    INSERT INTO cv_training_samples (photo_id, task_id, kind, label, created_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(photo_id, kind) DO UPDATE SET
      label = excluded.label,
      created_by = excluded.created_by,
      created_at = datetime('now')
  `).run(photoId, photo.task_id, kind, label, req.user.id);

  res.json({ ok: true, label, summary: getTrainingSummary(kind) });
}));

/** Запускает переобучение. Считает эмбеддинги недостающих фото — может занять минуту. */
router.post('/train', asyncHandler(async (req, res) => {
  const kind = req.body.kind;
  assertKind(kind);

  try {
    const model = await trainModel(kind, req.user.id);
    res.json({ ok: true, model, summary: getTrainingSummary(kind) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

/** Возврат к zero-shot: активная модель отключается, разметка сохраняется. */
router.post('/reset', asyncHandler(async (req, res) => {
  const kind = req.body.kind;
  assertKind(kind);
  deactivateModel(kind);
  res.json({ ok: true, summary: getTrainingSummary(kind) });
}));

export default router;
