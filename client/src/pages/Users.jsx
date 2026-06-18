import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, isAdmin, isBizAdmin } from '../utils';
import ExcelImportModal from '../components/ExcelImportModal';

function EmployeeModal({ user, onClose, onSave, canEditRoles, assignableRoles }) {
  const isNew = !user?.id;
  const [form, setForm] = useState({
    email: user?.email || '',
    password: '',
    full_name: user?.full_name || '',
    role: user?.role === 'cleaner' ? 'executor' : (user?.role || 'executor'),
    phone: user?.phone || '',
    territorial_bank: user?.territorial_bank || '',
    position: user?.position || '',
    employee_number: user?.employee_number || '',
    active: user?.active ?? 1,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setError('');
    if (isNew && !form.password) { setError('Укажите пароль'); return; }
    if (!form.phone || !form.territorial_bank || !form.position || !form.employee_number) {
      setError('Заполните все обязательные поля');
      return;
    }
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

  const roleOptions = Object.entries(ROLE_LABELS).filter(([k]) => assignableRoles.includes(k));

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal modal-wide animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Новый сотрудник' : 'Редактировать сотрудника'}</h2>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>ФИО *</label>
          <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Email *</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!isNew} />
          </div>
          <div className="form-group">
            <label>Телефон *</label>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Территориальный Банк *</label>
            <input value={form.territorial_bank} onChange={(e) => set('territorial_bank', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Должность *</label>
            <input value={form.position} onChange={(e) => set('position', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Табельный номер *</label>
            <input value={form.employee_number} onChange={(e) => set('employee_number', e.target.value)} />
          </div>
          {canEditRoles && (
            <div className="form-group">
              <label>Роль *</label>
              <select value={form.role} onChange={(e) => set('role', e.target.value)}>
                {roleOptions.map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>{isNew ? 'Пароль *' : 'Новый пароль (оставьте пустым, чтобы не менять)'}</label>
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
        </div>
        {!isNew && (
          <div className="form-group">
            <label>
              <input type="checkbox" checked={!!form.active} onChange={(e) => set('active', e.target.checked ? 1 : 0)} style={{ width: 'auto', marginRight: '0.5rem' }} />
              Активен
            </label>
            {user?.rating != null && <p className="modal-sub">Рейтинг: <strong>{Math.round(user.rating)}</strong></p>}
          </div>
        )}
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

export default function Users() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const bizadmin = isBizAdmin(user);
  const canEditRoles = admin;
  const assignableRoles = bizadmin
    ? ['bizadmin', 'admin', 'supervisor', 'executor']
    : admin
      ? ['admin', 'supervisor', 'executor']
      : ['executor'];

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [importModal, setImportModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setUsers(await api.getUsers(admin ? undefined : 'executor')); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (action, form) => {
    if (action === 'create') {
      await api.createUser({ ...form, role: canEditRoles ? form.role : 'executor' });
    } else {
      const data = {
        full_name: form.full_name,
        phone: form.phone,
        territorial_bank: form.territorial_bank,
        position: form.position,
        employee_number: form.employee_number,
        active: form.active,
      };
      if (canEditRoles) data.role = form.role;
      if (form.password) data.password = form.password;
      await api.updateUser(modal.id, data);
    }
    load();
  };

  const canManage = (u) => admin || u.role === 'executor' || u.role === 'cleaner';

  const handleDelete = async (u) => {
    if (!confirm(`Удалить сотрудника «${u.full_name}»?`)) return;
    try {
      const res = await api.deleteUser(u.id);
      if (res.message) alert(res.message);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">Сотрудники</h2>
          <p className="page-subtitle">Управление персоналом и исполнителями</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setImportModal(true)}>📥 Импорт</button>
          <button className="btn-primary" onClick={() => setModal({})}>+ Добавить</button>
        </div>
      </div>

      <div className="card animate-slide-up">
        {loading ? (
          <p className="empty-state">Загрузка...</p>
        ) : users.length === 0 ? (
          <p className="empty-state">Нет сотрудников</p>
        ) : (
          <div className="table-wrap">
            <table className="directory-table">
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  {admin && <th>Роль</th>}
                  <th>Тел.</th>
                  <th>Таб. №</th>
                  <th>Рейт.</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.full_name}</strong>
                      {u.position && <small className="directory-sub">{u.position}</small>}
                    </td>
                    <td className="directory-table-cell-truncate" title={u.email}>{u.email}</td>
                    {admin && <td>{ROLE_LABELS[u.role] || u.role}</td>}
                    <td>{u.phone || '—'}</td>
                    <td>{u.employee_number || '—'}</td>
                    <td>{u.rating != null ? Math.round(u.rating) : '—'}</td>
                    <td>
                      <span className={`badge ${u.active ? 'badge-completed' : 'badge-cancelled'}`}>
                        {u.active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td className="actions">
                      {canManage(u) && (
                        <>
                          <button className="btn-secondary btn-xs" onClick={() => setModal(u)}>Изменить</button>
                          <button className="btn-danger btn-xs" onClick={() => handleDelete(u)}>Удалить</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <EmployeeModal
          user={modal.id ? modal : null}
          canEditRoles={canEditRoles}
          assignableRoles={assignableRoles}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {importModal && (
        <ExcelImportModal
          title="Импорт сотрудников из Excel"
          description="Столбцы: ФИО, Email, Телефон, Территориальный Банк, Должность, Табельный номер, Роль, Пароль. Все поля обязательны."
          onClose={() => setImportModal(false)}
          onDone={load}
          onImport={api.importUsers}
          onDownloadTemplate={api.downloadUsersTemplate}
        />
      )}
    </div>
  );
}
