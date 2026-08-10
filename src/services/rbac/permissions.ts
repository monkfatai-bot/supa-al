import { ROLE_HIERARCHY, ROLE_PERMISSIONS } from './types';
import { APP_ROLE_HIERARCHY, APP_ROLE_PERMISSIONS } from './types';
import type { Role } from './types';
import type { AppRole } from './types';

/** Check if a workspace role has a specific permission. */
export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Check if a workspace role is at least the minimum required level. */
export function hasMinimumRole(role: Role, minimum: Role): boolean {
  return (ROLE_HIERARCHY[role] ?? 0) >= (ROLE_HIERARCHY[minimum] ?? 0);
}

/** Get all permissions for a workspace role. */
export function getPermissionsForRole(role: Role): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Check if an app-level role has a specific permission. */
export function hasAppPermission(role: AppRole, permission: string): boolean {
  if (permission === '*') return true;
  const perms = APP_ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

/** Check if an app-level role meets a minimum role requirement. */
export function hasMinimumAppRole(role: AppRole, minimum: AppRole): boolean {
  return (APP_ROLE_HIERARCHY[role] ?? 0) >= (APP_ROLE_HIERARCHY[minimum] ?? 0);
}
