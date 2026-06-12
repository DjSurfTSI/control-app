import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db, { REQUIRED_PHOTO_TYPES } from '../db.js';
import { authMiddleware } from '../middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadsDir, String(req.params.taskId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Только изображения'));
  },
});

const router = Router();
router.use(authMiddleware);

function canAccessTask(task, user) {
  if (user.role !== 'cleaner') return true;
  return task.assigned_to === user.id;
}

function photoUrl(req, taskId, filename) {
  const token = req.headers.authorization?.slice(7) || req.query.token || '';
  const qs = token ? `?token=${token}` : '';
  return `/api/photos/${taskId}/file/${filename}${qs}`;
}

router.get('/:taskId', (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
  if (!canAccessTask(task, req.user)) return res.status(403).json({ error: 'Нет доступа' });

  const photos = db.prepare(
    'SELECT id, filename, original_name, photo_type, uploaded_by, created_at FROM task_photos WHERE task_id = ? ORDER BY photo_type, created_at'
  ).all(req.params.taskId);

  res.json(photos.map((p) => ({
    ...p,
    url: photoUrl(req, req.params.taskId, p.filename),
  })));
});

router.post('/:taskId', upload.single('photo'), (req, res) => {
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

  const result = db.prepare(
    'INSERT INTO task_photos (task_id, filename, original_name, photo_type, uploaded_by) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.taskId, req.file.filename, req.file.originalname, photoType, req.user.id);

  const photo = db.prepare('SELECT * FROM task_photos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    ...photo,
    url: photoUrl(req, req.params.taskId, photo.filename),
  });
});

router.get('/:taskId/file/:filename', (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });
  if (!canAccessTask(task, req.user)) return res.status(403).json({ error: 'Нет доступа' });

  const photo = db.prepare(
    'SELECT * FROM task_photos WHERE task_id = ? AND filename = ?'
  ).get(req.params.taskId, req.params.filename);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });

  res.sendFile(path.join(uploadsDir, req.params.taskId, req.params.filename));
});

router.delete('/:taskId/:photoId', (req, res) => {
  const task = db.prepare('SELECT * FROM cleaning_tasks WHERE id = ?').get(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'Заявка не найдена' });

  const photo = db.prepare('SELECT * FROM task_photos WHERE id = ? AND task_id = ?')
    .get(req.params.photoId, req.params.taskId);
  if (!photo) return res.status(404).json({ error: 'Фото не найдено' });

  const isOwner = photo.uploaded_by === req.user.id;
  const isManager = req.user.role === 'admin' || req.user.role === 'supervisor';
  if (!isOwner && !isManager) return res.status(403).json({ error: 'Нет доступа' });

  const filePath = path.join(uploadsDir, req.params.taskId, photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM task_photos WHERE id = ?').run(photo.id);
  res.json({ ok: true });
});

export default router;
