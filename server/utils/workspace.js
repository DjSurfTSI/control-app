import db from '../db.js';

const WORKSPACE_ROLES = ['bizadmin', 'admin', 'supervisor', 'executor'];

const NAV_CATALOG = [
  { id: 'dashboard', to: '/', roles: WORKSPACE_ROLES },
  { id: 'tasks', to: '/tasks', roles: WORKSPACE_ROLES },
  { id: 'atms', to: '/atms', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'users', to: '/users', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'settings', to: '/settings', roles: ['bizadmin'] },
  { id: 'workspace', to: '/workspace', roles: WORKSPACE_ROLES },
];

const WIDGET_CATALOG = [
  { id: 'stats_new', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'stats_in_progress', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'stats_completed', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'stats_overdue', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'cleaner_table', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'today_tasks', roles: WORKSPACE_ROLES },
];

function normalizeRole(role) {
  return role === 'cleaner' ? 'executor' : role;
}

function catalogNav(role) {
  const r = normalizeRole(role);
  return NAV_CATALOG.filter((item) => item.roles.includes(r));
}

function catalogWidgets(role) {
  const r = normalizeRole(role);
  return WIDGET_CATALOG.filter((item) => item.roles.includes(r));
}

export function getDefaultWorkspace(role) {
  const nav = catalogNav(role).map((item, index) => ({
    id: item.id,
    visible: true,
    order: index,
  }));
  const dashboardWidgets = catalogWidgets(role).map((item, index) => ({
    id: item.id,
    visible: true,
    order: index,
  }));
  return { homeRoute: '/', nav, dashboardWidgets };
}

function sortByOrder(items) {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function mergeWorkspaceConfig(saved, role) {
  const defaults = getDefaultWorkspace(role);
  const allowedNav = new Set(catalogNav(role).map((n) => n.id));
  const allowedWidgets = new Set(catalogWidgets(role).map((w) => w.id));

  const navMap = new Map((saved?.nav || []).filter((n) => allowedNav.has(n.id)).map((n) => [n.id, n]));
  const nav = catalogNav(role).map((item, index) => {
    const existing = navMap.get(item.id);
    return {
      id: item.id,
      visible: existing?.visible !== false,
      order: existing?.order ?? index,
    };
  });

  const widgetMap = new Map((saved?.dashboardWidgets || []).filter((w) => allowedWidgets.has(w.id)).map((w) => [w.id, w]));
  const dashboardWidgets = catalogWidgets(role).map((item, index) => {
    const existing = widgetMap.get(item.id);
    return {
      id: item.id,
      visible: existing?.visible !== false,
      order: existing?.order ?? index,
    };
  });

  const routeToId = (route) => catalogNav(role).find((n) => n.to === route)?.id;
  const homeRoute = saved?.homeRoute && routeToId(saved.homeRoute)
    ? saved.homeRoute
    : defaults.homeRoute;

  return {
    homeRoute,
    nav: sortByOrder(nav).map((n, i) => ({ ...n, order: i })),
    dashboardWidgets: sortByOrder(dashboardWidgets).map((w, i) => ({ ...w, order: i })),
  };
}

export function parseWorkspaceConfig(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export function getUserWorkspace(userId, role) {
  const row = db.prepare('SELECT config FROM user_workspaces WHERE user_id = ?').get(userId);
  const saved = parseWorkspaceConfig(row?.config);
  return mergeWorkspaceConfig(saved, role);
}

export function saveUserWorkspace(userId, role, config) {
  const merged = mergeWorkspaceConfig(config, role);
  const json = JSON.stringify(merged);
  db.prepare(`
    INSERT INTO user_workspaces (user_id, config, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at
  `).run(userId, json);
  return merged;
}
