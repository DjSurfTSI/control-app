import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import {
  STATUS_LABELS, formatDate, formatDateTime, todayISO,
  isManager, isBizAdmin, isExecutor, getCloseMetadata, PHOTO_TYPE_LABELS,
} from '../utils';
import PhotoUpload from '../components/PhotoUpload';
import TaskCard from '../components/TaskCard';
import ImportTasksModal from '../components/ImportTasksModal';
import DateInput from '../components/DateInput';
import DateRangeInput from '../components/DateRangeInput';

const EMPTY_FILTERS = {
  task_id: '', status: '', accessibility_type: '', territorial_bank: '', gosb: '',
  address: '', installation_name: '',
  scheduled_from: '', scheduled_to: '',
  deadline_from: '', deadline_to: '',
  completed_from: '', completed_to: '',
};

function CompleteModal({ task, onClose, onComplete }) {
  const [report, setReport] = useState('');
  const [photoStatus, setPhotoStatus] = useState({
    complete: false, missing: ['left', 'right', 'front'], cvEnabled: true, cvPassed: false, cvFailed: [],
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canSubmit = photoStatus.complete && (photoStatus.cvEnabled ? photoStatus.cvPassed : true);

  const handleComplete = async () => {
    if (!photoStatus.complete) {
      setError(`Прикрепите фото: ${photoStatus.missing.map((t) => PHOTO_TYPE_LABELS[t]).join(', ')}`);
      return;
    }
    if (photoStatus.cvEnabled && !photoStatus.cvPassed) {
      const failed = photoStatus.cvFailed?.map((t) => PHOTO_TYPE_LABELS[t]).join(', ') || 'не все ракурсы';
      setError(`Банкомат не обнаружен на фото: ${failed}. Переснимите перед завершением.`);
      return;
    }
    setSaving(true);
    try {
      const meta = await getCloseMetadata();
      await onComplete(task.id, report, meta);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2>Завершить заявку</h2>
        <p><strong>№{task.id}</strong> — {task.installation_name || task.serial_number}</p>
        <p className="modal-sub">{task.address}</p>
        <p className="modal-sub">При закрытии будут сохранены данные устройства и геолокация (если разрешена).</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Отчёт</label>
          <textarea rows={3} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Опишите выполненные работы..." />
        </div>
        <PhotoUpload taskId={task.id} onChange={setPhotoStatus} />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn-success" onClick={handleComplete} disabled={saving || !canSubmit}>
            {saving ? (photoStatus.cvEnabled ? 'Проверка CV...' : 'Сохранение...') : 'Завершить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ task, atms, executors, onClose, onSave, isManager, canDelete, onDelete }) {
  const isNew = !task?.id;
  const [form, setForm] = useState({
    atm_id: task?.atm_id || '',
    assigned_to: task?.assigned_to || '',
    scheduled_date: task?.scheduled_date || todayISO(),
    deadline_date: task?.deadline_date || '',
    service_contract: task?.service_contract || '',
    notes: task?.notes || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleDelete = async () => {
    if (!confirm('Удалить заявку с сервера безвозвратно?')) return;
    setDeleting(true);
    try { await onDelete(task.id); onClose(); } catch (e) { setError(e.message); } finally { setDeleting(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(isNew ? 'create' : 'update', form); onClose(); } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal modal-wide animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Новая заявка' : `Заявка №${task.id}`}</h2>
        {error && <div className="error-msg">{error}</div>}
        {isNew ? (
          <>
            <div className="form-group">
              <label>Устройство *</label>
              <select value={form.atm_id} onChange={(e) => set('atm_id', e.target.value)}>
                <option value="">Выберите...</option>
                {atms.map((a) => (
                  <option key={a.id} value={a.id}>{a.serial_number} — {a.installation_name || a.address}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Плановая дата *</label>
                <DateInput value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Контрольный срок</label>
                <DateInput value={form.deadline_date} onChange={(e) => set('deadline_date', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Услуга по договору</label>
              <input value={form.service_contract} onChange={(e) => set('service_contract', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Исполнитель</label>
              <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                <option value="">Не назначен</option>
                {executors.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name} ({Math.round(c.rating || 50)})</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="task-detail-grid">
              <div><span>Статус</span><strong>{STATUS_LABELS[task.status]}</strong></div>
              <div><span>Доступность</span><strong>{task.accessibility_type || '—'}</strong></div>
              <div><span>Терр. Банк</span><strong>{task.territorial_bank || task.bank_name}</strong></div>
              <div><span>ГОСБ</span><strong>{task.gosb || task.zone || '—'}</strong></div>
              <div><span>Адрес</span><strong>{task.address}</strong></div>
              <div><span>Место установки</span><strong>{task.installation_name || '—'}</strong></div>
              <div><span>Плановая дата</span><strong>{formatDate(task.scheduled_date)}</strong></div>
              <div><span>Контрольный срок</span><strong>{formatDate(task.deadline_date)}</strong></div>
              <div><span>Начало работ</span><strong>{formatDateTime(task.started_at)}</strong></div>
              <div><span>Завершение</span><strong>{formatDateTime(task.completed_at)}</strong></div>
              <div><span>Услуга</span><strong>{task.service_contract || '—'}</strong></div>
              <div><span>Исполнитель</span><strong>{task.assignee_name || '—'}{task.assignee_rating != null ? ` (${Math.round(task.assignee_rating)})` : ''}</strong></div>
            </div>
            {isManager && (
              <div className="form-row" style={{ marginTop: '1rem' }}>
                <div className="form-group">
                  <label>Плановая дата</label>
                  <DateInput value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Контрольный срок</label>
                  <DateInput value={form.deadline_date} onChange={(e) => set('deadline_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Исполнитель</label>
                  <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                    <option value="">Не назначен</option>
                    {executors.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <PhotoUpload taskId={task.id} readOnly={task.status === 'completed' && !isManager} />
          </>
        )}
        <div className="modal-actions">
          {canDelete && !isNew && (
            <button className="btn-danger" onClick={handleDelete} disabled={deleting || saving} style={{ marginRight: 'auto' }}>
              {deleting ? 'Удаление...' : 'Удалить'}
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
          {(isNew || isManager) && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
          )}
        </div>
        <style>{`
          .task-detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
          .task-detail-grid div { background: var(--bg); padding: 0.6rem 0.75rem; border-radius: 8px; }
          .task-detail-grid span { display: block; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.2rem; }
        `}</style>
      </div>
    </div>
  );
}

export default function Tasks() {
  const { user } = useAuth();
  const manager = isManager(user);
  const executor = isExecutor(user);
  const bizAdmin = isBizAdmin(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [atms, setAtms] = useState([]);
  const [executors, setExecutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(null);
  const [completeModal, setCompleteModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, status: searchParams.get('status') || '' });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));

  const buildParams = () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    return params;
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      setTasks(await api.getTasks(buildParams()));
    } catch (e) {
      setLoadError(e.message || 'Не удалось загрузить заявки');
    } finally {
      setLoading(false);
    }
    if (manager) {
      const [atmsResult, execResult] = await Promise.allSettled([api.getAtms(), api.getUsers('executor')]);
      if (atmsResult.status === 'fulfilled') setAtms(atmsResult.value);
      if (execResult.status === 'fulfilled') setExecutors(execResult.value);
    }
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => { load(); }, [user, JSON.stringify(filters), manager]);

  useEffect(() => {
    const onSynced = () => load();
    window.addEventListener('offline-synced', onSynced);
    return () => window.removeEventListener('offline-synced', onSynced);
  }, [filters]);

  const updateStatus = async (task, status) => {
    if (status === 'completed') { setCompleteModal(task); return; }
    await api.updateTask(task.id, { status });
    load();
  };

  const handleAssignSelf = async (task) => {
    await api.assignSelf(task.id);
    load();
  };

  const handleComplete = async (taskId, report, meta) => {
    await api.updateTask(taskId, { status: 'completed', report: report || 'Работы выполнены', ...meta });
    load();
  };

  const handleSave = async (action, form) => {
    if (action === 'create') {
      await api.createTask({
        atm_id: Number(form.atm_id),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        scheduled_date: form.scheduled_date,
        deadline_date: form.deadline_date || null,
        service_contract: form.service_contract || null,
        notes: form.notes,
      });
    } else {
      await api.updateTask(modal.id, {
        scheduled_date: form.scheduled_date,
        deadline_date: form.deadline_date || null,
        service_contract: form.service_contract,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        notes: form.notes,
      });
    }
    load();
  };

  const handleExport = async () => {
    setExporting(true);
    try { await api.exportTasks(buildParams()); } catch (e) { alert(e.message); } finally { setExporting(false); }
  };

  const resetFilters = () => {
    setFilters({ ...EMPTY_FILTERS });
    setSearchParams({});
  };

  const performDelete = async (id) => {
    await api.deleteTask(id);
    if (modal?.id === id) setModal(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить заявку с сервера безвозвратно?')) return;
    await performDelete(id);
  };

  const handleCancel = async (id) => {
    if (!confirm('Отменить заявку?')) return;
    await api.cancelTask(id);
    load();
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h2 className="page-title">Заявки</h2>
          <p className="page-subtitle">Планирование и контроль исполнения работ</p>
        </div>
        <div className="header-actions">
          {manager && (
            <>
              <button className="btn-secondary" onClick={() => setImportModal(true)}>📥 Импорт</button>
              <button className="btn-secondary" onClick={handleExport} disabled={exporting}>{exporting ? 'Экспорт...' : '📊 Excel'}</button>
              <button className="btn-primary" onClick={() => setModal({})}>+ Новое</button>
            </>
          )}
        </div>
      </div>

      <div className="filters card animate-slide-up filters-extended">
        <div className="form-group" style={{ margin: 0 }}>
          <label>№ заявки</label>
          <input value={filters.task_id} onChange={(e) => setFilter('task_id', e.target.value)} placeholder="ID" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Статус</label>
          <select value={filters.status} onChange={(e) => { setFilter('status', e.target.value); setSearchParams(e.target.value ? { status: e.target.value } : {}); }}>
            <option value="">Все</option>
            {Object.entries(STATUS_LABELS).filter(([k]) => k !== 'pending').map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Вид доступности</label>
          <input value={filters.accessibility_type} onChange={(e) => setFilter('accessibility_type', e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Территориальный Банк</label>
          <input value={filters.territorial_bank} onChange={(e) => setFilter('territorial_bank', e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>ГОСБ</label>
          <input value={filters.gosb} onChange={(e) => setFilter('gosb', e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Адрес</label>
          <input value={filters.address} onChange={(e) => setFilter('address', e.target.value)} placeholder="Поиск по адресу" />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Место установки</label>
          <input value={filters.installation_name} onChange={(e) => setFilter('installation_name', e.target.value)} />
        </div>
        <DateRangeInput label="Плановая дата" from={filters.scheduled_from} to={filters.scheduled_to}
          onFromChange={(e) => setFilter('scheduled_from', e.target.value)} onToChange={(e) => setFilter('scheduled_to', e.target.value)} />
        <DateRangeInput label="Контрольный срок" from={filters.deadline_from} to={filters.deadline_to}
          onFromChange={(e) => setFilter('deadline_from', e.target.value)} onToChange={(e) => setFilter('deadline_to', e.target.value)} />
        <DateRangeInput label="Дата завершения" from={filters.completed_from} to={filters.completed_to}
          onFromChange={(e) => setFilter('completed_from', e.target.value)} onToChange={(e) => setFilter('completed_to', e.target.value)} />
        <button type="button" className="btn-secondary btn-sm filters-reset" onClick={resetFilters}>Сбросить</button>
      </div>

      <div className="card animate-slide-up">
        {loadError && <div className="error-msg">{loadError}</div>}
        {loading ? (
          <div className="loading-state"><div className="loading-spinner" /><span>Загрузка...</span></div>
        ) : tasks.length === 0 ? (
          <p className="empty-state">Заявок не найдено</p>
        ) : isMobile ? (
          <div className="mobile-tasks">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} isManager={manager} isExecutor={executor} currentUserId={user?.id} canDelete={bizAdmin}
                onStart={(task) => updateStatus(task, 'in_progress')} onComplete={(task) => setCompleteModal(task)}
                onAssignSelf={handleAssignSelf} onEdit={setModal} onCancel={handleCancel} onDelete={handleDelete} onView={setModal} />
            ))}
          </div>
        ) : (
          <div className="table-wrap table-scroll">
            <table>
              <thead>
                <tr>
                  <th>№</th><th>Статус</th><th>Доступность</th><th>Терр. Банк</th><th>ГОСБ</th>
                  <th>Адрес</th><th>Место</th><th>План</th><th>Контроль</th><th>Начало</th><th>Завершение</th>
                  <th>Услуга</th><th>Исполнитель</th><th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.id}</strong></td>
                    <td><span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                    <td>{t.accessibility_type || '—'}</td>
                    <td>{t.territorial_bank || t.bank_name}</td>
                    <td>{t.gosb || t.zone || '—'}</td>
                    <td>{t.address}</td>
                    <td>{t.installation_name || '—'}</td>
                    <td>{formatDate(t.scheduled_date)}</td>
                    <td>{formatDate(t.deadline_date)}</td>
                    <td>{formatDateTime(t.started_at)}</td>
                    <td>{formatDateTime(t.completed_at)}</td>
                    <td>{t.service_contract || '—'}</td>
                    <td>{t.assignee_name || '—'}</td>
                    <td className="actions">
                      <button className="btn-secondary btn-sm" onClick={() => setModal(t)}>Открыть</button>
                      {executor && t.status === 'new' && !t.assigned_to && (
                        <button className="btn-primary btn-sm" onClick={() => handleAssignSelf(t)}>Взять</button>
                      )}
                      {executor && t.assigned_to === user?.id && t.status === 'in_progress' && (
                        <button className="btn-success btn-sm" onClick={() => setCompleteModal(t)}>Завершить</button>
                      )}
                      {manager && !bizAdmin && !['cancelled', 'completed'].includes(t.status) && (
                        <button className="btn-danger btn-sm" onClick={() => handleCancel(t.id)}>Отмена</button>
                      )}
                      {bizAdmin && <button className="btn-danger btn-sm" onClick={() => handleDelete(t.id)}>Удалить</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <TaskModal task={modal.id ? modal : null} atms={atms} executors={executors} isManager={manager}
          canDelete={bizAdmin} onDelete={performDelete} onClose={() => setModal(null)} onSave={handleSave} />
      )}
      {completeModal && <CompleteModal task={completeModal} onClose={() => setCompleteModal(null)} onComplete={handleComplete} />}
      {importModal && <ImportTasksModal onClose={() => setImportModal(false)} onDone={load} />}

      <style>{`
        .filters-extended { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.75rem; align-items: end; }
        .table-scroll { overflow-x: auto; }
        .table-scroll table { min-width: 1200px; font-size: 0.85rem; }
      `}</style>
    </div>
  );
}
