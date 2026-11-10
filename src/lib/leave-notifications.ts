/**
 * ==================================================
 * แจ้งเตือน LINE ตามขั้นตอนอนุมัติการลา
 * ==================================================
 * รวม logic สร้างข้อความ + เรียก sendLineGroupMessage ไว้ที่เดียว
 * ให้ทั้ง POST /api/leaves และ PATCH /api/leaves/[id] เรียกใช้ร่วมกัน
 */

import { sendLineGroupMessage } from '@/lib/line';
import { getFeatureSettings } from '@/lib/feature-settings-server';
import { isFeatureOn, isOptionOn } from '@/lib/features';
import { formatDate } from '@/lib/utils';

const leaveTypeLabels: Record<string, string> = {
  SICK: 'ลาป่วย',
  PERSONAL: 'ลากิจ',
  MATERNITY: 'ลาคลอดบุตร',
  ORDINATION: 'ลาบวช',
  EARLY_LEAVE: 'ออกก่อนเวลา',
  LATE_ARRIVAL: 'มาสาย',
  RUN_AN_ERRAND: 'ออกนอกเขตพระราชฐาน',
  OTHER: 'อื่นๆ',
};

/**
 * รูปแบบขั้นต่ำที่ต้องมีในการสร้างข้อความแจ้งเตือน - จงใจไม่ผูกกับ type `Leave`/`User`
 * เต็มรูปแบบจาก '@/types' เพราะผลลัพธ์จาก Prisma query มักเลือก field บางส่วนเท่านั้น
 */
interface LeaveNotificationPayload {
  type: string;
  startDate: Date;
  endDate: Date;
  user: { name?: string | null };
}

type LeaveStageEvent =
  | { kind: 'OPENED'; leave: LeaveNotificationPayload }
  | { kind: 'ADMIN_REVIEWED'; leave: LeaveNotificationPayload; approved: boolean }
  | { kind: 'SUPERVISOR_APPROVED'; leave: LeaveNotificationPayload; approved: boolean }
  | { kind: 'DIRECTOR_DECIDED'; leave: LeaveNotificationPayload; approved: boolean; breakGlass?: boolean };

function summarizeLeave(leave: LeaveNotificationPayload): string {
  const name = leave.user.name ?? 'ไม่ทราบชื่อ';
  const type = leaveTypeLabels[leave.type] ?? leave.type;
  const dateRange =
    formatDate(leave.startDate) === formatDate(leave.endDate)
      ? formatDate(leave.startDate)
      : `${formatDate(leave.startDate)} - ${formatDate(leave.endDate)}`;
  return `${name} (${type}) วันที่ ${dateRange}`;
}

function buildMessage(event: LeaveStageEvent): string {
  const summary = summarizeLeave(event.leave);

  switch (event.kind) {
    case 'OPENED':
      return `📋 มีคำขอลาใหม่: ${summary}\nรอธุรการตรวจสอบ`;

    case 'ADMIN_REVIEWED':
      return event.approved
        ? `✅ ธุรการตรวจสอบเรียบร้อยแล้ว: ${summary}\nรอหัวหน้างานเซ็นอนุมัติ`
        : `❌ ธุรการไม่อนุมัติคำขอลา: ${summary}\nจบกระบวนการ`;

    case 'SUPERVISOR_APPROVED':
      return event.approved
        ? `✅ หัวหน้างานอนุมัติแล้ว: ${summary}\nรอ ผอ.กอง พิจารณาต่อไป`
        : `❌ หัวหน้างานไม่อนุมัติคำขอลา: ${summary}\nจบกระบวนการ`;

    case 'DIRECTOR_DECIDED': {
      const base = event.approved
        ? `✅ ผอ.กองอนุมัติให้ลาเรียบร้อยแล้ว: ${summary}\nจบกระบวนการ`
        : `❌ ผอ.กองไม่อนุมัติให้ลา: ${summary}\nจบกระบวนการ`;
      return event.breakGlass
        ? `${base}\n(ดำเนินการผ่านสิทธิ์ผู้ดูแลระบบสูงสุด เนื่องจากผู้ยื่นเป็น ผอ.กอง ยื่นลาด้วยตนเอง)`
        : base;
    }
  }
}

/**
 * ส่งข้อความแจ้งเตือนความคืบหน้าคำขอลาเข้ากลุ่ม LINE
 * ฟังก์ชันนี้ไม่ throw (สืบทอดพฤติกรรมจาก sendLineGroupMessage) - ความล้มเหลวในการส่ง LINE
 * จะไม่ทำให้ request หลักล้มเหลวตามไปด้วย
 */
export async function notifyLeaveStage(event: LeaveStageEvent): Promise<boolean> {
  // แอดมินปิดฟีเจอร์การลา หรือปิดตัวเลือก "แจ้งขั้นตอนใบลา" → ไม่ส่ง (คืน false เหมือนส่งไม่สำเร็จ ไม่กระทบ request หลัก)
  const features = await getFeatureSettings();
  if (!isFeatureOn(features, 'leaves') || !isOptionOn(features, 'notifications', 'leaveNotifications')) return false;
  return sendLineGroupMessage(buildMessage(event));
}
