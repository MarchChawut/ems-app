import { describe, it, expect } from 'vitest';
import { canViewTask, canMutateTask, canCreateInScope, parseTaskScope } from './task-access';

const admin = { id: 1, role: 'ADMIN' };
const superAdmin = { id: 2, role: 'SUPER_ADMIN' };
const manager = { id: 3, role: 'MANAGER' };
const employee = { id: 4, role: 'EMPLOYEE' };
const other = { id: 5, role: 'EMPLOYEE' };

describe('shared board (ownerId = null)', () => {
  const shared = { ownerId: null };

  it('everyone can view; only ADMIN/SUPER_ADMIN can mutate', () => {
    for (const u of [admin, superAdmin, manager, employee]) expect(canViewTask(u, shared)).toBe(true);
    expect(canMutateTask(admin, shared)).toBe(true);
    expect(canMutateTask(superAdmin, shared)).toBe(true);
    expect(canMutateTask(manager, shared)).toBe(false);
    expect(canMutateTask(employee, shared)).toBe(false);
  });

  it('only ADMIN/SUPER_ADMIN can create shared tasks; anyone can create private ones', () => {
    expect(canCreateInScope(admin, 'shared')).toBe(true);
    expect(canCreateInScope(manager, 'shared')).toBe(false);
    expect(canCreateInScope(employee, 'shared')).toBe(false);
    expect(canCreateInScope(employee, 'private')).toBe(true);
  });
});

describe('private board (ownerId = user)', () => {
  const mine = { ownerId: employee.id };

  it('only the owner can view or mutate — not even admins', () => {
    expect(canViewTask(employee, mine)).toBe(true);
    expect(canMutateTask(employee, mine)).toBe(true);
    for (const u of [other, manager, admin, superAdmin]) {
      expect(canViewTask(u, mine)).toBe(false);
      expect(canMutateTask(u, mine)).toBe(false);
    }
  });
});

describe('parseTaskScope', () => {
  it('defaults to shared; only "private" selects the private board', () => {
    expect(parseTaskScope(null)).toBe('shared');
    expect(parseTaskScope('private')).toBe('private');
    expect(parseTaskScope('all')).toBe('shared');
    expect(parseTaskScope('PRIVATE')).toBe('shared');
  });
});
