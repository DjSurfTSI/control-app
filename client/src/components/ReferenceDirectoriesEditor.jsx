import { useEffect, useState } from 'react';
import { api } from '../api';

const DIRECTORY_SECTIONS = [
  { type: 'territorial_bank', label: 'Территориальный Банк' },
  { type: 'gosb', label: 'ГОСБ' },
  { type: 'accessibility_type', label: 'Вид доступности' },
];

export default function ReferenceDirectoriesEditor() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newValues, setNewValues] = useState({
    territorial_bank: '',
    gosb: '',
    accessibility_type: '',
  });
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setEntries(await api.getReferenceDirectoriesManage());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const byType = (type) => entries.filter((e) => e.type === type && e.active);

  const handleAdd = async (type) => {
    const value = newValues[type].trim();
    if (!value) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.createReferenceEntry({ type, value });
      setNewValues((v) => ({ ...v, [type]: '' }));
      setSuccess('Значение добавлено');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (id) => {
    const value = editValue.trim();
    if (!value) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.updateReferenceEntry(id, { value });
      setEditId(null);
      setEditValue('');
      setSuccess('Значение обновлено');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry) => {
    if (!confirm(`Удалить «${entry.value}» из справочника?`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.deleteReferenceEntry(entry.id);
      setSuccess('Значение удалено');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="empty-state">Загрузка справочников...</p>;

  return (
    <div className="reference-directories">
      <p className="hint reference-hint">
        Значения используются при ручном добавлении и редактировании устройств.
        При импорте из Excel в устройство записываются значения из файла, даже если их нет в справочнике.
      </p>

      {DIRECTORY_SECTIONS.map(({ type, label }) => (
        <section key={type} className="reference-section card">
          <h3>{label}</h3>
          <div className="reference-add-row">
            <input
              value={newValues[type]}
              onChange={(e) => setNewValues((v) => ({ ...v, [type]: e.target.value }))}
              placeholder={`Новое значение: ${label}`}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd(type)}
            />
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={saving || !newValues[type].trim()}
              onClick={() => handleAdd(type)}
            >
              Добавить
            </button>
          </div>
          <ul className="reference-list">
            {byType(type).length === 0 ? (
              <li className="reference-empty">Нет значений</li>
            ) : (
              byType(type).map((entry) => (
                <li key={entry.id} className="reference-item">
                  {editId === entry.id ? (
                    <>
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(entry.id)}
                      />
                      <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={() => handleSaveEdit(entry.id)}>
                        Сохранить
                      </button>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => { setEditId(null); setEditValue(''); }}>
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <span>{entry.value}</span>
                      <div className="reference-item-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => { setEditId(entry.id); setEditValue(entry.value); }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          disabled={saving}
                          onClick={() => handleDelete(entry)}
                        >
                          Удалить
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      ))}

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}
    </div>
  );
}
