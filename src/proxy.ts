/**
 * ==================================================
 * Next.js Proxy (middleware) - ด่านแรกของทุก request
 * ==================================================
 * หน้าที่ (การตรวจสิทธิ์/session ทำที่ route และ server component ผ่าน requireAuth/getCurrentUser):
 *  1. กัน CSRF ข้ามเว็บ: คำขอที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE) ไป /api/* ต้องมาจาก origin เดียวกัน
 *     หรืออยู่ใน ALLOWED_ORIGINS — ชั้นนี้เสริมจาก cookie SameSite=Strict
 *  2. CORS สำหรับ origin ที่อนุญาตเท่านั้น
 *  3. ปิดเส้นทางเก่า /uploads/* (ไฟล์ที่เคยเสิร์ฟสาธารณะโดยไม่ต้องล็อกอิน — ตอนนี้เก็บใน DB เปิดผ่าน /api/files ที่ต้องล็อกอิน)
 *  4. (เลือกเปิดด้วย FORCE_HTTPS=true) redirect HTTP → HTTPS
 *
 * หมายเหตุ: security headers (CSP, HSTS ฯลฯ) กำหนดที่เดียวใน next.config.js headers()
 *
 * ประวัติบั๊ก: เดิมมี publicPaths ที่มี '/' และเช็คด้วย startsWith ทำให้ "ทุก path" ถูกมองเป็น public แล้ว return ทันที
 * — การตรวจ origin / HTTPS ทั้งหมดด้านล่างจึงไม่เคยทำงานเลย
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** รายการ origin ที่อนุญาตข้ามเว็บ (คั่นด้วย , รองรับ wildcard เช่น https://*.example.com); same-origin อนุญาตเสมอ */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function matchesAllowedList(origin: string): boolean {
  return ALLOWED_ORIGINS.some((allowed) => {
    if (allowed.includes('*')) {
      const pattern = allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(origin);
    }
    return origin === allowed;
  });
}

/** origin เดียวกับที่ผู้ใช้เปิดเว็บอยู่ (เทียบ host กับ Host / X-Forwarded-Host ของ request) */
function isSameOrigin(origin: string, request: NextRequest): boolean {
  try {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin: string, request: NextRequest): boolean {
  return isSameOrigin(origin, request) || matchesAllowedList(origin);
}

function addCorsHeaders(response: NextResponse, origin: string | null, request: NextRequest): void {
  // ใส่ CORS เฉพาะ origin ที่อนุญาต (ห้ามใช้ '*' ร่วมกับ credentials)
  if (origin && isAllowedOrigin(origin, request)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400');
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin');

  // 1) เส้นทางไฟล์สาธารณะเดิม — ปิดถาวร (ไฟล์ส่วนบุคคลต้องผ่าน /api/files ที่ตรวจการล็อกอิน)
  if (pathname === '/uploads' || pathname.startsWith('/uploads/')) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // 2) HTTPS redirect (opt-in: เปิดเมื่อมี HTTPS จริงเท่านั้น ไม่งั้นการเข้าผ่าน http://IP ภายในจะใช้ไม่ได้)
  if (
    process.env.FORCE_HTTPS === 'true' &&
    process.env.NODE_ENV === 'production' &&
    !(request.headers.get('x-forwarded-proto') || '').includes('https') &&
    request.nextUrl.protocol !== 'https:'
  ) {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 301);
  }

  if (pathname.startsWith('/api/')) {
    // preflight: ตอบเฉพาะ origin ที่อนุญาต
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      addCorsHeaders(response, origin, request);
      return response;
    }

    // 3) CSRF: คำขอที่เปลี่ยนข้อมูล (รวม /api/auth/*) ต้องไม่ใช่ cross-site
    //    - Sec-Fetch-Site: cross-site (เบราว์เซอร์ส่งให้เอง ปลอมจาก JS ไม่ได้) → ปฏิเสธ
    //    - มี Origin แต่ไม่ใช่ same-origin และไม่อยู่ใน ALLOWED_ORIGINS → ปฏิเสธ
    //    - ไม่มี Origin/Sec-Fetch-Site (curl, LINE webhook, cron) → ผ่าน (ไม่ใช่เบราว์เซอร์ของเหยื่อ; ตรวจสิทธิ์ที่ route)
    if (STATE_CHANGING_METHODS.has(request.method)) {
      const fetchSite = request.headers.get('sec-fetch-site');
      const crossSite = fetchSite === 'cross-site' && !(origin && isAllowedOrigin(origin, request));
      if (crossSite || (origin && !isAllowedOrigin(origin, request))) {
        return NextResponse.json(
          { success: false, error: 'INVALID_ORIGIN', message: 'Origin not allowed' },
          { status: 403 }
        );
      }
    }
  }

  const response = NextResponse.next();
  if (pathname.startsWith('/api/')) {
    addCorsHeaders(response, origin, request);
  }
  return response;
}

/**
 * กำหนด paths ที่ proxy จะทำงาน (ยกเว้นไฟล์ static ของ Next)
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
