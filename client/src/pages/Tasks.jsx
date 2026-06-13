import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABELS, PRIORITY_LABELS, formatDate, todayISO, isManager } from '../utils';
import PhotoUpload from '../components/PhotoUpload';
import TaskCard from '../components/TaskCard';
import ImportTasksModal from '../components/ImportTasksModal';
import DateInput from '../components/DateInput';
import { PHOTO_TYPE_LABELS } from '../utils';

function CompleteModal({ task, onClose, onComplete }) {
  const [report, setReport] = useState('');
  const [photoStatus, setPhotoStatus] = useState({
    complete: false,
    missing: ['left', 'right', 'front'],
    cvEnabled: true,
    cvPassed: false,
    cvFailed: [],
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
      await onComplete(task.id, report);
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
        <h2>Завершить уборку</h2>
        <p><strong>{task.serial_number}</strong> — {task.address}</p>
        {error && <div className="error-msg">{error}</div>}
        <div className="form-group">
          <label>Отчёт</label>
          <textarea rows={3} value={report} onChange={(e) => setReport(e.target.value)} placeholder="Опишите выполненные работы..." />
        </div>
        <PhotoUpload taskId={task.id} onChange={setPhotoStatus} />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Отмена</button>
          <button
            className="btn-success"
            onClick={handleComplete}
            disabled={saving || !canSubmit}
          >
            {saving ? (photoStatus.cvEnabled ? 'Проверка CV...' : 'Сохранение...') : 'Завершить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskModal({ task, atms, cleaners, onClose, onSave, isManager }) {
  const isNew = !task?.id;
  const [form, setForm] = useState({
    atm_id: task?.atm_id || '',
    assigned_to: task?.assigned_to || '',
    scheduled_date: task?.scheduled_date || todayISO(),
    priority: task?.priority || 'normal',
    notes: task?.notes || '',
    report: task?.report || '',
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
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div className="modal modal-wide animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <h2>{isNew ? 'Новая заявка' : `Заявка #${task.id}`}</h2>
        {error && <div className="error-msg">{error}</div>}

        {isNew ? (
          <>
            <div className="form-group">
              <label>Банкомат *</label>
              <select value={form.atm_id} onChange={(e) => set('atm_id', e.target.value)} required>
                <option value="">Выберите...</option>
                {atms.map((a) => (
                  <option key={a.id} value={a.id}>{a.serial_number} — {a.address}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Дата *</label>
                <DateInput value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Приоритет</label>
                <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Уборщик</label>
              <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                <option value="">Не назначен</option>
                {cleaners.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Примечание</label>
              <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <p><strong>{task.serial_number}</strong> — {task.bank_name}</p>
            <p className="modal-sub">{task.address}</p>
            <p className="modal-sub">
              Статус: <span className={`badge badge-${task.status}`}>{STATUS_LABELS[task.status]}</span>
            </p>
            {task.report && (
              <div className="form-group">
                <label>Отчёт уборщика</label>
                <p className="report-text">{task.report}</p>
              </div>
            )}
            {isManager && (
              <div className="form-row">
                <div className="form-group">
                  <label>Дата</label>
                  <DateInput value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Уборщик</label>
                  <select value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                    <option value="">Не назначен</option>
                    {cleaners.map((c) => (
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
          <button className="btn-secondary" onClick={onClose}>Закрыть</button>
          {(isNew || isManager) && (
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Tasks() {
  const { user } = useAuth();
  const manager = isManager(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [atms, setAtms] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(null);
  const [completeModal, setCompleteModal] = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '');
  const [filterDate, setFilterDate] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterDate) params.date = filterDate;

      const tasksData = await api.getTasks(params);
      setTasks(tasksData);
    } catch (e) {
      setLoadError(e.message || 'Не удалось загрузить заявки');
    } finally {
      setLoading(false);
    }

    if (manager) {
      const [atmsResult, cleanersResult] = await Promise.allSettled([
        api.getAtms(),
        api.getUsers('cleaner'),
      ]);
      if (atmsResult.status === 'fulfilled') setAtms(atmsResult.value);
      if (cleanersResult.status === 'fulfilled') setCleaners(cleanersResult.value);
    }
  };

  useEffect(() => { load(); }, [user, filterStatus, filterDate, manager]);

  useEffect(() => {
    const onSynced = () => load();
    window.addEventListener('offline-synced', onSynced);
    return () => window.removeEventListener('offline-synced', onSynced);
  }, [filterStatus, filterDate]);

  useEffect(() => {
    const s = searchParams.get('status') || '';
    if (s !== filterStatus) setFilterStatus(s);
  }, [searchParams]);

  const updateStatus = async (task, status) => {
    if (status === 'completed') {
      setCompleteModal(task);
      return;
    }
    const res = await api.updateTask(task.id, { status });
    load();
    if (res?.offline) {
      /* queued — banner shows pending count */
    }
  };

  const handleComplete = async (taskId, report) => {
    try {
      await api.updateTask(taskId, { status: 'completed', report: report || 'Уборка выполнена' });
    } finally {
      load();
    }
  };

  const handleSave = async (action, form) => {
    if (action === 'create') {
      await api.createTask({
        atm_id: Number(form.atm_id),
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        scheduled_date: form.scheduled_date,
        priority: form.priority,
        notes: form.notes,
      });
    } else {
      await api.updateTask(modal.id, {
        scheduled_date: form.scheduled_date,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        notes: form.notes,
      });
    }
    load();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterDate) {
        params.date_from = filterDate;
        params.date_to = filterDate;
      }
      await api.exportTasks(params);
    } catch (e) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
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
          <h2 className="page-title">Заявки на уборку</h2>
          <p className="page-subtitle">Планирование и контроль исполнения</p>
        </div>
        <div className="header-actions">
          {manager && (
            <>
              <button className="btn-secondary" onClick={() => setImportModal(true)}>📥 Импорт</button>
              <button className="btn-secondary" onClick={handleExport} disabled={exporting}>
                {exporting ? 'Экспорт...' : '📊 Excel'}
              </button>
              <button className="btn-primary" onClick={() => setModal({})}>+ Новое</button>
            </>
          )}
        </div>
      </div>

      <div className="filters card animate-slide-up">
        <div className="form-group" style={{ margin: 0 }}>
          <label>Статус</label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setSearchParams(e.target.value ? { status: e.target.value } : {});
            }}
          >
            <option value="">Все</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Дата</label>
          <DateInput value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
        </div>
        <button type="button" className="btn-secondary btn-sm filters-reset" onClick={() => { setFilterStatus(''); setFilterDate(''); setSearchParams({}); }}>
          Сбросить
        </button>
      </div>

      <div className="card animate-slide-up" style={{ animationDelay: '0.1s' }}>
        {loadError && <div className="error-msg">{loadError}</div>}
        {loading ? (
          <p className="empty-state">Загрузка...</p>
        ) : tasks.length === 0 ? (
          <p className="empty-state">Заявок не найдено</p>
        ) : isMobile ? (
          <div className="mobile-tasks">
            {tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                isManager={manager}
                onStart={(task) => updateStatus(task, 'in_progress')}
                onComplete={(task) => setCompleteModal(task)}
                onEdit={setModal}
                onCancel={handleCancel}
                onView={setModal}
              />
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Банкомат</th>
                  <th>Адрес</th>
                  <th>Дата</th>
                  <th>Уборщик</th>
                  <th>Приоритет</th>
                  <th>Статус</th>
                  <th>Фото</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.serial_number}</strong><br /><small>{t.bank_name}</small></td>
                    <td>{t.address}</td>
                    <td>{formatDate(t.scheduled_date)}</td>
                    <td>{t.assignee_name || '—'}</td>
                    <td><span className={`badge badge-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span></td>
                    <td><span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                    <td>{t.photo_count > 0 ? `📷 ${t.photo_count}` : '—'}</td>
                    <td className="actions">
                      <button className="btn-secondary btn-sm" onClick={() => setModal(t)}>Открыть</button>
                      {!manager && t.status === 'pending' && (
                        <button className="btn-primary btn-sm" onClick={() => updateStatus(t, 'in_progress')}>Начать</button>
                      )}
                      {!manager && t.status === 'in_progress' && (
                        <button className="btn-success btn-sm" onClick={() => setCompleteModal(t)}>Завершить</button>
                      )}
                      {manager && t.status !== 'cancelled' && t.status !== 'completed' && (
                        <button className="btn-danger btn-sm" onClick={() => handleCancel(t.id)}>Отмена</button>
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
        <TaskModal
          task={modal.id ? modal : null}
          atms={atms}
          cleaners={cleaners}
          isManager={manager}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {completeModal && (
        <CompleteModal
          task={completeModal}
          onClose={() => setCompleteModal(null)}
          onComplete={handleComplete}
        />
      )}

      {importModal && (
        <ImportTasksModal
          onClose={() => setImportModal(false)}
          onDone={load}
        />
      )}

      <style>{`
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
        .page-title { font-size: 1.75rem; margin-bottom: 0.25rem; }
        .page-subtitle { color: var(--text-muted); }
        .header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .filters {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: end;
          margin-bottom: 1.5rem;
          max-width: 100%;
        }
        .filters .form-group { min-width: 0; width: 100%; }
        .filters .form-group input,
        .filters .form-group select { width: 100%; }
        .filters-reset { align-self: end; }
        .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        td small { color: var(--text-muted); }
        .modal-wide { max-width: 600px; }
        .modal-sub { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.75rem; }
        .report-text { background: var(--bg); padding: 0.75rem; border-radius: 8px; font-size: 0.9rem; }
        @media (max-width: 768px) {
          .page-title { font-size: 1.35rem; }
          .filters { grid-template-columns: 1fr; }
          .filters-reset { width: 100%; }
        }
      `}</style>
    </div>
  );
}
