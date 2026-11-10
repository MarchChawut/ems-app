/**
 * ==================================================
 * Safety Guard — ป้องกันเทสหลุดไปโดนฐานข้อมูลจริง
 * ==================================================
 * เรียกก่อนการกระทำใดๆ ที่แตะฐานข้อมูลในเทส (global setup, beforeEach reset, ฯลฯ)
 * ถ้า DATABASE_URL ไม่ตรงกับรูปแบบของฐานข้อมูลเทสที่คาดไว้ ให้ throw ทันที
 */

const TEST_DB_MARKER = /localhost:3307\/ems_test|127\.0\.0\.1:3307\/ems_test/;

export function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL || '';

  if (!TEST_DB_MARKER.test(url)) {
    const redacted = url ? url.replace(/:\/\/[^@]+@/, '://<redacted>@') : '(ไม่ได้ตั้งค่า)';
    throw new Error(
      `ปฏิเสธการรันเทส: DATABASE_URL ไม่ใช่ฐานข้อมูลเทส\n` +
        `ต้องมี "localhost:3307/ems_test" อยู่ใน URL แต่ได้: ${redacted}\n` +
        `มาตรการนี้มีไว้เพื่อป้องกันไม่ให้เทสไปเขียน/ลบข้อมูลบนฐานข้อมูล production จริงโดยไม่ตั้งใจ`
    );
  }
}
