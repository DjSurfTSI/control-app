import { Router } from 'express';
import multer from 'multer';
import db from '../db.js';
import { authMiddleware, requireRole } from '../middleware.js';
import { readExcelRows, writeExcelBuffer, pickColumn } from '../utils/excelImport.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = Router();

router.use(authMiddleware);

function mapDevice(row) {
  return {
    ...row,
    territorial_bank: row.territorial_bank || row.bank_name,
    gosb: row.gosb || row.zone,
  };
}

router.get('/', (req, res) => {
  const atms = db.prepare(
    'SELECT * FROM atms WHERE active = 1 ORDER BY territorial_bank, bank_name, address'
  ).all().map(mapDevice);
  res.json(atms);
});

router.get('/import-template', requireRole('admin', 'supervisor'), (_req, res) => {
  const buf = writeExcelBuffer([
    {
      'ID УС': 'US-001',
      'Территориальный Банк': 'Московский банк',
      'ГОСБ': 'ГОСБ-12',
      'Адрес места установки': 'ул. Ленина, 15',
      'Вид доступности': 'Круглосуточный',
      'Наименование места установки': 'ТЦ Центральный',
    },
  ], 'Устройства');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="shablon-us.xlsx"');
  res.send(buf);
});

router.post('/import', requireRole('admin', 'supervisor'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Загрузите Excel-файл (.xlsx)' });

  let rows;
  try {
    rows = readExcelRows(req.file.buffer);
  } catch {
    return res.status(400).json({ error: 'Не удалось прочитать файл Excel' });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'Файл пуст' });

  const insert = db.prepare(`
    INSERT INTO atms (serial_number, bank_name, territorial_bank, address, gosb, zone, accessibility_type, installation_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const created = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const deviceId = pickColumn(row, 'ID УС', 'id ус', 'serial_number');
    const territorialBank = pickColumn(row, 'Территориальный Банк', 'территориальный банк');
    const gosb = pickColumn(row, 'ГОСБ', 'gosb');
    const address = pickColumn(row, 'Адрес места установки', 'адрес места установки', 'Адрес');
    const accessibility = pickColumn(row, 'Вид доступности', 'вид доступности');
    const installationName = pickColumn(row, 'Наименование места установки', 'наименование места установки');

    if (!deviceId || !territorialBank || !gosb || !address || !accessibility || !installationName) {
      errors.push({ line, error: 'Заполните все обязательные поля' });
      return;
    }

    try {
      const result = insert.run(
        String(deviceId).trim(),
        territorialBank,
        territorialBank,
        address,
        gosb,
        gosb,
        accessibility,
        installationName,
      );
      created.push({ line, id: result.lastInsertRowid, serial_number: deviceId });
    } catch (e) {
      errors.push({ line, error: e.message.includes('UNIQUE') ? `ID УС «${deviceId}» уже существует` : e.message });
    }
  });

  res.json({ total: rows.length, created: created.length, failed: errors.length, devices: created, errors });
});

router.get('/:id', (req, res) => {
  const atm = db.prepare('SELECT * FROM atms WHERE id = ?').get(req.params.id);
  if (!atm) return res.status(404).json({ error: 'Устройство не найдено' });
  res.json(mapDevice(atm));
});

router.post('/', requireRole('admin', 'supervisor'), (req, res) => {
  const {
    serial_number, territorial_bank, bank_name, gosb, zone,
    address, accessibility_type, installation_name, notes,
  } = req.body;
  const tb = territorial_bank || bank_name;
  const gb = gosb || zone;
  if (!serial_number || !tb || !gb || !address || !accessibility_type || !installation_name) {
    return res.status(400).json({ error: 'Заполните все обязательные поля' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO atms (serial_number, bank_name, territorial_bank, address, gosb, zone, accessibility_type, installation_name, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(serial_number, tb, tb, address, gb, gb, accessibility_type, installation_name, notes || null);

    res.status(201).json(mapDevice(db.prepare('SELECT * FROM atms WHERE id = ?').get(result.lastInsertRowid)));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'ID УС уже существует' });
    }
    throw e;
  }
});

router.patch('/:id', requireRole('admin', 'supervisor'), (req, res) => {
  const atm = db.prepare('SELECT id FROM atms WHERE id = ?').get(req.params.id);
  if (!atm) return res.status(404).json({ error: 'Устройство не найдено' });

  const fields = {
    serial_number: req.body.serial_number,
    territorial_bank: req.body.territorial_bank ?? req.body.bank_name,
    gosb: req.body.gosb ?? req.body.zone,
    address: req.body.address,
    accessibility_type: req.body.accessibility_type,
    installation_name: req.body.installation_name,
    notes: req.body.notes,
    active: req.body.active,
  };

  const updates = [];
  const params = [];
  if (fields.serial_number !== undefined) { updates.push('serial_number = ?'); params.push(fields.serial_number); }
  if (fields.territorial_bank !== undefined) {
    updates.push('bank_name = ?', 'territorial_bank = ?');
    params.push(fields.territorial_bank, fields.territorial_bank);
  }
  if (fields.gosb !== undefined) {
    updates.push('gosb = ?', 'zone = ?');
    params.push(fields.gosb, fields.gosb);
  }
  if (fields.address !== undefined) { updates.push('address = ?'); params.push(fields.address); }
  if (fields.accessibility_type !== undefined) { updates.push('accessibility_type = ?'); params.push(fields.accessibility_type); }
  if (fields.installation_name !== undefined) { updates.push('installation_name = ?'); params.push(fields.installation_name); }
  if (fields.notes !== undefined) { updates.push('notes = ?'); params.push(fields.notes); }
  if (fields.active !== undefined) { updates.push('active = ?'); params.push(fields.active ? 1 : 0); }

  if (updates.length === 0) return res.status(400).json({ error: 'Нет данных для обновления' });

  params.push(req.params.id);
  db.prepare(`UPDATE atms SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(mapDevice(db.prepare('SELECT * FROM atms WHERE id = ?').get(req.params.id)));
});

export default router;
