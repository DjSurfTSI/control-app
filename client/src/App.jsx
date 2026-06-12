import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { hasRouteAccess } from './utils';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Atms from './pages/Atms';
import Users from './pages/Users';
import Settings from './pages/Settings';

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="empty-state">Загрузка...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRouteAccess(user, roles)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="empty-state">Загрузка...</p>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route
          path="atms"
          element={
            <PrivateRoute roles={['admin', 'supervisor']}>
              <Atms />
            </PrivateRoute>
          }
        />
        <Route
          path="users"
          element={
            <PrivateRoute roles={['admin', 'supervisor']}>
              <Users />
            </PrivateRoute>
          }
        />
        <Route
          path="settings"
          element={
            <PrivateRoute roles={['bizadmin']}>
              <Settings />
            </PrivateRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
