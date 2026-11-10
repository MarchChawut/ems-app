import { describe, it, expect } from 'vitest';
import { normalizeRequestPath, isCanonicalPath } from './path-normalize';

describe('normalizeRequestPath', () => {
  it('leaves clean paths alone and strips the trailing slash', () => {
    expect(normalizeRequestPath('/api/leaves')).toBe('/api/leaves');
    expect(normalizeRequestPath('/api/leaves/')).toBe('/api/leaves');
    expect(normalizeRequestPath('/')).toBe('/');
  });

  it('decodes percent-encoding, collapses slashes and resolves dot-segments', () => {
    expect(normalizeRequestPath('/api/%6Ceaves')).toBe('/api/leaves');
    expect(normalizeRequestPath('/api//leaves')).toBe('/api/leaves');
    expect(normalizeRequestPath('/api/./leaves')).toBe('/api/leaves');
    expect(normalizeRequestPath('/api/x/../leaves')).toBe('/api/leaves');
    expect(normalizeRequestPath('/api/x/%2e%2e/leaves')).toBe('/api/leaves');
    expect(normalizeRequestPath('/api\\leaves')).toBe('/api/leaves');
    expect(normalizeRequestPath('/api%2Fleaves')).toBe('/api/leaves');
  });

  it('cannot climb above the root', () => {
    expect(normalizeRequestPath('/../../api/leaves')).toBe('/api/leaves');
  });

  it('optionally lowercases', () => {
    expect(normalizeRequestPath('/API/Leaves', { lowercase: true })).toBe('/api/leaves');
    expect(normalizeRequestPath('/API/Leaves')).toBe('/API/Leaves');
  });

  it('rejects null bytes, malformed encoding, empty and relative paths', () => {
    expect(normalizeRequestPath('/api/le\0aves')).toBeNull();
    expect(normalizeRequestPath('/api/le%00aves')).toBeNull();
    expect(normalizeRequestPath('/api/%ZZ')).toBeNull();
    expect(normalizeRequestPath('')).toBeNull();
    expect(normalizeRequestPath('api/leaves')).toBeNull();
  });
});

describe('isCanonicalPath', () => {
  it('accepts only already-clean paths (a trailing slash is tolerated)', () => {
    expect(isCanonicalPath('/api/auth/session')).toBe(true);
    expect(isCanonicalPath('/api/auth/session/')).toBe(true);
  });

  it('rejects anything that needed normalizing', () => {
    for (const p of ['/api//auth/session', '/api/auth/./session', '/api/auth/x/../session', '/api/auth/%73ession', '/api\\auth/session', '/api/auth/session/..']) {
      expect(isCanonicalPath(p)).toBe(false);
    }
  });
});
