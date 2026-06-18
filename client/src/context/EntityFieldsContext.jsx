import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';
import { getVisibleFields } from '../utils/entityFields';

const EntityFieldsContext = createContext(null);

export function EntityFieldsProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getEntityFields();
      setConfig(data);
    } catch (e) {
      setConfig(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setConfig(null);
      setError('');
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const save = useCallback(async (nextConfig) => {
    const data = await api.updateEntityFields(nextConfig);
    setConfig(data);
    return data;
  }, []);

  const reset = useCallback(async (entity) => {
    const data = await api.resetEntityFields(entity);
    setConfig(data);
    return data;
  }, []);

  const value = useMemo(() => ({
    config,
    loading,
    error,
    reload: load,
    save,
    reset,
    getFields: (entity, opts) => getVisibleFields(config, entity, opts),
  }), [config, loading, error, load, save, reset]);

  return (
    <EntityFieldsContext.Provider value={value}>
      {children}
    </EntityFieldsContext.Provider>
  );
}

export function useEntityFields() {
  const ctx = useContext(EntityFieldsContext);
  if (!ctx) throw new Error('useEntityFields requires EntityFieldsProvider');
  return ctx;
}

export function useEntityColumns(entity, view, role) {
  const { config, loading } = useEntityFields();
  const fields = useMemo(
    () => getVisibleFields(config, entity, { view, role }),
    [config, entity, view, role],
  );
  return { fields, loading, config };
}
