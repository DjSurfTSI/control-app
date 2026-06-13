import { Router } from 'express';
import { authMiddleware, requireRole, requireBizAdmin } from '../middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listReferenceDirectories,
  listReferenceDirectoriesManage,
  addReferenceEntry,
  updateReferenceEntry,
  deleteReferenceEntry,
} from '../utils/referenceDirectories.js';

const router = Router();

router.use(authMiddleware);

router.get('/', requireRole('admin', 'supervisor'), (_req, res) => {
  res.json(listReferenceDirectories());
});

router.get('/manage', requireBizAdmin, (_req, res) => {
  res.json(listReferenceDirectoriesManage());
});

router.post('/', requireBizAdmin, asyncHandler(async (req, res) => {
  const entry = addReferenceEntry(req.body.type, req.body.value);
  res.status(201).json(entry);
}));

router.patch('/:id', requireBizAdmin, asyncHandler(async (req, res) => {
  res.json(updateReferenceEntry(Number(req.params.id), req.body));
}));

router.delete('/:id', requireBizAdmin, asyncHandler(async (req, res) => {
  res.json(deleteReferenceEntry(Number(req.params.id)));
}));

export default router;
