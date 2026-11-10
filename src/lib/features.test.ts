import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  FEATURES, CORE_FEATURES, resolveFeatures, featureForApiPath, featureForPagePath, landingPath,
  isFeatureOn, isOptionOn, validateFeaturePatch, TIME_REGEX, canManageFeatures, FRESH_INSTALL_DISABLED_FEATURES,
} from './features';

describe('registry', () => {
  it('has unique ids, a category, and at least one route (except notifications has api only)', () => {
    const ids = FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of FEATURES) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.pagePrefixes.length + f.apiPrefixes.length).toBeGreaterThan(0);
    }
  });

  it('does not make core features toggleable (users/auth/files/org/feature settings are not mapped)', () => {
    for (const p of ['/api/users', '/api/users/me', '/api/auth/login', '/api/files/abc', '/api/health', '/api/org-settings', '/api/feature-settings', '/api/permissions', '/api/dashboard']) {
      expect(featureForApiPath(p)).toBeUndefined();
    }
    expect(CORE_FEATURES.length).toBeGreaterThan(0);
    for (const p of ['/dashboard', '/dashboard/profile', '/dashboard/employees', '/dashboard/settings', '/dashboard/settings/permissions', '/dashboard/settings/features']) {
      expect(featureForPagePath(p)).toBeUndefined();
    }
  });

  it('every page-based feature has a sidebar menu item with the same id (no feature is missing from the menu)', () => {
    const src = readFileSync(new URL('../components/dashboard/DashboardShell.tsx', import.meta.url), 'utf8');
    const menuIds = [...src.matchAll(/^\s{4}id: '([a-z]+)'/gm)].map((m) => m[1]);
    for (const f of FEATURES.filter((x) => x.pagePrefixes.length > 0)) {
      expect(menuIds).toContain(f.id);
    }
  });
});

describe('path mapping', () => {
  it('maps api prefixes (including nested paths) to the owning feature', () => {
    expect(featureForApiPath('/api/leaves')).toBe('leaves');
    expect(featureForApiPath('/api/leaves/12/signature')).toBe('leaves');
    expect(featureForApiPath('/api/leave-rules')).toBe('leaves');
    expect(featureForApiPath('/api/holidays')).toBe('leaves');
    expect(featureForApiPath('/api/roster/summary')).toBe('roster');
    expect(featureForApiPath('/api/supply-transactions')).toBe('supplies');
    expect(featureForApiPath('/api/asset-checkouts/3')).toBe('assets');
    expect(featureForApiPath('/api/uploads/document')).toBe('documents');
    expect(featureForApiPath('/api/form-requests/5/status')).toBe('forms');
    expect(featureForApiPath('/api/columns/reorder')).toBe('tasks');
    expect(featureForApiPath('/api/dashboard')).toBeUndefined(); // หน้าหลักเป็นฟีเจอร์หลัก
  });

  it('does not match look-alike prefixes', () => {
    expect(featureForApiPath('/api/leavesX')).toBeUndefined();
    expect(featureForApiPath('/api/tasksfoo')).toBeUndefined();
  });

  it('maps pages with the longest prefix', () => {
    expect(featureForPagePath('/dashboard/leaves')).toBe('leaves');
    expect(featureForPagePath('/dashboard/leaves/123')).toBe('leaves');
    expect(featureForPagePath('/dashboard/settings/form-builder')).toBe('forms');
    expect(featureForPagePath('/dashboard/unknown')).toBeUndefined();
  });
});

describe('resolveFeatures', () => {
  it('no rows = every feature enabled with default options and config', () => {
    const map = resolveFeatures([]);
    for (const f of FEATURES) expect(isFeatureOn(map, f.id)).toBe(true);
    expect(map.leaves.config).toEqual({ lateArrivalFixedTime: '08:30', workStartTime: '08:30', workEndTime: '16:30' });
    expect(map.leaves.options).toEqual({ lateArrival: true, earlyLeave: true });
    expect(map.notifications.options).toEqual({ taskReminders: true, leaveNotifications: true });
  });

  it('applies stored rows; ignores invalid stored values', () => {
    const map = resolveFeatures([
      { featureKey: 'supplies', enabled: false },
      { featureKey: 'leaves', enabled: true, options: { lateArrival: false, bogus: true }, config: { lateArrivalFixedTime: '09:00', workEndTime: 'nope' } },
      { featureKey: 'unknown_feature', enabled: false },
    ]);
    expect(isFeatureOn(map, 'supplies')).toBe(false);
    expect(map.leaves.options).toEqual({ lateArrival: false, earlyLeave: true });
    expect(map.leaves.config.lateArrivalFixedTime).toBe('09:00');
    expect(map.leaves.config.workEndTime).toBe('16:30');
    expect(Object.keys(map)).not.toContain('unknown_feature');
  });

  it('options need the parent feature to be enabled too', () => {
    const map = resolveFeatures([{ featureKey: 'notifications', enabled: false }]);
    expect(isOptionOn(map, 'notifications', 'taskReminders')).toBe(false);
    expect(isOptionOn(resolveFeatures([]), 'notifications', 'taskReminders')).toBe(true);
  });
});

