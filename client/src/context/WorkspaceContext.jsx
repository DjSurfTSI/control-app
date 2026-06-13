import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, isNetworkError } from '../api';
import { useAuth } from './AuthContext';
import {
  buildNavItems,
  getDefaultWorkspace,
  getHomeRouteOptions,
  getVisibleDashboardWidgets,
  mergeWorkspaceConfig,
} from '../config/workspaceCatalog';

const WorkspaceContext = createContext(null);

const OFFLINE_KEY = 'offline_workspace';

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getWorkspace();
      setConfig(mergeWorkspaceConfig(data.config, user.role));
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(data.config));
    } catch (err) {
      const cached = localStorage.getItem(OFFLINE_KEY);
      if (cached && (!navigator.onLine || isNetworkError(err))) {
        setConfig(mergeWorkspaceConfig(JSON.parse(cached), user.role));
      } else {
        setConfig(getDefaultWorkspace(user.role));
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (draft) => {
    if (!user) return null;
    const merged = mergeWorkspaceConfig(draft, user.role);
    const data = await api.updateWorkspace(merged);
    setConfig(mergeWorkspaceConfig(data.config, user.role));
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(data.config));
    return data.config;
  }, [user]);

  const reset = useCallback(async () => {
    if (!user) return null;
    const data = await api.resetWorkspace();
    setConfig(mergeWorkspaceConfig(data.config, user.role));
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(data.config));
    return data.config;
  }, [user]);

  const value = useMemo(() => {
    if (!user || !config) {
      return {
        config: null,
        loading,
        navItems: [],
        homeRoute: '/',
        dashboardWidgets: [],
        homeRouteOptions: ['/'],
        load,
        save,
        reset,
      };
    }
    return {
      config,
      loading,
      navItems: buildNavItems(config, user.role),
      homeRoute: config.homeRoute || '/',
      dashboardWidgets: getVisibleDashboardWidgets(config, user.role),
      homeRouteOptions: getHomeRouteOptions(config, user.role),
      load,
      save,
      reset,
    };
  }, [user, config, loading, load, save, reset]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
