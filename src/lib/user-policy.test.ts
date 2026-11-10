import { describe, it, expect } from 'vitest';
import { canAssignRole, canManageTarget, isPrivilegedRole } from './user-policy';

describe('canAssignRole', () => {
  it('only SUPER_ADMIN can grant ADMIN/SUPER_ADMIN', () => {
    expect(canAssignRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(canAssignRole('SUPER_ADMIN', 'ADMIN')).toBe(true);
    expect(canAssignRole('ADMIN', 'SUPER_ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);
  });

  it('ADMIN and SUPER_ADMIN can grant ordinary roles; others cannot grant anything', () => {
    for (const role of ['MANAGER', 'DIRECTOR', 'HR', 'EMPLOYEE'] as const) {
      expect(canAssignRole('ADMIN', role)).toBe(true);
      expect(canAssignRole('SUPER_ADMIN', role)).toBe(true);
      expect(canAssignRole('MANAGER', role)).toBe(false);
      expect(canAssignRole('EMPLOYEE', role)).toBe(false);
    }
  });
});

describe('canManageTarget', () => {
  it('ADMIN manages only non-privileged accounts', () => {
    expect(canManageTarget('ADMIN', 'EMPLOYEE')).toBe(true);
    expect(canManageTarget('ADMIN', 'HR')).toBe(true);
    expect(canManageTarget('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageTarget('ADMIN', 'SUPER_ADMIN')).toBe(false);
  });

  it('SUPER_ADMIN manages everyone; non-admins manage nobody', () => {
    expect(canManageTarget('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true);
    expect(canManageTarget('SUPER_ADMIN', 'ADMIN')).toBe(true);
    expect(canManageTarget('MANAGER', 'EMPLOYEE')).toBe(false);
    expect(canManageTarget('EMPLOYEE', 'EMPLOYEE')).toBe(false);
  });

  it('isPrivilegedRole', () => {
    expect(isPrivilegedRole('ADMIN')).toBe(true);
    expect(isPrivilegedRole('MANAGER')).toBe(false);
  });
});
