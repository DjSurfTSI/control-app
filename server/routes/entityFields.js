import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware.js';
import {
  getDefaultFieldCatalog,
  getEntityFieldConfig,
  saveEntityFieldConfig,
} from '../utils/entityFields.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (_req, res) => {
  res.json(getEntityFieldConfig());
});

router.get('/defaults', requireRole('bizadmin'), (_req, res) => {
  res.json(getDefaultFieldCatalog());
});

router.put('/', requireRole('bizadmin'), (req, res) => {
  const { config } = req.body;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Укажите config' });
  }
  const merged = saveEntityFieldConfig(config, req.user.id);
  res.json(merged);
});

router.post('/reset', requireRole('bizadmin'), (req, res) => {
  const { entity } = req.body || {};
  const current = getEntityFieldConfig();
  const defaults = getDefaultFieldCatalog();

  if (entity && defaults[entity]) {
    current[entity] = defaults[entity].map((f, i) => ({ ...f, order: i }));
    const merged = saveEntityFieldConfig(current, req.user.id);
    return res.json(merged);
  }

  const merged = saveEntityFieldConfig(defaults, req.user.id);
  res.json(merged);
});

export default router;
