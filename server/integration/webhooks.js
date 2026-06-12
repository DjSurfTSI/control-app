import crypto from 'crypto';
import db from '../db.js';

export const WEBHOOK_EVENTS = [
  'task.created',
  'task.updated',
  'task.completed',
  'task.cancelled',
  'task.overdue',
  'atm.created',
  'atm.updated',
];

export async function dispatchWebhooks(event, payload) {
  const endpoints = db.prepare(`
    SELECT w.*, c.name as client_name
    FROM webhook_endpoints w
    JOIN api_clients c ON c.id = w.api_client_id
    WHERE w.active = 1 AND c.active = 1
  `).all();

  const targets = endpoints.filter((ep) => {
    try {
      const events = JSON.parse(ep.events);
      return events.includes(event) || events.includes('*');
    } catch {
      return false;
    }
  });

  for (const ep of targets) {
    sendWebhook(ep, event, payload).catch((err) => {
      console.error(`Webhook error [${ep.url}]:`, err.message);
    });
  }
}

async function sendWebhook(endpoint, event, payload) {
  const body = JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = crypto
    .createHmac('sha256', endpoint.secret)
    .update(body)
    .digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Delivery': crypto.randomUUID(),
      },
      body,
      signal: controller.signal,
    });

    db.prepare(`
      INSERT INTO integration_log (api_client_id, direction, method, path, status_code, payload)
      VALUES (?, 'outbound', 'POST', ?, ?, ?)
    `).run(endpoint.api_client_id, endpoint.url, res.status, body.slice(0, 2000));
  } finally {
    clearTimeout(timeout);
  }
}
