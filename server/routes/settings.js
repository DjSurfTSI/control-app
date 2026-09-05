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
    angle_check_enabled: settings.angle_check_enabled,
    angle_block_on_mismatch: settings.angle_block_on_mismatch,
    cleanliness_check_enabled: settings.cleanliness_check_enabled,
    cleanliness_block_on_dirty: settings.cleanliness_block_on_dirty,
  });
});

router.get('/cv', requireBizAdmin, (_req, res) => {
  res.json(getCvSettings());
});

router.patch('/cv', requireBizAdmin, asyncHandler(async (req, res) => {
  const {
    enabled, threshold, margin, executor_mobile_camera_capture, cv_roles,
    executor_photo_max_edge, executor_photo_jpeg_quality, executor_photo_overlay,
    angle_check_enabled, angle_threshold, angle_block_on_mismatch,
    cleanliness_check_enabled, cleanliness_threshold, cleanliness_block_on_dirty,
  } = req.body;
  try {
    const settings = updateCvSettings({
      enabled, threshold, margin, executor_mobile_camera_capture, cv_roles,
      executor_photo_max_edge, executor_photo_jpeg_quality, executor_photo_overlay,
      angle_check_enabled, angle_threshold, angle_block_on_mismatch,
      cleanliness_check_enabled, cleanliness_threshold, cleanliness_block_on_dirty,
    }, req.user.id);
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

export default router;
