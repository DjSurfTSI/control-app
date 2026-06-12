import crypto from 'crypto';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware.js';

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function apiKeyMiddleware(req, res, next) {
  const key = req.headers['x-api-key'] || req.headers.authorization?.replace(/^ApiKey\s+/i, '');
  if (!key) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Требуется заголовок X-API-Key',
    });
  }

  const hash = hashKey(key);
  const client = db.prepare('SELECT * FROM api_clients WHERE api_key_hash = ? AND active = 1').get(hash);
  if (!client) {
    return res.status(401).json({ error: 'unauthorized', message: 'Недействительный API-ключ' });
  }

  let scopes = [];
  try { scopes = JSON.parse(client.scopes); } catch { /* ignore */ }

  req.apiClient = { ...client, scopes };
  db.prepare("UPDATE api_clients SET last_used_at = datetime('now') WHERE id = ?").run(client.id);

  db.prepare(`
    INSERT INTO integration_log (api_client_id, direction, method, path, status_code)
    VALUES (?, 'inbound', ?, ?, 0)
  `).run(client.id, req.method, req.originalUrl);

  next();
}

export function requireScope(...needed) {
  return (req, res, next) => {
    const scopes = req.apiClient?.scopes || [];
    const ok = needed.some((s) => scopes.includes(s) || scopes.includes('*'));
    if (!ok) {
      return res.status(403).json({
        error: 'forbidden',
        message: `Требуется scope: ${needed.join(' или ')}`,
      });
    }
    next();
  };
}

export function logIntegrationResponse(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (req.apiClient) {
      db.prepare(`
        UPDATE integration_log SET status_code = ?
        WHERE id = (SELECT id FROM integration_log WHERE api_client_id = ? ORDER BY id DESC LIMIT 1)
      `).run(res.statusCode, req.apiClient.id);
    }
    return originalJson(body);
  };
  next();
}

export const adminOnly = [authMiddleware, requireRole('admin')];

export function generateApiKey() {
  return `atk_${crypto.randomBytes(24).toString('hex')}`;
}

export function hashApiKey(key) {
  return hashKey(key);
}
