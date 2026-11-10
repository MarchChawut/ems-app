/**
 * ==================================================
 * Security Smoke Test (black-box) — รันกับเซิร์ฟเวอร์ที่เปิดอยู่
 * ==================================================
 * ตรวจโดย "ไม่ล็อกอิน" และไม่เขียนข้อมูล (ยกเว้นคำขอที่ถูกปฏิเสธก่อนถึง DB):
 *   1. ทุก API route (สแกนจาก src/app/api) ต้องไม่ตอบ 200/5xx เมื่อไม่มี session (ยกเว้น route สาธารณะที่ระบุ)
 *   2. คำขอ POST/PUT/PATCH/DELETE ที่มี Origin ภายนอก ต้องถูกปฏิเสธ 403 (CSRF)
 *   3. /uploads/* ต้อง 404 (ไฟล์ส่วนบุคคลไม่เสิร์ฟสาธารณะ)
 *   4. security headers + CSP ตามที่กำหนด, cookie flags ของ session
 *   5. หน้า /dashboard ไม่ render ให้คนไม่ล็อกอิน และ HTML ไม่มีคำว่า twoFactorSecret
 *
 * การใช้งาน:
 *   pnpm build && pnpm start -p 3101        # ในอีก terminal
 *   BASE_URL=http://localhost:3101 pnpm exec tsx scripts/security-smoke.ts
 *
 * ส่วนที่ต้องล็อกอิน (เมทริกซ์สิทธิ์ตาม role, IDOR, บังคับตั้งค่าครั้งแรก) ครอบคลุมโดยเทสต์ DB-backed:
 *   src/app/api/security.test.ts และ *.test.ts ของแต่ละ route (รันด้วย pnpm test เมื่อมี DB ทดสอบ)
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE = (process.env.BASE_URL || 'http://localhost:3101').replace(/\/$/, '');
const API_DIR = path.resolve(__dirname, '../src/app/api');

// route ที่ตั้งใจให้เรียกได้โดยไม่ต้องมี session (มีการป้องกันแบบอื่น: secret/ลายเซ็น/ขั้นตอน 2FA)
const PUBLIC_ROUTES = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/session', // ตอบ 401 เมื่อไม่มี cookie
  '/api/auth/logout',
  '/api/auth/2fa/setup',
  '/api/auth/2fa/enable',
  '/api/auth/2fa/verify',
  '/api/auth/passkey/login/options',
  '/api/auth/passkey/login/verify',
  '/api/line/webhook', // ตรวจลายเซ็น x-line-signature
  '/api/cron/reminders', // ตรวจ x-cron-secret
]);

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'route.ts') out.push(p);
  }
  return out;
}

function routeInfo(file: string) {
  const rel = path.relative(API_DIR, path.dirname(file)).split(path.sep).join('/');
  const urlPath = '/api/' + rel.replace(/\[[^\]]+\]/g, '1');
  const src = fs.readFileSync(file, 'utf8');
  const methods = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
  return { urlPath, methods, templatePath: '/api/' + rel };
}

async function call(method: string, p: string, init: { headers?: Record<string, string>; body?: string } = {}) {
  return fetch(BASE + p, { method, redirect: 'manual', ...init });
}

async function main() {
  console.log(`Security smoke test → ${BASE}\n`);

  // ── 1) unauthenticated sweep ──────────────────────────────────────────
  const routes = walk(API_DIR).map(routeInfo);
  let swept = 0;
  for (const r of routes) {
    if (PUBLIC_ROUTES.has(r.templatePath) || PUBLIC_ROUTES.has(r.urlPath)) continue;
    for (const m of r.methods) {
      swept++;
      const hasBody = m !== 'GET' && m !== 'DELETE';
      const res = await call(m, r.urlPath, hasBody ? { headers: { 'content-type': 'application/json' }, body: '{}' } : {});
      const ok = res.status === 401 || res.status === 403;
      check(`unauthenticated ${m} ${r.templatePath}`, ok, `status ${res.status}`);
    }
  }
  console.log(`swept ${swept} protected route/method pairs without a session`);

  // ── 2) CSRF: foreign Origin on a state-changing request ───────────────
  for (const p of ['/api/auth/login', '/api/leaves', '/api/users']) {
    const res = await call('POST', p, {
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: '{}',
    });
    check(`CSRF foreign Origin blocked: POST ${p}`, res.status === 403, `status ${res.status}`);
  }
  const sfs = await call('DELETE', '/api/tasks/1', { headers: { 'sec-fetch-site': 'cross-site' } });
  check('CSRF Sec-Fetch-Site: cross-site blocked', sfs.status === 403, `status ${sfs.status}`);

  // ── 3) legacy public uploads closed ───────────────────────────────────
  for (const p of ['/uploads/profiles/profile_29_1770783731921.jpg', '/uploads/form/S__3293191.jpg', '/uploads']) {
    const res = await call('GET', p);
    check(`legacy public file closed: ${p}`, res.status === 404, `status ${res.status}`);
  }

  // ── 4) headers ────────────────────────────────────────────────────────
  const home = await call('GET', '/');
  const csp = home.headers.get('content-security-policy') || '';
  check('CSP present', csp.length > 0);
  check("CSP: object-src 'none'", csp.includes("object-src 'none'"));
  check("CSP: frame-ancestors 'self'", csp.includes("frame-ancestors 'self'"));
  check("CSP: base-uri 'self'", csp.includes("base-uri 'self'"));
  check("CSP: no 'unsafe-eval' (production build)", !csp.includes("'unsafe-eval'"), csp.includes("'unsafe-eval'") ? 'present (dev server?)' : '');
  check('X-Content-Type-Options: nosniff', home.headers.get('x-content-type-options') === 'nosniff');
  check('X-Frame-Options set', !!home.headers.get('x-frame-options'));
  check('Referrer-Policy set', !!home.headers.get('referrer-policy'));
  check('Strict-Transport-Security set', !!home.headers.get('strict-transport-security'));
  check('Permissions-Policy set', !!home.headers.get('permissions-policy'));
  check('X-Powered-By hidden', !home.headers.get('x-powered-by'));
  const cors = await call('GET', '/api/health', { headers: { origin: 'https://evil.example' } });
  check('no CORS allow-origin for foreign origin', !cors.headers.get('access-control-allow-origin'));

  // ── 5) pages / HTML leaks ─────────────────────────────────────────────
  const dash = await call('GET', '/dashboard');
  check('/dashboard not rendered for anonymous (redirect)', dash.status >= 300 && dash.status < 400, `status ${dash.status}`);
  const html = await (await call('GET', '/')).text();
  check('login HTML has no twoFactorSecret', !html.includes('twoFactorSecret'));

  // ── 6) health endpoint does not leak internals ────────────────────────
  const health = await call('GET', '/api/health');
  const healthText = await health.text();
  check('health does not expose env/DB URL', !/DATABASE_URL|mysql:\/\/|SECRET/i.test(healthText));

  // ── report ────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (!r.ok) console.log(`FAIL  ${r.name}  ${r.detail}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
