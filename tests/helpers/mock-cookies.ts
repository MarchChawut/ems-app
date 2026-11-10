/**
 * ==================================================
 * Mock ของ next/headers cookies()
 * ==================================================
 * requireAuth()/getCurrentUser()/createSession() ใน src/lib/auth.ts เรียก
 * cookies() จาก next/headers ตรงๆ (ไม่ได้อ่านจาก NextRequest ที่ส่งเข้ามา) —
 * ฟังก์ชันนี้ใช้ AsyncLocalStorage ภายในของ Next.js ซึ่งมีค่าเฉพาะตอนแอปรันจริง
 * ผ่าน Next.js server เท่านั้น เวลาเทสเรียก route handler ตรงๆ (import แล้วเรียก
 * GET()/POST() เอง) จึงต้อง mock module นี้แทน — เป็นแนวทางมาตรฐานสำหรับเทส
 * Route Handler ของ Next.js App Router แบบ isolated (ไม่ต้องเปิด server จริง)
 */

interface CookieEntry {
  name: string;
  value: string;
}

class MockCookieStore {
  private store = new Map<string, string>();

  get(name: string): CookieEntry | undefined {
    const value = this.store.get(name);
    return value === undefined ? undefined : { name, value };
  }

  set(name: string, value: string): void {
    this.store.set(name, value);
  }

  delete(name: string): void {
    this.store.delete(name);
  }

  has(name: string): boolean {
    return this.store.has(name);
  }

  clear(): void {
    this.store.clear();
  }
}

export const mockCookieStore = new MockCookieStore();

/** ใช้ในเทสเพื่อจำลองว่าผู้ใช้ล็อกอินอยู่แล้ว (มี session_token cookie) */
export function setMockSessionToken(token: string): void {
  mockCookieStore.set('session_token', token);
}

export function resetMockCookies(): void {
  mockCookieStore.clear();
}
