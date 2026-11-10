/**
 * ค่าคงที่ที่ใช้ร่วมกันระหว่าง e2e/global-setup.ts กับ spec files
 * E2E_TOTP_SECRET เป็น secret ทดสอบคงที่ (ไม่ใช่ความลับจริง) ผูกกับผู้ใช้เทสที่ใช้แล้วทิ้งเท่านั้น
 * ทำให้ e2e/helpers/login.ts คำนวณรหัส TOTP จริงด้วย otplib แล้วยืนยันผ่าน flow จริงได้
 */

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const E2E_PASSWORD = 'E2eTest1234!';

export const E2E_ADMIN_USERNAME = 'e2e_admin';
export const E2E_EMPLOYEE_USERNAME = 'e2e_employee';
