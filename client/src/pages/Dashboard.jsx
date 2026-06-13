import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { STATUS_LABELS, formatDate, todayISO, isManager } from '../utils';

function StatCard({ label, value, color, link, delay = 0 }) {
  const content = (
    <div className="stat-card card animate-slide-up" style={{ borderTopColor: color, animationDelay: `${delay}s` }}>
      <span className="stat-value" style={{ color }}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

const STAT_WIDGETS = {
  stats_new: { label: 'Новые сегодня', key: 'today_pending', color: '#94a3b8', link: '/tasks?status=new' },
  stats_in_progress: { label: 'В работе', key: 'in_progress', color: '#60a5fa', link: '/tasks?status=in_progress' },
  stats_completed: { label: 'Выполнено сегодня', key: 'today_completed', color: '#4ade80', link: '/tasks?status=completed' },
  stats_overdue: { label: 'Просрочено', key: 'overdue', color: '#fca5a5', link: '/tasks?status=overdue' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { dashboardWidgets, loading: wsLoading } = useWorkspace();
  const manager = isManager(user);
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const widgetIds = dashboardWidgets.map((w) => w.id);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const tasksData = await api.getTasks({ date: todayISO() });
        setTasks(tasksData);
        const needsStats = manager && widgetIds.some((id) => id.startsWith('stats_') || id === 'cleaner_table');
        if (needsStats) {
          const statsResult = await Promise.allSettled([api.getStats()]);
          if (statsResult[0].status === 'fulfilled') setStats(statsResult[0].value);
        }
      } catch (e) {
        setLoadError(e.message || 'Не удалось загрузить заявки');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, manager, widgetIds.join(',')]);

  if (loading || wsLoading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Загрузка...</span>
      </div>
    );
  }

  const renderWidget = (widgetId) => {
    if (widgetId.startsWith('stats_')) {
      if (!manager || !stats) return null;
      const def = STAT_WIDGETS[widgetId];
      if (!def) return null;
      return (
        <StatCard
          label={def.label}
          value={stats[def.key]}
          color={def.color}
          link={def.link}
          delay={0}
        />
      );
    }

    if (widgetId === 'cleaner_table' && manager && stats?.byCleaner?.length > 0) {
      return (
        <div key={widgetId} className="card section">
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
      );
    }

    if (widgetId === 'today_tasks') {
      return (
        <div key={widgetId} className="card section">
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
                    {manager && t.assignee_name && (
                      <p className="task-assignee">👤 {t.assignee_name}</p>
                    )}
                  </div>
                  <span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="page-enter">
      {loadError && <div className="error-msg">{loadError}</div>}
      <h2 className="page-title animate-slide-down">
        {manager ? 'Панель контроля' : 'Мои заявки на сегодня'}
      </h2>
      <p className="page-subtitle">{formatDate(todayISO())}</p>

      <div className="dashboard-widgets">
        {dashboardWidgets.map((widget) => {
          const content = renderWidget(widget.id);
          if (!content) return null;
          if (widget.id.startsWith('stats_')) {
            return <div key={widget.id} className="dashboard-stat-slot">{content}</div>;
          }
          return <div key={widget.id} className="dashboard-widget-block">{content}</div>;
        })}
      </div>

      {widgetIds.length === 0 && (
        <p className="empty-state">
          Нет видимых виджетов. Настройте дашборд в{' '}
          <Link to="/workspace">конструкторе рабочего пространства</Link>.
        </p>
      )}
    </div>
  );
}
