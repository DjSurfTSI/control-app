import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getDefaultWorkspace, getUserWorkspace, saveUserWorkspace } from '../utils/workspace.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  const config = getUserWorkspace(req.user.id, req.user.role);
  res.json({
    config,
    isDefault: !db.prepare('SELECT 1 FROM user_workspaces WHERE user_id = ?').get(req.user.id),
  });
});

router.put('/', asyncHandler(async (req, res) => {
  const config = saveUserWorkspace(req.user.id, req.user.role, req.body?.config || req.body);
  res.json({ config });
}));

router.post('/reset', (req, res) => {
  const config = getDefaultWorkspace(req.user.role);
  saveUserWorkspace(req.user.id, req.user.role, config);
  res.json({ config });
});

export default router;
