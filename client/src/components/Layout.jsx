import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ExecutorTasksNavProvider, useExecutorTasksNav } from '../context/ExecutorTasksNavContext';
import { WorkspaceProvider, useWorkspace } from '../context/WorkspaceContext';
import ExecutorStatusNav from './ExecutorStatusNav';
import { ROLE_LABELS } from '../utils';
import { useNotifications } from '../hooks/useNotifications';
import OfflineStatusBar from './OfflineStatusBar';
import { useState } from 'react';

function LayoutShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { state: executorNav } = useExecutorTasksNav();
  const { navItems, homeRoute } = useWorkspace();
  const showExecutorStatusNav = executorNav.enabled && location.pathname === '/tasks';
  const { alerts, pushEnabled, pushLoading, enablePush, disablePush } = useNotifications(true);
  const [notifError, setNotifError] = useState('');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const togglePush = async () => {
    setNotifError('');
    try {
      if (pushEnabled) await disablePush();
      else await enablePush();
    } catch (e) {
      setNotifError(e.message);
    }
  };

  return (
    <div className={`layout${showExecutorStatusNav ? ' layout-executor-tasks' : ''}`}>
      <header className="header desktop-header">
        <Link to={homeRoute} className="header-brand header-brand-link">
          <span className="logo-wrap">🏧</span>
          <div>
            <h1>Контроль уборки</h1>
            <p>Устройства самообслуживания</p>
          </div>
        </Link>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>
          ))}
        </nav>
        <div className="header-user">
          {alerts.length > 0 && (
            <span className="alert-badge" title={alerts.map((a) => a.message).join(', ')}>
              {alerts.length}
            </span>
          )}
          <Link to="/workspace" className="btn-secondary btn-sm" title="Конструктор рабочего пространства">
            🎛️
          </Link>
          <button
            className={`btn-sm ${pushEnabled ? 'btn-success' : 'btn-secondary'}`}
            onClick={togglePush}
            disabled={pushLoading}
            title={pushEnabled ? 'Push включены' : 'Включить push'}
          >
            {pushLoading ? '...' : pushEnabled ? '🔔' : '🔕'}
          </button>
          <div className="header-user-info">
            <strong>{user.full_name}</strong>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={handleLogout}>Выйти</button>
        </div>
      </header>

      {notifError && <div className="notif-error">{notifError}</div>}

      <OfflineStatusBar />

      <main className="main">
        <Outlet />
      </main>

      <nav
        className={`mobile-nav${showExecutorStatusNav ? ' executor-status-nav' : ''}`}
        role={showExecutorStatusNav ? 'tablist' : undefined}
        aria-label={showExecutorStatusNav ? 'Разделы заявок' : undefined}
      >
        {showExecutorStatusNav ? (
          <ExecutorStatusNav
            activeTab={executorNav.activeTab}
            tasks={executorNav.tasks}
            onTabChange={executorNav.onTabChange}
          />
        ) : (
          <>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="mobile-nav-item">
                <span className="mobile-nav-icon">{item.icon}</span>
                <span className="mobile-nav-label">{item.label}</span>
              </NavLink>
            ))}
            <button type="button" className="mobile-nav-item mobile-nav-btn" onClick={togglePush} disabled={pushLoading}>
              <span className="mobile-nav-icon">{pushEnabled ? '🔔' : '🔕'}</span>
              <span className="mobile-nav-label">Push</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}

export default function Layout() {
  return (
    <ExecutorTasksNavProvider>
      <WorkspaceProvider>
        <LayoutShell />
      </WorkspaceProvider>
    </ExecutorTasksNavProvider>
  );
}
