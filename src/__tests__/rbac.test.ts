import { describe, it, expect } from 'vitest';
import { hasPermission, hasMinimumRole, getPermissionsForRole } from '@/services/rbac/permissions';
import type { Role } from '@/services/rbac/types';

describe('RBAC Permissions', () => {
  describe('hasPermission', () => {
    it('owner has all permissions', () => {
      expect(hasPermission('owner', 'workspace:delete')).toBe(true);
      expect(hasPermission('owner', 'member:invite')).toBe(true);
      expect(hasPermission('owner', 'settings:update')).toBe(true);
    });

    it('admin cannot delete workspace', () => {
      expect(hasPermission('admin', 'workspace:delete')).toBe(false);
    });

    it('admin can invite members', () => {
      expect(hasPermission('admin', 'member:invite')).toBe(true);
    });

    it('member cannot manage members', () => {
      expect(hasPermission('member', 'member:invite')).toBe(false);
      expect(hasPermission('member', 'member:remove')).toBe(false);
    });

    it('member can create content', () => {
      expect(hasPermission('member', 'content:create')).toBe(true);
    });

    it('guest can only read', () => {
      expect(hasPermission('guest', 'workspace:read')).toBe(true);
      expect(hasPermission('guest', 'content:create')).toBe(false);
    });

    it('returns false for unknown permission', () => {
      expect(hasPermission('owner', 'unknown:action')).toBe(false);
    });
  });

  describe('hasMinimumRole', () => {
    it('owner meets admin requirement', () => {
      expect(hasMinimumRole('owner', 'admin')).toBe(true);
    });

    it('member does not meet admin requirement', () => {
      expect(hasMinimumRole('member', 'admin')).toBe(false);
    });

    it('same role meets its own requirement', () => {
      expect(hasMinimumRole('admin', 'admin')).toBe(true);
      expect(hasMinimumRole('guest', 'guest')).toBe(true);
    });

    it('role hierarchy is correct', () => {
      expect(hasMinimumRole('owner', 'member')).toBe(true);
      expect(hasMinimumRole('owner', 'guest')).toBe(true);
      expect(hasMinimumRole('admin', 'guest')).toBe(true);
      expect(hasMinimumRole('member', 'guest')).toBe(true);
      expect(hasMinimumRole('guest', 'member')).toBe(false);
    });
  });

  describe('getPermissionsForRole', () => {
    it('returns non-empty array for each role', () => {
      const roles: Role[] = ['owner', 'admin', 'member', 'guest'];
      for (const role of roles) {
        const perms = getPermissionsForRole(role);
        expect(Array.isArray(perms)).toBe(true);
        expect(perms.length).toBeGreaterThan(0);
      }
    });

    it('owner has more permissions than member', () => {
      const ownerPerms = getPermissionsForRole('owner');
      const memberPerms = getPermissionsForRole('member');
      expect(ownerPerms.length).toBeGreaterThan(memberPerms.length);
    });

    it('member has more permissions than guest', () => {
      const memberPerms = getPermissionsForRole('member');
      const guestPerms = getPermissionsForRole('guest');
      expect(memberPerms.length).toBeGreaterThan(guestPerms.length);
    });
  });
});
