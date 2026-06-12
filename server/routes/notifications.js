import { Router } from 'express';
import db from '../db.js';
import { authMiddleware } from '../middleware.js';
import { getVapidPublicKey } from '../push.js';

const router = Router();

router.get('/vapid-public-key', authMiddleware, (req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post('/subscribe', authMiddleware, (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Некорректная подписка' });
  }

  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  db.prepare(
    'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, endpoint, keys.p256dh, keys.auth);

  res.json({ ok: true });
});

router.delete('/subscribe', authMiddleware, (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .run(endpoint, req.user.id);
  } else {
    db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run(req.user.id);
  }
  res.json({ ok: true });
});

router.get('/pending', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const alerts = [];

  if (req.user.role === 'cleaner') {
    const pending = db.prepare(`
      SELECT COUNT(*) as c FROM cleaning_tasks
      WHERE assigned_to = ? AND scheduled_date = ? AND status = 'pending'
    `).get(req.user.id, today).c;

    if (pending > 0) {
      alerts.push({ type: 'info', message: `У вас ${pending} заявок на сегодня` });
    }

    const overdue = db.prepare(`
      SELECT COUNT(*) as c FROM cleaning_tasks
      WHERE assigned_to = ? AND status = 'overdue'
    `).get(req.user.id).c;

    if (overdue > 0) {
      alerts.push({ type: 'warning', message: `${overdue} просроченных заявок` });
    }
  } else {
    const overdue = db.prepare(`
      SELECT COUNT(*) as c FROM cleaning_tasks WHERE status = 'overdue'
    `).get().c;

    if (overdue > 0) {
      alerts.push({ type: 'warning', message: `${overdue} просроченных заявок` });
    }
  }

  res.json(alerts);
});

export default router;
