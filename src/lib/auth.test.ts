import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { checkRole, isAdmin, isManagerOrAbove, isSuperAdmin, getClientIp } from './auth';
import type { UserRole } from '@/types';

const ALL_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR', 'EMPLOYEE', 'HR'];

describe('checkRole', () => {
  it('returns true when the role is in the allowed list', () => {
    expect(checkRole('ADMIN', ['ADMIN', 'SUPER_ADMIN'])).toBe(true);
  });

  it('returns false when the role is not in the allowed list', () => {
    expect(checkRole('EMPLOYEE', ['ADMIN', 'SUPER_ADMIN'])).toBe(false);
  });

  it('returns false for an empty allowed list', () => {
    expect(checkRole('SUPER_ADMIN', [])).toBe(false);
  });
});

describe('isAdmin', () => {
  it.each<[UserRole, boolean]>([
    ['SUPER_ADMIN', true],
    ['ADMIN', true],
    ['MANAGER', false],
    ['DIRECTOR', false],
    ['EMPLOYEE', false],
    ['HR', false],
  ])('isAdmin(%s) -> %s', (role, expected) => {
    expect(isAdmin(role)).toBe(expected);
  });
});

describe('isManagerOrAbove', () => {
  it.each<[UserRole, boolean]>([
    ['SUPER_ADMIN', true],
    ['ADMIN', true],
    ['MANAGER', true],
    ['DIRECTOR', true],
    ['EMPLOYEE', false],
    ['HR', false],
  ])('isManagerOrAbove(%s) -> %s', (role, expected) => {
    expect(isManagerOrAbove(role)).toBe(expected);
  });
});

describe('isSuperAdmin', () => {
  it('is true only for SUPER_ADMIN', () => {
    for (const role of ALL_ROLES) {
      expect(isSuperAdmin(role)).toBe(role === 'SUPER_ADMIN');
    }
  });
});

describe('getClientIp', () => {
  function reqWithHeaders(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost:3000/api/test', { headers });
  }

  it('uses the entry appended by the trusted proxy (rightmost), not client-supplied left-hand entries', () => {
    // ผู้โจมตีใส่ XFF ปลอมมาก่อน; reverse proxy ของเรา append IP จริงของ peer ไว้ท้ายสุด
    const req = reqWithHeaders({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 203.0.113.9', 'x-real-ip': '9.9.9.9' });
    expect(getClientIp(req)).toBe('203.0.113.9');
  });

  it('a single forwarded entry is used as-is', () => {
    expect(getClientIp(reqWithHeaders({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = reqWithHeaders({ 'x-real-ip': '9.9.9.9' });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('returns "unknown" when neither header is present', () => {
    const req = reqWithHeaders({});
    expect(getClientIp(req)).toBe('unknown');
  });

  it('trims whitespace around forwarded entries', () => {
    const req = reqWithHeaders({ 'x-forwarded-for': '1.2.3.4  ,   5.6.7.8  ' });
    expect(getClientIp(req)).toBe('5.6.7.8');
  });

  it('TRUSTED_PROXY_HOPS=2 skips the last hop (e.g. CDN + reverse proxy)', () => {
    const prev = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = '2';
    try {
      expect(getClientIp(reqWithHeaders({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 172.16.0.1' }))).toBe('203.0.113.9');
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = prev;
    }
  });
});
