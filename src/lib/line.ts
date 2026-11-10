/**
 * ==================================================
 * LINE Messaging API - ส่งข้อความแจ้งเตือนเข้ากลุ่ม LINE
 * ==================================================
 * ใช้ LINE Messaging API (ไม่ใช่ LINE Notify ที่ถูกยกเลิกไปแล้ว)
 * ต้องมี Official Account ที่เชิญเข้ากลุ่มเป้าหมายแล้ว และตั้งค่า
 * LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID ใน .env
 */

import { logger } from '@/lib/logger';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

/**
 * ส่งข้อความ (text) เข้ากลุ่ม LINE ที่ตั้งค่าไว้ใน LINE_GROUP_ID
 * @param text - ข้อความที่ต้องการส่ง
 * @returns {Promise<boolean>} true หากส่งสำเร็จ
 */
export async function sendLineGroupMessage(text: string): Promise<boolean> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;

  if (!accessToken || !groupId) {
    logger.error('LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_GROUP_ID ยังไม่ได้ตั้งค่า', { hasToken: !!accessToken, hasGroupId: !!groupId });
    return false;
  }

  try {
    const response = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('ส่งข้อความเข้ากลุ่ม LINE ไม่สำเร็จ', { status: response.status, body });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('เกิดข้อผิดพลาดขณะส่งข้อความเข้ากลุ่ม LINE', { error });
    return false;
  }
}

/**
 * ตอบกลับข้อความในแชท LINE ผ่าน reply token (ใช้ครั้งเดียวต่อ event)
 * @param replyToken - reply token จาก webhook event
 * @param text - ข้อความที่ต้องการตอบกลับ
 */
export async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    logger.error('LINE_CHANNEL_ACCESS_TOKEN ยังไม่ได้ตั้งค่า');
    return;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('ตอบกลับข้อความ LINE ไม่สำเร็จ', { status: response.status, body });
    }
  } catch (error) {
    logger.error('เกิดข้อผิดพลาดขณะตอบกลับข้อความ LINE', { error });
  }
}
