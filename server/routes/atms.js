import { Router } from 'express';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  const atms = db.prepare(
    'SELECT * FROM atms WHERE active = 1 ORDER BY bank_name, address'
  ).all();
  res.json(atms);
});

router.get('/:id', (req, res) => {
  const atm = db.prepare('SELECT * FROM atms WHERE id = ?').get(req.params.id);
  if (!atm) return res.status(404).json({ error: 'Банкомат не найден' });
  res.json(atm);
});

router.post('/', requireRole('admin', 'supervisor'), (req, res) => {
  const { serial_number, bank_name, address, zone, notes } = req.body;
  if (!serial_number || !bank_name || !address) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  try {
    const result = db.prepare(
      'INSERT INTO atms (serial_number, bank_name, address, zone, notes) VALUES (?, ?, ?, ?, ?)'
    ).run(serial_number, bank_name, address, zone || null, notes || null);

    res.status(201).json(db.prepare('SELECT * FROM atms WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Серийный номер уже существует' });
    }
    throw e;
  }
});

router.patch('/:id', requireRole('admin', 'supervisor'), (req, res) => {
  const atm = db.prepare('SELECT id FROM atms WHERE id = ?').get(req.params.id);
  if (!atm) return res.status(404).json({ error: 'Банкомат не найден' });

  const { serial_number, bank_name, address, zone, notes, active } = req.body;
  const updates = [];
  const params = [];

  if (serial_number !== undefined) { updates.push('serial_number = ?'); params.push(serial_number); }
  if (bank_name !== undefined) { updates.push('bank_name = ?'); params.push(bank_name); }
  if (address !== undefined) { updates.push('address = ?'); params.push(address); }
  if (zone !== undefined) { updates.push('zone = ?'); params.push(zone); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  params.push(req.params.id);
  db.prepare(`UPDATE atms SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare('SELECT * FROM atms WHERE id = ?').get(req.params.id));
});

export default router;
