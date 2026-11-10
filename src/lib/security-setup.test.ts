import { describe, it, expect } from 'vitest';
import {
  isSetupAllowedPath,
  isPasskeyEnforceable,
  initialSetupFlags,
  isInitialPasswordExpired,
  INITIAL_PASSWORD_VALID_DAYS,
} from './security-setup';

describe('isSetupAllowedPath', () => {
  it('allows only the endpoints needed to finish first-time setup', () => {
    for (const p of [
      '/api/auth/session',
      '/api/auth/logout',
      '/api/auth/change-password',
      '/api/auth/setup-status',
      '/api/auth/passkey',
      '/api/auth/passkey/register/options',
      '/api/auth/passkey/register/verify',
      '/api/auth/2fa',
      '/api/auth/2fa/setup',
      '/api/auth/2fa/enable',
      '/api/auth/2fa/verify',
      '/api/auth/2fa/backup-codes/regenerate',
      '/api/users/me',
    ]) {
      expect(isSetupAllowedPath(p)).toBe(true);
    }
  });

  it('blocks everything else, including look-alike prefixes', () => {
    for (const p of [
      '/api/users',
      '/api/users/options',
      '/api/leaves',
      '/api/dashboard',
      '/api/auth/session-evil',
      '/api/auth/passkey-other',
      '/api/auth/passkey/1', // DELETE passkey by id is not part of setup
      '/api/users/me/../1',
      // admin-only reset of someone else's 2FA must NOT be reachable while the account is still in first-time setup
      '/api/auth/2fa/5',
      '/api/auth/2fa/5/',
      '/api/auth/2fa/1',
      '/api/auth/2fa/setup/extra',
      // รูปแบบที่พยายามหลบด้วย encoding / slash ซ้อน / dot-segment / backslash — ปฏิเสธทั้งหมด
      '/api/users/me/%2e%2e/1',
      '/api/auth/session/../../users',
      '/api//users',
      '/api/%75sers',
      '/api\\users',
      '/api/auth/%73ession%00',
      '/api/auth/session\0/../users',
    ]) {
      expect(isSetupAllowedPath(p)).toBe(false);
    }
  });
});

describe('isPasskeyEnforceable', () => {
  it('is false for IP RP IDs and http origins (WebAuthn impossible), true for localhost and https domains', () => {
    expect(isPasskeyEnforceable({ RP_ID: '192.0.2.10', WEBAUTHN_ORIGIN: 'https://192.0.2.10' })).toBe(false);
    expect(isPasskeyEnforceable({ RP_ID: 'ems.example.org', WEBAUTHN_ORIGIN: 'http://ems.example.org' })).toBe(false);
    expect(isPasskeyEnforceable({ RP_ID: 'ems.example.org', WEBAUTHN_ORIGIN: 'https://ems.example.org' })).toBe(true);
    expect(isPasskeyEnforceable({ RP_ID: 'localhost', WEBAUTHN_ORIGIN: 'http://localhost:3000' })).toBe(true);
  });

  it('ENFORCE_PASSKEY_SETUP=true forces it', () => {
    expect(isPasskeyEnforceable({ RP_ID: '10.0.0.5', ENFORCE_PASSKEY_SETUP: 'true' })).toBe(true);
  });
});

describe('initialSetupFlags / isInitialPasswordExpired', () => {
  it('sets mustChangePassword and a 7-day expiry', () => {
    const now = new Date('2026-11-09T00:00:00Z');
    const f = initialSetupFlags({ now });
    expect(f.mustChangePassword).toBe(true);
    expect(f.initialPasswordExpiresAt.getTime() - now.getTime()).toBe(INITIAL_PASSWORD_VALID_DAYS * 86400000);
  });

  it('does not require another passkey when the user already has one', () => {
    expect(initialSetupFlags({ hasPasskey: true }).forcePasskeySetup).toBe(false);
  });

  it('expires only while the password is still the initial one', () => {
    const past = new Date(Date.now() - 1000);
    expect(isInitialPasswordExpired({ mustChangePassword: true, initialPasswordExpiresAt: past })).toBe(true);
    expect(isInitialPasswordExpired({ mustChangePassword: false, initialPasswordExpiresAt: past })).toBe(false);
    expect(isInitialPasswordExpired({ mustChangePassword: true, initialPasswordExpiresAt: null })).toBe(false);
    expect(isInitialPasswordExpired({ mustChangePassword: true, initialPasswordExpiresAt: new Date(Date.now() + 60000) })).toBe(false);
  });
});
