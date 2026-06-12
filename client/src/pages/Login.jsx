import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DEMO_ACCOUNTS = [
  { email: 'admin@bank.ru', role: 'Администратор' },
  { email: 'supervisor@bank.ru', role: 'Супервайзер' },
  { email: 'cleaner1@bank.ru', role: 'Уборщик' },
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
    try {
      await login(email, password);
      navigate('/');
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
          <span className="login-logo">🏧</span>
          <h1>Контроль уборки банкоматов</h1>
          <p>Войдите для управления заявками</p>
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

      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: radial-gradient(ellipse at top, #1e3a5f 0%, var(--bg) 60%);
        }
        .login-card { width: 100%; max-width: 420px; }
        .login-header { text-align: center; margin-bottom: 2rem; }
        .login-logo { font-size: 3rem; display: block; margin-bottom: 0.5rem; }
        .login-header h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
        .login-header p { color: var(--text-muted); font-size: 0.9rem; }
        .login-btn { width: 100%; margin-top: 0.5rem; padding: 0.75rem; }
        .demo-accounts {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }
        .demo-accounts p { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem; }
        .demo-accounts code { background: var(--bg); padding: 0.1rem 0.4rem; border-radius: 4px; }
        .demo-accounts ul { list-style: none; }
        .demo-btn {
          background: none; border: none; color: var(--primary);
          padding: 0.3rem 0; font-size: 0.85rem; text-align: left;
        }
        .demo-btn:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
