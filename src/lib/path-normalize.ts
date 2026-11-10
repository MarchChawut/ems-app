/**
 * ==================================================
 * Path Normalize - ทำ path ของ request ให้เป็นรูปมาตรฐานก่อนตัดสินใจเรื่องความปลอดภัย
 * ==================================================
 * ตัวตรวจที่เทียบ prefix ของ path ดิบ (เช่น "ฟีเจอร์นี้ปิดอยู่" "path นี้ใช้ได้ระหว่างตั้งค่าครั้งแรก") หลบได้ด้วย
 * percent-encoding (/api/%6Ceaves), slash ซ้อน (/api//leaves), dot-segment (/api/x/../leaves), ตัวพิมพ์ใหญ่-เล็ก,
 * backslash และ trailing slash ขณะที่ router ยังจับคู่เป็น route จริง — ไฟล์นี้เป็นตัวแปลงกลางที่ใช้ร่วมกัน
 * ไม่ import อะไร (ใช้ได้ทั้ง server, client, unit test)
 */

/**
 * path มาตรฐาน: decode percent-encoding 1 ชั้น, แปลง \ เป็น /, รวม slash ซ้อน, แก้ . และ .. ,
 * ตัด trailing slash, (ตัวเลือก) lowercase — คืน null ถ้า path ไม่ปลอดภัย/ตีความไม่ได้
 * (มี null byte, decode ไม่ได้, ไม่ขึ้นต้นด้วย /)
 */
export function normalizeRequestPath(pathname: string, opts: { lowercase?: boolean } = {}): string | null {
  if (typeof pathname !== 'string' || pathname.length === 0) return null;
  if (pathname.includes('\0')) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // percent-encoding ผิดรูป
  }
  if (decoded.includes('\0')) return null;

  const slashed = decoded.replace(/\\/g, '/');
  if (!slashed.startsWith('/')) return null;

  const out: string[] = [];
  for (const seg of slashed.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(opts.lowercase ? seg.toLowerCase() : seg);
  }
  return '/' + out.join('/');
}

/**
 * path นี้ "สะอาดอยู่แล้ว" ไหม — ไม่มี encoding/slash ซ้อน/dot-segment/backslash/ตัวผิดปกติ (ยกเว้น trailing slash 1 ตัว)
 * ใช้กับ allow-list (ผ่านได้เฉพาะ path ที่ตรงเป๊ะ) เพื่อไม่ให้รูปแบบแปลกๆ หลุดผ่านด้วยการแปลงแล้วบังเอิญตรง
 */
export function isCanonicalPath(pathname: string): boolean {
  const normalized = normalizeRequestPath(pathname);
  if (normalized === null) return false;
  const withoutTrailing = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return normalized === withoutTrailing;
}
