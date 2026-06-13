/** Каталог элементов рабочего пространства (клиент) */

export const WORKSPACE_ROLES = ['bizadmin', 'admin', 'supervisor', 'executor'];

export const WORKSPACE_NAV_CATALOG = [
  { id: 'dashboard', to: '/', label: 'Дашборд', icon: '📊', end: true, roles: WORKSPACE_ROLES },
  { id: 'tasks', to: '/tasks', label: 'Заявки', icon: '📋', roles: WORKSPACE_ROLES },
  { id: 'atms', to: '/atms', label: 'Устройства', icon: '🏧', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'users', to: '/users', label: 'Сотрудники', icon: '👥', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'settings', to: '/settings', label: 'Настройки', icon: '⚙️', roles: ['bizadmin'] },
  { id: 'workspace', to: '/workspace', label: 'Конструктор UI', icon: '🎛️', roles: WORKSPACE_ROLES },
];

export const WORKSPACE_WIDGET_CATALOG = [
  { id: 'stats_new', label: 'Новые сегодня', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'stats_in_progress', label: 'В работе', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'stats_completed', label: 'Выполнено сегодня', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'stats_overdue', label: 'Просрочено', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'cleaner_table', label: 'Контроль сотрудников', roles: ['bizadmin', 'admin', 'supervisor'] },
  { id: 'today_tasks', label: 'Заявки на сегодня', roles: WORKSPACE_ROLES },
];

export function normalizeUserRole(role) {
  return role === 'cleaner' ? 'executor' : role;
}

export function getCatalogNavForRole(role) {
  const r = normalizeUserRole(role);
  return WORKSPACE_NAV_CATALOG.filter((item) => item.roles.includes(r));
}

export function getCatalogWidgetsForRole(role) {
  const r = normalizeUserRole(role);
  return WORKSPACE_WIDGET_CATALOG.filter((item) => item.roles.includes(r));
}

export function getDefaultWorkspace(role) {
  const nav = getCatalogNavForRole(role).map((item, index) => ({
    id: item.id,
    visible: true,
    order: index,
  }));
  const dashboardWidgets = getCatalogWidgetsForRole(role).map((item, index) => ({
    id: item.id,
    visible: true,
    order: index,
  }));
  return {
    homeRoute: '/',
    nav,
    dashboardWidgets,
  };
}

function sortByOrder(items) {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function mergeWorkspaceConfig(saved, role) {
  const defaults = getDefaultWorkspace(role);
  const allowedNav = new Set(getCatalogNavForRole(role).map((n) => n.id));
  const allowedWidgets = new Set(getCatalogWidgetsForRole(role).map((w) => w.id));

  const navMap = new Map((saved?.nav || []).filter((n) => allowedNav.has(n.id)).map((n) => [n.id, n]));
  const nav = getCatalogNavForRole(role).map((item, index) => {
    const existing = navMap.get(item.id);
    return {
      id: item.id,
      visible: existing?.visible !== false,
      order: existing?.order ?? index,
    };
  });

  const widgetMap = new Map((saved?.dashboardWidgets || []).filter((w) => allowedWidgets.has(w.id)).map((w) => [w.id, w]));
  const dashboardWidgets = getCatalogWidgetsForRole(role).map((item, index) => {
    const existing = widgetMap.get(item.id);
    return {
      id: item.id,
      visible: existing?.visible !== false,
      order: existing?.order ?? index,
    };
  });

  const homeRoute = saved?.homeRoute && allowedNav.has(routeToNavId(saved.homeRoute, role))
    ? saved.homeRoute
    : defaults.homeRoute;

  return {
    homeRoute,
    nav: sortByOrder(nav).map((n, i) => ({ ...n, order: i })),
    dashboardWidgets: sortByOrder(dashboardWidgets).map((w, i) => ({ ...w, order: i })),
  };
}

function routeToNavId(route, role) {
  const item = getCatalogNavForRole(role).find((n) => n.to === route);
  return item?.id;
}

export function buildNavItems(config, role) {
  const catalog = getCatalogNavForRole(role);
  const byId = Object.fromEntries(catalog.map((c) => [c.id, c]));
  return sortByOrder(config.nav)
    .filter((n) => n.visible !== false && byId[n.id])
    .map((n) => byId[n.id]);
}

export function getVisibleDashboardWidgets(config, role) {
  const catalog = getCatalogWidgetsForRole(role);
  const byId = Object.fromEntries(catalog.map((c) => [c.id, c]));
  return sortByOrder(config.dashboardWidgets)
    .filter((w) => w.visible !== false && byId[w.id])
    .map((w) => byId[w.id]);
}

export function getHomeRouteOptions(config, role) {
  const navItems = buildNavItems(config, role);
  const routes = navItems.map((n) => n.to);
  if (!routes.includes(config.homeRoute)) routes.unshift('/');
  return [...new Set(routes)];
}
