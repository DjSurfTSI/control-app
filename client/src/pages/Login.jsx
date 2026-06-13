import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { mergeWorkspaceConfig } from '../config/workspaceCatalog';
import { useAuth } from '../context/AuthContext';
import { requestGeolocationAccess } from '../utils/geolocation';
const DEMO_ACCOUNTS = [
  { email: 'bizadmin@bank.ru', role: 'Бизнес-администратор' },
  { email: 'admin@bank.ru', role: 'Администратор' },
  { email: 'supervisor@bank.ru', role: 'Супервайзер' },
  { email: 'cleaner1@bank.ru', role: 'Исполнитель' },
];

export default function Login() {
  const [email, setEmail] = useState('supervisor@bank.ru');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const geoPromise = requestGeolocationAccess();
    try {
      const u = await login(email, password);
      await geoPromise;
      try {
        const ws = await api.getWorkspace();
        const merged = mergeWorkspaceConfig(ws.config, u.role);
        navigate(merged.homeRoute || '/');
      } catch {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card card animate-slide-up">
        <div className="login-header">
          <span className="login-logo-wrap">🏧</span>
          <h1>Контроль уборки банкоматов</h1>
          <p>Войдите для управления заявками</p>
          <p className="login-offline-hint">После первого входа приложение работает офлайн: заявки и фото синхронизируются при появлении сети.</p>
          <p className="login-offline-hint">При входе будет запрошен доступ к геолокации — он нужен для фиксации места закрытия заявки.</p>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="demo-accounts">
          <p>Демо-аккаунты (пароль: <code>admin123</code>)</p>
          <ul>
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  className="demo-btn"
                  onClick={() => { setEmail(a.email); setPassword('admin123'); }}
                >
                  {a.role} — {a.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
