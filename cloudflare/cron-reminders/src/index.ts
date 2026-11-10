/**
 * ==================================================
 * Cloudflare Worker - Cron Trigger สำหรับแจ้งเตือนงาน (LINE)
 * ==================================================
 * ทำงานทุก 1 นาที (ดู wrangler.toml [triggers]) ยิง GET ไปที่
 * /api/cron/reminders ของแอป EMS พร้อม header x-cron-secret
 * เพื่อให้แอปตรวจสอบและส่งแจ้งเตือนที่ถึงกำหนดเข้ากลุ่ม LINE
 */

export interface Env {
  TARGET_URL: string;
  CRON_SECRET: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runReminderCheck(env));
  },

  // เผื่อทดสอบด้วยการเปิด URL ตรงๆ ผ่านเบราว์เซอร์/curl (ไม่ใช่ทาง cron)
  async fetch(_request: Request, env: Env): Promise<Response> {
    const result = await runReminderCheck(env);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

async function runReminderCheck(env: Env): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const response = await fetch(env.TARGET_URL, {
      method: 'GET',
      headers: { 'x-cron-secret': env.CRON_SECRET },
    });

    const body = await response.text();
    console.log(`[cron-reminders] status=${response.status} body=${body}`);

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    console.error('[cron-reminders] fetch failed', error);
    return { ok: false, status: 0, body: String(error) };
  }
}
