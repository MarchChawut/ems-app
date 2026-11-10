/**
 * ==================================================
 * Reminder Check (run-once, triggered by systemd timer)
 * ==================================================
 * รันครั้งเดียวแล้วจบ ยิง GET ไปที่ /api/cron/reminders ของแอปเองผ่าน
 * LAN/localhost (ไม่ต้องเปิด inbound จากอินเทอร์เน็ต) เพื่อให้ทำงานได้ทั้งบน
 * Synology NAS ปัจจุบัน และเมื่อย้ายไปอยู่หลังไฟร์วอลล์ของหน่วยงานราชการในอนาคต
 * การตั้งเวลาทุก 1 นาทีทำโดย systemd timer (ดู systemd/ems-reminder-check.timer)
 * ไม่ได้ schedule ตัวเองในโปรเซสเหมือนเดิม
 *
 * รันด้วยมือ:   npm run worker:reminders
 *
 * Env vars (อ่านจาก worker/.env.worker ก่อน แล้วค่อย fallback ไปที่ .env ของแอป
 * เพื่อให้ worker ต้องการสิทธิ์อ่านเฉพาะค่าที่จำเป็น ไม่ต้องเห็น DB password / LINE
 * token / JWT secret เหมือน .env เต็มไฟล์):
 *   CRON_SECRET           (จำเป็น) ต้องตรงกับที่ /api/cron/reminders ใช้ตรวจสอบ
 *   REMINDER_TARGET_URL   (ไม่บังคับ) default http://localhost:3000/api/cron/reminders
 *   HEALTHCHECK_PING_URL  (ไม่บังคับ) Healthchecks.io ping URL สำหรับ dead man's switch
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../src/lib/logger';

// โหลด env แบบ manual (ไม่พึ่ง dotenv) — ลอง worker/.env.worker ก่อน แล้ว fallback .env
// ไม่เขียนทับ key ที่ตั้งไว้แล้วใน process.env (เช่นตอนรันผ่าน systemd Environment=)
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile(path.resolve(__dirname, '.env.worker'));
loadEnvFile(path.resolve(__dirname, '../.env'));

const TARGET_URL = process.env.REMINDER_TARGET_URL ?? 'http://localhost:3000/api/cron/reminders';
const CRON_SECRET = process.env.CRON_SECRET;
const HEALTHCHECK_PING_URL = process.env.HEALTHCHECK_PING_URL;

if (!CRON_SECRET) {
  logger.error('ไม่ได้ตั้งค่า CRON_SECRET (worker/.env.worker หรือ .env)');
  process.exit(1);
}

function pingHealthcheck(suffix: '' | '/fail'): void {
  if (!HEALTHCHECK_PING_URL) return;
  fetch(`${HEALTHCHECK_PING_URL}${suffix}`).catch((error) => {
    logger.debug('ping healthcheck ไม่สำเร็จ (ไม่กระทบการทำงานหลัก)', { error });
  });
}

async function runReminderCheck(): Promise<boolean> {
  try {
    const response = await fetch(TARGET_URL, {
      method: 'GET',
      headers: { 'x-cron-secret': CRON_SECRET as string },
    });

    const body = await response.text();

    if (!response.ok) {
      logger.error('reminder heartbeat: request ไม่สำเร็จ', { status: response.status, body });
      pingHealthcheck('/fail');
      return false;
    }

    let parsed: { checked?: number; sent?: number; failed?: number; skipped?: boolean } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // เผื่อ endpoint ตอบไม่เป็น JSON (เช่น error page) — ยัง log ดิบไว้เป็นหลักฐาน
    }

    logger.info('reminder heartbeat', {
      status: response.status,
      skipped: parsed.skipped ?? false,
      checked: parsed.checked ?? null,
      sent: parsed.sent ?? null,
      failed: parsed.failed ?? null,
    });
    pingHealthcheck('');
    return true;
  } catch (error) {
    logger.error('reminder heartbeat: fetch ล้มเหลว', { error, target: TARGET_URL });
    pingHealthcheck('/fail');
    return false;
  }
}

function checkTimezone(): void {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (resolved !== 'Asia/Bangkok') {
    logger.warn('Timezone ของเครื่องไม่ใช่ Asia/Bangkok — เวลาแจ้งเตือนอาจคลาดเคลื่อน', {
      resolvedTimeZone: resolved,
      TZ: process.env.TZ ?? null,
    });
  } else {
    logger.info('Timezone ตรวจสอบแล้ว', { resolvedTimeZone: resolved });
  }
}

checkTimezone();
logger.info('reminder-worker: เริ่มตรวจสอบ (run-once)', { target: TARGET_URL });

runReminderCheck()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error) => {
    logger.error('reminder-worker: unhandled error', { error });
    process.exit(1);
  });
