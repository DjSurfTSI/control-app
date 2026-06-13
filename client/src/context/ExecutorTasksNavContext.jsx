import { createContext, useContext, useState } from 'react';

export const EXECUTOR_NAV_DEFAULT = {
  enabled: false,
  activeTab: 'new',
  tasks: [],
  onTabChange: null,
};

const ExecutorTasksNavContext = createContext(null);

export function ExecutorTasksNavProvider({ children }) {
  const [state, setState] = useState(EXECUTOR_NAV_DEFAULT);
  return (
    <ExecutorTasksNavContext.Provider value={{ state, setState }}>
      {children}
    </ExecutorTasksNavContext.Provider>
  );
}

export function useExecutorTasksNav() {
  const ctx = useContext(ExecutorTasksNavContext);
  if (!ctx) throw new Error('useExecutorTasksNav must be used within ExecutorTasksNavProvider');
  return ctx;
}
