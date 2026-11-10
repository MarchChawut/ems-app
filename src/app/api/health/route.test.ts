import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function req(url = '/api/health') {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

describe('GET /api/health', () => {
  it('is unauthenticated and returns basic healthy status', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
  });

  it('returns a detailed status including database and memory checks', async () => {
    const res = await GET(req('/api/health?detailed=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checks.database.status).toBe('healthy');
    expect(typeof body.checks.memory.percentage).toBe('number');
    expect(typeof body.checks.uptime.seconds).toBe('number');
  });
});
