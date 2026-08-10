/** Application-level role (stored in profiles.app_role). */
export type AppRole = 'super_admin' | 'admin' | 'team_owner' | 'team_member' | 'premium_user' | 'free_user';

export const APP_ROLE_HIERARCHY: Record<AppRole, number> = {
  super_admin: 6,
  admin: 5,
  team_owner: 4,
  team_member: 3,
  premium_user: 2,
  free_user: 1,
};

export const APP_ROLE_PERMISSIONS: Record<AppRole, string[]> = {
  super_admin: ['*'],
  admin: ['dashboard:read', 'user:manage', 'workspace:manage', 'billing:manage', 'content:manage', 'settings:manage', 'admin:access'],
  team_owner: ['dashboard:read', 'workspace:manage', 'member:manage', 'content:manage', 'settings:read'],
  team_member: ['dashboard:read', 'workspace:read', 'content:create', 'content:read', 'settings:read'],
  premium_user: ['dashboard:read', 'workspace:read', 'content:create', 'content:read', 'image:create', 'chat:create', 'settings:read'],
  free_user: ['dashboard:read', 'content:create', 'content:read', 'chat:create', 'settings:read'],
};

/** Workspace role enum. */
export type Role = 'owner' | 'admin' | 'member' | 'guest';

/** Permission categories for the platform. */
export interface Permission {
  category: string;
  action: string;
  description: string;
}

/** Role-permission mapping. */
export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  guest: 1,
};

/** Permissions each role has. */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: ['workspace:read', 'workspace:update', 'workspace:delete', 'member:invite', 'member:remove', 'member:role_change', 'settings:read', 'settings:update', 'content:create', 'content:read', 'content:update', 'content:delete', 'chat:create', 'image:create'],
  admin: ['workspace:read', 'workspace:update', 'member:invite', 'member:remove', 'member:role_change', 'settings:read', 'content:create', 'content:read', 'content:update', 'chat:create', 'image:create'],
  member: ['workspace:read', 'settings:read', 'content:create', 'content:read', 'content:update', 'chat:create', 'image:create'],
  guest: ['workspace:read', 'content:read', 'chat:create'],
};
