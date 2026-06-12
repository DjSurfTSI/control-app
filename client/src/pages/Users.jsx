import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, isAdmin, isBizAdmin } from '../utils';

function UserModal({ user, onClose, onSave, canEditRoles, assignableRoles }) {
  const isNew = !user?.id;
  const [form, setForm] = useState({
    email: user?.email || '',
    password: '',
    full_name: user?.full_name || '',
    role: user?.role || 'cleaner',
    phone: user?.phone || '',
    active: user?.active ?? 1,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setError('');
    if (isNew && !form.password) {
      setError('Укажите пароль');
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
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Новый пользователь' : 'Редактировать пользователя'}</h2>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>ФИО *</label>
          <input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Email *</label>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={!isNew} />
        </div>
        {canEditRoles && (
          <div className="form-group">
            <label>Роль</label>
            <select value={form.role} onChange={(e) => set('role', e.target.value)}>
              {roleOptions.map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Телефон</label>
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label>{isNew ? 'Пароль *' : 'Новый пароль (оставьте пустым, чтобы не менять)'}</label>
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
        </div>
        {!isNew && (
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={!!form.active}
                onChange={(e) => set('active', e.target.checked ? 1 : 0)}
                style={{ width: 'auto', marginRight: '0.5rem' }}
              />
              Активен
            </label>
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
    ? ['bizadmin', 'admin', 'supervisor', 'cleaner']
    : admin
      ? ['admin', 'supervisor', 'cleaner']
      : ['cleaner'];

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setUsers(await api.getUsers(admin ? undefined : 'cleaner'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (action, form) => {
    if (action === 'create') {
      await api.createUser({
        ...form,
        role: canEditRoles ? form.role : 'cleaner',
      });
    } else {
      const data = { full_name: form.full_name, phone: form.phone, active: form.active };
      if (canEditRoles) data.role = form.role;
      if (form.password) data.password = form.password;
      await api.updateUser(modal.id, data);
    }
    load();
  };

  const canManage = (u) => admin || u.role === 'cleaner';

  const handleDelete = async (u) => {
    if (!confirm(`Удалить учётную запись «${u.full_name}»?`)) return;
    try {
      const res = await api.deleteUser(u.id);
      if (res.message) alert(res.message);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const title = admin ? 'Пользователи' : 'Уборщики';
  const subtitle = admin ? 'Управление всеми сотрудниками' : 'Создание и управление уборщиками';

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">{title}</h2>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <button className="btn-primary animate-pulse-once" onClick={() => setModal({})}>+ Добавить</button>
      </div>

      <div className="card animate-slide-up">
        {loading ? (
          <p className="empty-state">Загрузка...</p>
        ) : users.length === 0 ? (
          <p className="empty-state">Нет учётных записей</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ФИО</th>
                  <th>Email</th>
                  {admin && <th>Роль</th>}
                  <th>Телефон</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className="animate-fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
                    <td><strong>{u.full_name}</strong></td>
                    <td>{u.email}</td>
                    {admin && <td>{ROLE_LABELS[u.role]}</td>}
                    <td>{u.phone || '—'}</td>
                    <td>
                      <span className={`badge ${u.active ? 'badge-completed' : 'badge-cancelled'}`}>
                        {u.active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td className="actions">
                      {canManage(u) && (
                        <>
                          <button className="btn-secondary btn-sm" onClick={() => setModal(u)}>Изменить</button>
                          <button className="btn-danger btn-sm" onClick={() => handleDelete(u)}>Удалить</button>
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
        <UserModal
          user={modal.id ? modal : null}
          canEditRoles={canEditRoles}
          assignableRoles={assignableRoles}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
        .page-title { font-size: 1.75rem; margin-bottom: 0.25rem; }
        .page-subtitle { color: var(--text-muted); }
        .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
      `}</style>
    </div>
  );
}
