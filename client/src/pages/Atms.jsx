import { useEffect, useState } from 'react';
import { api } from '../api';

function AtmModal({ atm, onClose, onSave }) {
  const isNew = !atm?.id;
  const [form, setForm] = useState({
    serial_number: atm?.serial_number || '',
    bank_name: atm?.bank_name || '',
    address: atm?.address || '',
    zone: atm?.zone || '',
    notes: atm?.notes || '',
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Добавить банкомат' : 'Редактировать банкомат'}</h2>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-row">
          <div className="form-group">
            <label>Серийный номер *</label>
            <input value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Банк *</label>
            <input value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Адрес *</label>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Зона</label>
          <input value={form.zone} onChange={(e) => set('zone', e.target.value)} placeholder="Центр, Север..." />
        </div>
        <div className="form-group">
          <label>Примечания</label>
          <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
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

  const load = async () => {
    setLoading(true);
    try {
      setAtms(await api.getAtms());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (action, form) => {
    if (action === 'create') {
      await api.createAtm(form);
    } else {
      await api.updateAtm(modal.id, form);
    }
    load();
  };

  const handleDeactivate = async (atm) => {
    if (!confirm(`Деактивировать банкомат ${atm.serial_number}?`)) return;
    await api.updateAtm(atm.id, { active: 0 });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Банкоматы</h2>
          <p className="page-subtitle">Реестр точек обслуживания</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({})}>+ Добавить</button>
      </div>

      <div className="card">
        {loading ? (
          <p className="empty-state">Загрузка...</p>
        ) : atms.length === 0 ? (
          <p className="empty-state">Банкоматы не добавлены</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Банк</th>
                  <th>Адрес</th>
                  <th>Зона</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {atms.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.serial_number}</strong></td>
                    <td>{a.bank_name}</td>
                    <td>{a.address}</td>
                    <td>{a.zone || '—'}</td>
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

      {modal && (
        <AtmModal atm={modal.id ? modal : null} onClose={() => setModal(null)} onSave={handleSave} />
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .page-title { font-size: 1.75rem; margin-bottom: 0.25rem; }
        .page-subtitle { color: var(--text-muted); }
        .actions { display: flex; gap: 0.4rem; }
      `}</style>
    </div>
  );
}
