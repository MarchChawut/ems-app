/**
 * โหลด .env.test เข้า process.env — แบบ manual (ไม่พึ่ง dotenv เหมือน scripts/backup.ts)
 * ตั้งใจ "เขียนทับ" ค่าที่มีอยู่แล้วเสมอ (ต่างจาก loader ของ scripts อื่น) เพราะไฟล์เทส
 * ต้องการันตีว่าใช้ DATABASE_URL ของฐานข้อมูลเทสเสมอ ไม่ว่า shell ที่รันจะ export
 * ค่าอะไรมาก่อนหน้าก็ตาม — เป็นส่วนหนึ่งของมาตรการความปลอดภัยไม่ให้เทสหลุดไปโดนฐานข้อมูลจริง
 */

import * as fs from 'fs';
import * as path from 'path';

let loaded = false;

export function loadTestEnv(): void {
  if (loaded) return;
  loaded = true;

  const envPath = path.resolve(__dirname, '../.env.test');
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `ไม่พบ .env.test ที่ ${envPath} — สร้างไฟล์นี้ก่อนรันเทส (ดู .env.test.example)`
    );
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}