describe('landingPath', () => {
  it('staff always land on the dashboard (a core feature that cannot be disabled)', () => {
    expect(landingPath(resolveFeatures([]), 'ADMIN')).toBe('/dashboard');
    const allOff = resolveFeatures(FEATURES.map((f) => ({ featureKey: f.id, enabled: false })));
    expect(landingPath(allOff, 'SUPER_ADMIN')).toBe('/dashboard');
    expect(landingPath(allOff, 'MANAGER')).toBe('/dashboard');
  });
  it('employees (no dashboard) go to the first enabled feature, else their profile', () => {
    expect(landingPath(resolveFeatures([]), 'EMPLOYEE')).toBe('/dashboard/tasks');
    const noTasks = resolveFeatures([{ featureKey: 'tasks', enabled: false }]);
    expect(landingPath(noTasks, 'EMPLOYEE')).toBe('/dashboard/leaves');
    const none = resolveFeatures(['tasks', 'leaves', 'roster', 'forms'].map((k) => ({ featureKey: k, enabled: false })));
    expect(landingPath(none, 'EMPLOYEE')).toBe('/dashboard/profile');
  });
});

describe('who may manage features', () => {
  it('only SUPER_ADMIN', () => {
    expect(canManageFeatures('SUPER_ADMIN')).toBe(true);
    for (const r of ['ADMIN', 'MANAGER', 'DIRECTOR', 'HR', 'EMPLOYEE', '', undefined, null, 'super_admin']) {
      expect(canManageFeatures(r as string | undefined | null)).toBe(false);
    }
  });
});

describe('fresh install defaults', () => {
  it('disables every optional feature except LINE notifications, and the dashboard is never disableable', () => {
    expect(FRESH_INSTALL_DISABLED_FEATURES).toContain('leaves');
    expect(FRESH_INSTALL_DISABLED_FEATURES).toContain('tasks');
    expect(FRESH_INSTALL_DISABLED_FEATURES).not.toContain('notifications');
    expect(FRESH_INSTALL_DISABLED_FEATURES.length).toBe(FEATURES.length - 1);
  });
});

describe('guard cannot be bypassed with path tricks (api + pages)', () => {
  const apiVariants = [
    '/api/leaves', '/api/LEAVES', '/api/Leaves/', '/api//leaves', '/api/./leaves', '/api/x/../leaves', '/api/%6Ceaves',
    '/api/%4Ceaves', '/api%2Fleaves', '/api\\leaves', '/api/leaves/../leaves/1', '/api/x/%2e%2e/leaves',
  ];
  it.each(apiVariants)('api %s is still recognised as the leaves feature', (p) => {
    expect(featureForApiPath(p)).toBe('leaves');
  });
  const pageVariants = ['/dashboard/leaves', '/dashboard//leaves', '/dashboard/./leaves', '/dashboard/x/../leaves', '/dashboard/%6Ceaves', '/DASHBOARD/LEAVES'];
  it.each(pageVariants)('page %s is still recognised as the leaves feature', (p) => {
    expect(featureForPagePath(p)).toBe('leaves');
  });
  it('does not turn core paths into features via dot-segments', () => {
    expect(featureForApiPath('/api/leaves/../users')).toBeDefined(); // raw prefix still matches (deny-list is conservative)
    expect(featureForApiPath('/api/users/../auth/login')).toBeUndefined();
  });
});

describe('validateFeaturePatch', () => {
  it('accepts valid patches and rejects unknown keys / bad values', () => {
    expect(validateFeaturePatch({ featureKey: 'leaves', enabled: false })).toBeNull();
    expect(validateFeaturePatch({ featureKey: 'leaves', config: { lateArrivalFixedTime: '08:45' }, options: { earlyLeave: false } })).toBeNull();
    expect(validateFeaturePatch({ featureKey: 'users', enabled: false })).not.toBeNull();
    expect(validateFeaturePatch({ featureKey: 'leaves', config: { lateArrivalFixedTime: '8:45' } })).not.toBeNull();
    expect(validateFeaturePatch({ featureKey: 'leaves', config: { nope: '08:00' } })).not.toBeNull();
    expect(validateFeaturePatch({ featureKey: 'leaves', options: { nope: true } })).not.toBeNull();
    expect(validateFeaturePatch({ featureKey: 'supplies', options: { x: true } })).not.toBeNull();
  });
  it('TIME_REGEX is HH:mm 24h', () => {
    expect(TIME_REGEX.test('00:00')).toBe(true);
    expect(TIME_REGEX.test('23:59')).toBe(true);
    expect(TIME_REGEX.test('24:00')).toBe(false);
    expect(TIME_REGEX.test('9:00')).toBe(false);
  });
});
