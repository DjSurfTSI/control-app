import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db, { REQUIRED_PHOTO_TYPES } from '../db.js';
import { authMiddleware } from '../middleware.js';
import { isManager, isExecutor } from '../roles.js';
import { canExecutorSelfAssignTask } from '../constants.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validatePhoto } from '../cv/validatePhotos.js';
import { isCvEnabled } from '../cv/atmDetector.js';
import { optimizePhoto, applyWatermark } from '../utils/optimizePhoto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');
const UPLOAD_LIMIT_MB = parseInt(process.env.PHOTO_UPLOAD_MAX_MB || '12', 10);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadsDir, String(req.params.taskId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_LIMIT_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  },
});

const router = Router();
router.use(authMiddleware);

function canAccessTask(task, user) {
  if (isManager(user)) return true;
  if (isExecutor(user)) {
    return task.assigned_to === user.id || canExecutorSelfAssignTask(task);
  }
  return false;
}

function photoUrl(req, taskId, filename) {
  const token = req.headers.authorization?.slice(7) || req.query.token || '';
  const qs = token ? `?token=${token}` : '';
  return `/api/photos/${taskId}/file/${filename}${qs}`;
}

function mapPhoto(req, taskId, photo) {
  return {
    ...photo,
    url: photoUrl(req, taskId, photo.filename),
  };
}

router.get('/:taskId', asyncHandler(async (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
  if (!canAccessTask(task, req.user)) return res.status(403).json({ error: 'Нет доступа' });

  const photos = db.prepare(
    `SELECT id, filename, original_name, photo_type, uploaded_by, created_at,
            cv_detected, cv_confidence, cv_checked_at
     FROM task_photos WHERE task_id = ? ORDER BY photo_type, created_at`
  ).all(req.params.taskId);

  res.json(photos.map((p) => mapPhoto(req, req.params.taskId, p)));
}));

router.post('/:taskId', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, asyncHandler(async (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
  if (!canAccessTask(task, req.user)) return res.status(403).json({ error: 'Нет доступа' });
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

  const photoType = req.body.photo_type;
  if (!photoType || !REQUIRED_PHOTO_TYPES.includes(photoType)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Укажите тип фото: left, right или front' });
  }

  const existing = db.prepare(
    'SELECT * FROM task_photos WHERE task_id = ? AND photo_type = ?'
  ).get(req.params.taskId, photoType);

  if (existing) {
    const oldPath = path.join(uploadsDir, req.params.taskId, existing.filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    db.prepare('DELETE FROM task_photos WHERE id = ?').run(existing.id);
  }

  let optimized;
  try {
    optimized = await optimizePhoto(req.file.path);
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error(`Photo upload optimize failed (task ${req.params.taskId}):`, err.message);
    return res.status(400).json({ error: 'Не удалось обработать изображение. Попробуйте другое фото или уменьшите размер.' });
  }

  const result = db.prepare(
    'INSERT INTO task_photos (task_id, filename, original_name, photo_type, uploaded_by) VALUES (?, ?, ?, ?, ?)'
  ).run(
    req.params.taskId,
    optimized.filename,
    req.file.originalname,
    photoType,
    req.user.id
  );

  const photo = db.prepare('SELECT * FROM task_photos WHERE id = ?').get(result.lastInsertRowid);

  const cvEnabled = isCvEnabled();
  if (cvEnabled) {
    const cvCopy = `${optimized.path}.cvcheck.jpg`;
    fs.copyFileSync(optimized.path, cvCopy);
    try {
      await validatePhoto(cvCopy, photo.id);
    } finally {
      if (fs.existsSync(cvCopy)) fs.unlinkSync(cvCopy);
    }
  }

  try {
    await applyWatermark(optimized.path, `Заявка #${task.id} · ${new Date().toLocaleString('ru-RU')}`);
  } catch (err) {
    console.error(`Watermark failed (task ${req.params.taskId}):`, err.message);
  }

  const saved = db.prepare(
    `SELECT id, filename, original_name, photo_type, uploaded_by, created_at,
            cv_detected, cv_confidence, cv_checked_at
     FROM task_photos WHERE id = ?`
  ).get(photo.id);

  res.status(201).json({
    ...mapPhoto(req, req.params.taskId, saved),
    cv_pending: false,
    optimized: {
      width: optimized.width,
      height: optimized.height,
      bytes: optimized.bytes,
    },
  });
}));

router.get('/:taskId/file/:filename', asyncHandler(async (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
  if (!canAccessTask(task, req.user)) return res.status(403).json({ error: 'Нет доступа' });

  const photo = db.prepare(
    'SELECT * FROM task_photos WHERE task_id = ? AND filename = ?'
  ).get(req.params.taskId, req.params.filename);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });

  res.sendFile(path.join(uploadsDir, req.params.taskId, req.params.filename));
}));

router.delete('/:taskId/:photoId', asyncHandler(async (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });

  const photo = db.prepare('SELECT * FROM task_photos WHERE id = ? AND task_id = ?')
    .get(req.params.photoId, req.params.taskId);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });

  const isOwner = photo.uploaded_by === req.user.id;
  if (!isOwner && !isManager(req.user)) return res.status(403).json({ error: 'Нет доступа' });

  const filePath = path.join(uploadsDir, req.params.taskId, photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM task_photos WHERE id = ?').run(photo.id);
  res.json({ ok: true });
}));

export default router;
