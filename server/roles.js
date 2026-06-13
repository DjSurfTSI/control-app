export const ROLES = {
  BIZADMIN: 'bizadmin',
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  EXECUTOR: 'executor',
  /** @deprecated use EXECUTOR */
  CLEANER: 'executor',
};

export const ALL_ROLES = Object.values(ROLES).filter((v, i, a) => a.indexOf(v) === i);

export function isBizAdmin(user) {
  return user?.role === ROLES.BIZADMIN;
}

export function hasRoleAccess(user, ...roles) {
  if (isBizAdmin(user)) return true;
  const normalized = roles.map((r) => (r === 'cleaner' ? 'executor' : r));
  const userRole = user?.role === 'cleaner' ? 'executor' : user?.role;
  return normalized.includes(userRole);
}

export function isManager(user) {
  return hasRoleAccess(user, ROLES.ADMIN, ROLES.SUPERVISOR);
}

export function isAdmin(user) {
  return hasRoleAccess(user, ROLES.ADMIN);
}

export function isExecutor(user) {
  return user?.role === ROLES.EXECUTOR || user?.role === 'cleaner';
}

export function isCleaner(user) {
  return isExecutor(user);
}
