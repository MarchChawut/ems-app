import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { replyLineMessage } from '@/lib/line';
import { POST } from './route';

// Tests must never fire real LINE messages — mock the network boundary entirely.
vi.mock('@/lib/line', () => ({
  sendLineGroupMessage: vi.fn().mockResolvedValue(true),
  replyLineMessage: vi.fn().mockResolvedValue(undefined),
}));

const CHANNEL_SECRET = 'test-not-real'; // matches LINE_CHANNEL_SECRET in .env.test

function sign(rawBody: string): string {
  return createHmac('sha256', CHANNEL_SECRET).update(rawBody).digest('base64');
}

function req(body: unknown, signature?: string) {
  const rawBody = JSON.stringify(body);
  return new NextRequest('http://localhost:3000/api/line/webhook', {
    method: 'POST',
    headers: signature !== undefined ? { 'x-line-signature': signature } : undefined,
    body: rawBody,
  });
}

describe('POST /api/line/webhook', () => {
  beforeEach(() => {
    vi.mocked(replyLineMessage).mockClear();
  });

  it('returns 401 when the signature header is missing', async () => {
    const res = await POST(req({ events: [] }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid signature', async () => {
    const res = await POST(req({ events: [] }, 'not-a-valid-signature'));
    expect(res.status).toBe(401);
  });

  it('accepts a correctly-signed empty event list', async () => {
    const payload = { events: [] };
    const res = await POST(req(payload, sign(JSON.stringify(payload))));
    expect(res.status).toBe(200);
  });

  it('replies with the group ID for a group message event', async () => {
    const payload = {
      events: [
        { type: 'message', replyToken: 'abc123', source: { type: 'group', groupId: 'G12345' } },
      ],
    };
    const res = await POST(req(payload, sign(JSON.stringify(payload))));
    expect(res.status).toBe(200);
    expect(vi.mocked(replyLineMessage)).toHaveBeenCalledWith('abc123', expect.stringContaining('G12345'));
  });

  it('ignores non-group message events (no reply sent)', async () => {
    const payload = {
      events: [{ type: 'message', replyToken: 'abc123', source: { type: 'user', userId: 'U1' } }],
    };
    const res = await POST(req(payload, sign(JSON.stringify(payload))));
    expect(res.status).toBe(200);
    expect(vi.mocked(replyLineMessage)).not.toHaveBeenCalled();
  });
});
