import webpush from 'web-push';
import db from './db.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSGJqwWJGoQl8TI';

webpush.setVapidDetails(
  'mailto:admin@bank.ru',
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

export function getVapidPublicKey() {
  return VAPID_PUBLIC;
}

export async function sendPushToUser(userId, payload) {
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  const data = JSON.stringify(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        data
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      }
    }
  }
}

export function notifyTaskAssigned(task, assigneeId) {
  if (!assigneeId) return;
  sendPushToUser(assigneeId, {
    title: 'Новая заявка',
    body: `Уборка ${task.serial_number} — ${task.address}`,
    url: '/tasks',
  });
}

export function notifyTaskCompleted(task, supervisorIds) {
  for (const uid of supervisorIds) {
    sendPushToUser(uid, {
      title: 'Уборка выполнена',
      body: `${task.serial_number} — ${task.assignee_name || 'Уборщик'}`,
      url: '/tasks?status=completed',
    });
  }
}

export function notifyOverdue(count, managerIds) {
  for (const uid of managerIds) {
    sendPushToUser(uid, {
      title: 'Просроченные заявки',
      body: `${count} заявок требуют внимания`,
      url: '/tasks?status=overdue',
    });
  }
}
