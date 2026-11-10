import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function req(path: string, init?: { method?: string; headers?: Record<string, string> }) {
  return new NextRequest(new URL(path, 'http://app.example.test'), {
    method: init?.method ?? 'GET',
    headers: { host: 'app.example.test', ...(init?.headers ?? {}) },
  });
}

describe('proxy CSRF / origin protection', () => {
  it('rejects a cross-origin state-changing API request (the check previously never ran)', async () => {
    const res = proxy(req('/api/leaves', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('INVALID_ORIGIN');
  });

  it('also protects public auth endpoints (login is POST too)', () => {
    const res = proxy(req('/api/auth/login', { method: 'POST', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
  });

  it('rejects Sec-Fetch-Site: cross-site even when Origin is absent', () => {
    const res = proxy(req('/api/users', { method: 'DELETE', headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(res.status).toBe(403);
  });

  it('allows same-origin requests (Origin host equals Host)', () => {
    const res = proxy(req('/api/leaves', { method: 'POST', headers: { origin: 'http://app.example.test' } }));
    expect(res.status).not.toBe(403);
  });

  it('honours X-Forwarded-Host behind a reverse proxy', () => {
    const res = proxy(
      req('/api/leaves', {
        method: 'POST',
        headers: { origin: 'https://ems.example.org', 'x-forwarded-host': 'ems.example.org' },
      })
    );
    expect(res.status).not.toBe(403);
  });

  it('allows requests with no Origin (curl, LINE webhook, cron) and safe methods', () => {
    expect(proxy(req('/api/line/webhook', { method: 'POST' })).status).not.toBe(403);
    expect(proxy(req('/api/leaves', { headers: { origin: 'https://evil.example' } })).status).not.toBe(403);
  });

  it('does not emit CORS headers for foreign origins', () => {
    const res = proxy(req('/api/leaves', { headers: { origin: 'https://evil.example' } }));
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('blocks the legacy public /uploads path', () => {
    expect(proxy(req('/uploads/profiles/profile_1.jpg')).status).toBe(404);
  });
});
