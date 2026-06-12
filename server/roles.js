export const ROLES = {
  BIZADMIN: 'bizadmin',
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  CLEANER: 'cleaner',
};

export const ALL_ROLES = Object.values(ROLES);

export function isBizAdmin(user) {
  return user?.role === ROLES.BIZADMIN;
}

/** Бизнес-администратор проходит любую проверку requireRole */
export function hasRoleAccess(user, ...roles) {
  if (isBizAdmin(user)) return true;
  return roles.includes(user?.role);
}

export function isManager(user) {
  return hasRoleAccess(user, ROLES.ADMIN, ROLES.SUPERVISOR);
}

export function isAdmin(user) {
  return hasRoleAccess(user, ROLES.ADMIN);
}

export function isCleaner(user) {
  return user?.role === ROLES.CLEANER;
}
