import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABELS, formatDate, todayISO } from '../utils';

function StatCard({ label, value, color, link, delay = 0 }) {
  const content = (
    <div className="stat-card card animate-slide-up" style={{ borderTopColor: color, animationDelay: `${delay}s` }}>
      <span className="stat-value" style={{ color }}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user.role === 'admin' || user.role === 'supervisor';
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [tasksData, statsData] = await Promise.all([
          api.getTasks({ date: todayISO() }),
          isManager ? api.getStats() : Promise.resolve(null),
        ]);
        setTasks(tasksData);
        setStats(statsData);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isManager]);

  if (loading) return <p className="empty-state">Загрузка...</p>;

  return (
    <div className="page-enter">
      <h2 className="page-title animate-slide-down">
        {isManager ? 'Панель контроля' : 'Мои заявки на сегодня'}
      </h2>
      <p className="page-subtitle">{formatDate(todayISO())}</p>

      {isManager && stats && (
        <>
          <div className="stats-grid">
            <StatCard label="Ожидают сегодня" value={stats.today_pending} color="#94a3b8" link="/tasks?status=pending" delay={0} />
            <StatCard label="В работе" value={stats.in_progress} color="#60a5fa" link="/tasks?status=in_progress" delay={0.08} />
            <StatCard label="Выполнено сегодня" value={stats.today_completed} color="#4ade80" link="/tasks?status=completed" delay={0.16} />
            <StatCard label="Просрочено" value={stats.overdue} color="#fca5a5" link="/tasks?status=overdue" delay={0.24} />
          </div>

          {stats.byCleaner?.length > 0 && (
            <div className="card section">
              <h3>Контроль уборщиков</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Выполнено сегодня</th>
                      <th>Просрочено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byCleaner.map((c) => (
                      <tr key={c.id}>
                        <td>{c.full_name}</td>
                        <td><span className="count-ok">{c.completed_today}</span></td>
                        <td>
                          <span className={c.overdue > 0 ? 'count-bad' : 'count-ok'}>
                            {c.overdue}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card section">
        <div className="section-header">
          <h3>Заявки на сегодня ({tasks.length})</h3>
          <Link to="/tasks" className="btn-secondary btn-sm">Все заявки</Link>
        </div>
        {tasks.length === 0 ? (
          <p className="empty-state">Нет заявок на сегодня</p>
        ) : (
          <div className="task-list">
            {tasks.map((t) => (
              <div key={t.id} className="task-item">
                <div>
                  <strong>{t.serial_number}</strong> — {t.bank_name}
                  <p className="task-address">{t.address}</p>
                  {isManager && t.assignee_name && (
                    <p className="task-assignee">👤 {t.assignee_name}</p>
                  )}
                </div>
                <span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .page-title { font-size: 1.75rem; margin-bottom: 0.25rem; }
        .page-subtitle { color: var(--text-muted); margin-bottom: 2rem; }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .stat-card {
          border-top: 3px solid;
          text-align: center;
          transition: transform 0.15s;
        }
        a .stat-card:hover { transform: translateY(-2px); }
        .stat-value { display: block; font-size: 2.5rem; font-weight: 700; line-height: 1; }
        .stat-label { font-size: 0.85rem; color: var(--text-muted); }
        .section { margin-bottom: 1.5rem; }
        .section h3 { margin-bottom: 1rem; font-size: 1.1rem; }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .section-header h3 { margin: 0; }
        .count-ok { color: var(--success); font-weight: 600; }
        .count-bad { color: var(--danger); font-weight: 600; }
        .task-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .task-item {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 0.75rem; background: var(--bg); border-radius: 8px; gap: 1rem;
        }
        .task-address { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem; }
        .task-assignee { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem; }
      `}</style>
    </div>
  );
}
