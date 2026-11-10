/**
 * ==================================================
 * API Route: /api/line/webhook
 * ==================================================
 * รับ webhook event จาก LINE Messaging API
 * ใช้ตอนตั้งค่าครั้งแรกเพื่อดึง Group ID ของกลุ่มเป้าหมาย:
 * พิมพ์ข้อความอะไรก็ได้ในกลุ่มที่เชิญบอทเข้าไปแล้ว บอทจะตอบกลับ Group ID
 * ในแชททันที ให้คัดลอกไปใส่ LINE_GROUP_ID ใน .env
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { replyLineMessage } from '@/lib/line';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: {
    type: string;
    groupId?: string;
    userId?: string;
  };
}

function isSignatureValid(rawBody: string, signature: string, channelSecret: string): boolean {
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function POST(request: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const signature = request.headers.get('x-line-signature');
  const rawBody = await request.text();

  if (!channelSecret || !signature || !isSignatureValid(rawBody, signature, channelSecret)) {
    logger.warn('LINE webhook: signature ไม่ถูกต้อง');
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let events: LineEvent[] = [];
  try {
    events = JSON.parse(rawBody).events ?? [];
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  for (const event of events) {
    if (event.type === 'message' && event.source?.type === 'group' && event.replyToken && event.source.groupId) {
      logger.info('LINE webhook: ได้รับข้อความจากกลุ่ม', { groupId: event.source.groupId });
      await replyLineMessage(event.replyToken, `Group ID: ${event.source.groupId}`);
    }
  }

  return NextResponse.json({ success: true });
}
