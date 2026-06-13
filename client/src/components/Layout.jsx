import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, isManager, isAdmin, isBizAdmin } from '../utils';
import { useNotifications } from '../hooks/useNotifications';
import { useOffline } from '../hooks/useOffline';
import { useState } from 'react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const manager = isManager(user);
  const admin = isAdmin(user);
  const { alerts, pushEnabled, pushLoading, enablePush, disablePush } = useNotifications(true);
  const { online, pending, syncing, syncNow, lastSyncMessage } = useOffline();
  const [notifError, setNotifError] = useState('');

  const handleSync = async () => {
    await syncNow();
  };

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
          <span className="logo-wrap">🏧</span>
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
          <div className="header-user-info">
            <strong>{user.full_name}</strong>
            <span>{ROLE_LABELS[user.role]}</span>
          </div>
          <button className="btn-secondary btn-sm" onClick={handleLogout}>Выйти</button>
        </div>
      </header>

      {notifError && <div className="notif-error">{notifError}</div>}

      {(!online || pending > 0) && (
        <div className={`offline-banner ${online ? 'sync-pending' : 'offline'}`}>
          {!online ? (
            <span>📡 Нет сети — показаны сохранённые данные. Действия будут отправлены при подключении.</span>
          ) : (
            <span>⏳ Ожидает отправки: {pending} {pending === 1 ? 'действие' : 'действий'}</span>
          )}
          {online && pending > 0 && (
            <button type="button" className="btn-sm btn-secondary" onClick={handleSync} disabled={syncing}>
              {syncing ? 'Синхронизация…' : 'Синхронизировать'}
            </button>
          )}
          {lastSyncMessage && online && (
            <span className="sync-feedback">{lastSyncMessage}</span>
          )}
        </div>
      )}

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
        <button type="button" className="mobile-nav-item mobile-nav-btn" onClick={togglePush} disabled={pushLoading}>
          <span className="mobile-nav-icon">{pushEnabled ? '🔔' : '🔕'}</span>
          <span className="mobile-nav-label">Push</span>
        </button>
      </nav>
    </div>
  );
}
