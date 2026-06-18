import { Router } from 'express';
import { authMiddleware, requireBizAdmin } from '../middleware.js';
import { getCvSettings, updateCvSettings } from '../cv/settings.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.use(authMiddleware);

router.get('/cv/status', (_req, res) => {
  const settings = getCvSettings();
  res.json({
    enabled: settings.enabled,
    executor_mobile_camera_capture: settings.executor_mobile_camera_capture,
    cv_roles: settings.cv_roles,
    executor_photo_max_edge: settings.executor_photo_max_edge,
    executor_photo_jpeg_quality: settings.executor_photo_jpeg_quality,
    executor_photo_overlay: settings.executor_photo_overlay,
  });
});

router.get('/cv', requireBizAdmin, (_req, res) => {
  res.json(getCvSettings());
});

router.patch('/cv', requireBizAdmin, asyncHandler(async (req, res) => {
  const {
    enabled, threshold, margin, executor_mobile_camera_capture, cv_roles,
    executor_photo_max_edge, executor_photo_jpeg_quality, executor_photo_overlay,
  } = req.body;
  try {
    const settings = updateCvSettings({
      enabled, threshold, margin, executor_mobile_camera_capture, cv_roles,
      executor_photo_max_edge, executor_photo_jpeg_quality, executor_photo_overlay,
    }, req.user.id);
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

export default router;
