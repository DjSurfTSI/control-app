import { Router } from 'express';
import { authMiddleware, requireBizAdmin } from '../middleware.js';
import { getCvSettings, updateCvSettings } from '../cv/settings.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(authMiddleware);

router.get('/cv', requireBizAdmin, (_req, res) => {
  res.json(getCvSettings());
});

router.patch('/cv', requireBizAdmin, asyncHandler(async (req, res) => {
  const { enabled, threshold, margin } = req.body;
  try {
    const settings = updateCvSettings({ enabled, threshold, margin }, req.user.id);
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

export default router;
