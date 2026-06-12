import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, isManager, isAdmin, isBizAdmin } from '../utils';
import { useNotifications } from '../hooks/useNotifications';
import { useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const manager = isManager(user);
  const admin = isAdmin(user);
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

  const navItems = [
    { to: '/', label: 'Дашборд', icon: '📊', end: true },
    { to: '/tasks', label: 'Заявки', icon: '📋' },
    ...(manager ? [{ to: '/atms', label: 'Банкоматы', icon: '🏧' }] : []),
    ...(manager ? [{ to: '/users', label: admin ? 'Люди' : 'Уборщики', icon: '👥' }] : []),
    ...(isBizAdmin(user) ? [{ to: '/settings', label: 'Настройки', icon: '⚙️' }] : []),
  ];

  return (
    <div className="layout">
      <header className="header desktop-header">
        <div className="header-brand">
          <span className="logo">🏧</span>
          <div>
            <h1>Контроль уборки</h1>
            <p>Банкоматы</p>
          </div>
        </div>
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
          <button
            className={`btn-sm ${pushEnabled ? 'btn-success' : 'btn-secondary'}`}
            onClick={togglePush}
            disabled={pushLoading}
            title={pushEnabled ? 'Push включены' : 'Включить push'}
          >
            {pushLoading ? '...' : pushEnabled ? '🔔' : '🔕'}
          </button>
          <div>
            <strong>{user.full_name}</strong>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={handleLogout}>Выйти</button>
        </div>
      </header>

      {notifError && <div className="notif-error">{notifError}</div>}

      <main className="main">
        <Outlet />
      </main>

      <nav className="mobile-nav">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="mobile-nav-item">
            <span className="mobile-nav-icon">{item.icon}</span>
            <span className="mobile-nav-label">{item.label}</span>
          </NavLink>
        ))}
        <button className="mobile-nav-item mobile-nav-btn" onClick={togglePush} disabled={pushLoading}>
          <span className="mobile-nav-icon">{pushEnabled ? '🔔' : '🔕'}</span>
          <span className="mobile-nav-label">Push</span>
        </button>
      </nav>

      <style>{`
        .layout { min-height: 100vh; display: flex; flex-direction: column; padding-bottom: 0; }
        .header {
          display: flex; align-items: center; gap: 2rem;
          padding: 1rem 2rem;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
        }
        .header-brand { display: flex; align-items: center; gap: 0.75rem; }
        .logo { font-size: 2rem; }
        .header-brand h1 { font-size: 1.1rem; font-weight: 700; line-height: 1.2; }
        .header-brand p { font-size: 0.8rem; color: var(--text-muted); }
        .nav { display: flex; gap: 0.5rem; flex: 1; }
        .nav a {
          padding: 0.5rem 1rem; border-radius: 8px;
          color: var(--text-muted); font-weight: 500; transition: all 0.15s;
        }
        .nav a:hover { color: var(--text); background: var(--surface-hover); }
        .nav a.active { color: var(--primary); background: #1e3a5f; }
        .header-user { display: flex; align-items: center; gap: 0.75rem; }
        .header-user div { text-align: right; }
        .header-user strong { display: block; font-size: 0.9rem; }
        .header-user span { font-size: 0.75rem; color: var(--text-muted); }
        .alert-badge {
          background: var(--danger); color: white;
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700;
        }
        .notif-error {
          background: #7f1d1d33; color: #fca5a5; text-align: center;
          padding: 0.5rem; font-size: 0.85rem;
        }
        .main { flex: 1; padding: 2rem; max-width: 1280px; width: 100%; margin: 0 auto; }
        .mobile-nav { display: none; }

        @media (max-width: 768px) {
          .desktop-header .nav, .desktop-header .header-user div { display: none; }
          .desktop-header { padding: 0.75rem 1rem; gap: 1rem; }
          .main { padding: 1rem 1rem 5rem; }
          .mobile-nav {
            display: flex;
            position: fixed; bottom: 0; left: 0; right: 0;
            background: var(--surface);
            border-top: 1px solid var(--border);
            padding: 0.35rem 0.5rem calc(0.35rem + env(safe-area-inset-bottom));
            z-index: 50;
            justify-content: space-around;
          }
          .mobile-nav-item {
            display: flex; flex-direction: column; align-items: center;
            padding: 0.4rem 0.5rem; border-radius: 8px;
            color: var(--text-muted); font-size: 0.65rem;
            text-decoration: none; min-width: 56px;
            background: none; border: none;
          }
          .mobile-nav-item.active { color: var(--primary); }
          .mobile-nav-icon { font-size: 1.25rem; line-height: 1.2; }
          .mobile-nav-label { margin-top: 2px; }
          .mobile-nav-btn { cursor: pointer; color: var(--text-muted); }
        }
      `}</style>
    </div>
  );
}
