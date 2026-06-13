import { useEffect, useState } from 'react';
import { api } from '../api';
import ExcelImportModal from '../components/ExcelImportModal';

function DeviceModal({ device, onClose, onSave }) {
  const isNew = !device?.id;
  const [form, setForm] = useState({
    serial_number: device?.serial_number || '',
    territorial_bank: device?.territorial_bank || device?.bank_name || '',
    gosb: device?.gosb || device?.zone || '',
    address: device?.address || '',
    accessibility_type: device?.accessibility_type || '',
    installation_name: device?.installation_name || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      await onSave(isNew ? 'create' : 'update', form);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Добавить устройство' : 'Редактировать устройство'}</h2>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>ID УС *</label>
            <input value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Территориальный Банк *</label>
            <input value={form.territorial_bank} onChange={(e) => set('territorial_bank', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>ГОСБ *</label>
            <input value={form.gosb} onChange={(e) => set('gosb', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Вид доступности *</label>
            <input value={form.accessibility_type} onChange={(e) => set('accessibility_type', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Адрес места установки *</label>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Наименование места установки *</label>
          <input value={form.installation_name} onChange={(e) => set('installation_name', e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Atms() {
  const [atms, setAtms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [importModal, setImportModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setAtms(await api.getAtms()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (action, form) => {
    if (action === 'create') await api.createAtm(form);
    else await api.updateAtm(modal.id, form);
    load();
  };

  const handleDeactivate = async (atm) => {
    if (!confirm(`Деактивировать устройство ${atm.serial_number}?`)) return;
    await api.updateAtm(atm.id, { active: 0 });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Устройства самообслуживания</h2>
          <p className="page-subtitle">Реестр устройств самообслуживания</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setImportModal(true)}>📥 Импорт</button>
          <button className="btn-primary" onClick={() => setModal({})}>+ Добавить</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p className="empty-state">Загрузка...</p>
        ) : atms.length === 0 ? (
          <p className="empty-state">Устройства не добавлены</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID УС</th>
                  <th>Терр. Банк</th>
                  <th>ГОСБ</th>
                  <th>Адрес</th>
                  <th>Доступность</th>
                  <th>Место установки</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {atms.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.serial_number}</strong></td>
                    <td>{a.territorial_bank || a.bank_name}</td>
                    <td>{a.gosb || a.zone || '—'}</td>
                    <td>{a.address}</td>
                    <td>{a.accessibility_type || '—'}</td>
                    <td>{a.installation_name || '—'}</td>
                    <td className="actions">
                      <button className="btn-secondary btn-sm" onClick={() => setModal(a)}>Изменить</button>
                      <button className="btn-danger btn-sm" onClick={() => handleDeactivate(a)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && <DeviceModal device={modal.id ? modal : null} onClose={() => setModal(null)} onSave={handleSave} />}
      {importModal && (
        <ExcelImportModal
          title="Импорт устройств из Excel"
          description="Столбцы: ID УС, Территориальный Банк, ГОСБ, Адрес места установки, Вид доступности, Наименование места установки. Все поля обязательны."
          onClose={() => setImportModal(false)}
          onDone={load}
          onImport={api.importAtms}
          onDownloadTemplate={api.downloadAtmsTemplate}
        />
      )}
    </div>
  );
}
