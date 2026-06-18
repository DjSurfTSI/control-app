import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import ExcelImportModal from '../components/ExcelImportModal';
import EntityFieldTable from '../components/EntityFieldTable';
import { EntityCustomFormFields, mergeCustomIntoPayload } from '../components/EntityCustomFormFields';
import { getEntityFieldValue } from '../utils/entityFields';

const EMPTY_DIRECTORIES = {
  territorial_bank: [],
  gosb: [],
  accessibility_type: [],
};

function DirectorySelect({ label, value, options, onChange, required, allowExtra }) {
  const showExtra = allowExtra && value && !options.includes(value);
  return (
    <div className="form-group">
      <label>{label}{required ? ' *' : ''}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">— Выберите —</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        {showExtra && <option value={value}>{value}</option>}
      </select>
      {showExtra && <p className="hint">Значение не в справочнике (из импорта). При сохранении выберите значение из списка.</p>}
      {!showExtra && options.length === 0 && (
        <p className="hint">Справочник пуст. Добавьте значения в Настройки → Справочники.</p>
      )}
    </div>
  );
}

function DeviceModal({ device, directories, onClose, onSave, userRole }) {
  const isNew = !device?.id;
  const [form, setForm] = useState({
    serial_number: device?.serial_number || '',
    territorial_bank: device?.territorial_bank || device?.bank_name || '',
    gosb: device?.gosb || device?.zone || '',
    address: device?.address || '',
    accessibility_type: device?.accessibility_type || '',
    installation_name: device?.installation_name || '',
    notes: device?.notes || '',
  });
  const [customFields, setCustomFields] = useState({ ...(device?.custom_fields || {}) });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      await onSave(isNew ? 'create' : 'update', mergeCustomIntoPayload(form, customFields));
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
          <DirectorySelect
            label="Территориальный Банк"
            value={form.territorial_bank}
            options={directories.territorial_bank}
            onChange={(val) => set('territorial_bank', val)}
            required
            allowExtra={!isNew}
          />
        </div>
        <div className="form-row">
          <DirectorySelect
            label="ГОСБ"
            value={form.gosb}
            options={directories.gosb}
            onChange={(val) => set('gosb', val)}
            required
            allowExtra={!isNew}
          />
          <DirectorySelect
            label="Вид доступности"
            value={form.accessibility_type}
            options={directories.accessibility_type}
            onChange={(val) => set('accessibility_type', val)}
            required
            allowExtra={!isNew}
          />
        </div>
        <div className="form-group">
          <label>Адрес места установки *</label>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Наименование места установки *</label>
          <input value={form.installation_name} onChange={(e) => set('installation_name', e.target.value)} />
        </div>
        <EntityCustomFormFields
          entity="atms"
          customValues={customFields}
          onCustomChange={(key, val) => setCustomFields((c) => ({ ...c, [key]: val }))}
          role={userRole}
        />
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
  const { user } = useAuth();
  const [atms, setAtms] = useState([]);
  const [directories, setDirectories] = useState(EMPTY_DIRECTORIES);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [importModal, setImportModal] = useState(false);

  const loadDirectories = async () => {
    try {
      setDirectories(await api.getReferenceDirectories());
    } catch {
      setDirectories(EMPTY_DIRECTORIES);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      setAtms(await api.getAtms());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadDirectories();
  }, []);

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

  const renderAtmCell = (field, atm) => {
    if (field.type === 'actions') {
      return (
        <>
          <button className="btn-secondary btn-xs" type="button" onClick={() => setModal(atm)}>Изменить</button>
          <button className="btn-danger btn-xs" type="button" onClick={() => handleDeactivate(atm)}>Удалить</button>
        </>
      );
    }
    const val = getEntityFieldValue(atm, field);
    if (field.key === 'serial_number') return <strong>{val}</strong>;
    if (field.key === 'territorial_bank' || field.key === 'installation_name') {
      return <span className="directory-table-cell-truncate">{val}</span>;
    }
    if (field.key === 'address') {
      return <span className="directory-table-cell-address">{val}</span>;
    }
    return val;
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
          <EntityFieldTable
            entity="atms"
            rows={atms}
            view="table"
            role={user?.role}
            tableClass="directory-table"
            renderCell={renderAtmCell}
            emptyMessage="Устройства не добавлены"
          />
        )}
      </div>

      {modal && (
        <DeviceModal
          device={modal.id ? modal : null}
          directories={directories}
          userRole={user?.role}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {importModal && (
        <ExcelImportModal
          title="Импорт устройств из Excel"
          description="Столбцы: ID УС, Территориальный Банк, ГОСБ, Адрес места установки, Вид доступности, Наименование места установки. Все поля обязательны. Значения справочников при импорте не проверяются."
          onClose={() => setImportModal(false)}
          onDone={load}
          onImport={api.importAtms}
          onDownloadTemplate={api.downloadAtmsTemplate}
        />
      )}
    </div>
  );
}
