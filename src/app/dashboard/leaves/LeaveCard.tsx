/**
 * ==================================================
 * LeaveCard - การ์ดรายการลาหนึ่งรายการในหน้าการลา
 * ==================================================
 * ห่อด้วย React.memo: พิมพ์ในช่องค้นหา/ฟอร์มของหน้าไม่ทำให้การ์ดทุกใบ (50+ ใบ) render ใหม่
 * เงื่อนไข: callback ที่ส่งเข้ามาต้อง stable (ดู cardActions ใน LeavesPageClient) และ props อื่นเป็นค่าพื้นฐาน/อ้างอิงเดิม
 */

'use client';

import React from 'react';
import { Calendar, Pencil, FileSpreadsheet, XCircle, CheckCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Leave, LeaveStatus, UserRole } from '@/types';
import { leaveTypeConfig, leaveStatusConfig, formatLeaveDate } from './leaveConfig';

interface LeaveCardProps {
  leave: Leave;
  /** จำนวนวันทำการ (หักวันหยุดแล้ว) ใช้แสดงเมื่อเป็นการลาเต็มวัน */
  workingDays: number;
  currentUserId: number;
  userRole: UserRole;
  isAdminRole: boolean;
  onEdit: (leave: Leave) => void;
  onPrint: (leave: Leave) => void;
  onUpdateStatus: (leaveId: number, status: LeaveStatus) => void;
  onDelete: (leaveId: number) => void;
}

function LeaveCard({
  leave,
  workingDays,
  currentUserId,
  userRole,
  isAdminRole,
  onEdit,
  onPrint,
  onUpdateStatus,
  onDelete,
}: LeaveCardProps) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* ข้อมูลการลา */}
        <div className="flex gap-4">
          {/* ไอคอนประเภทการลา */}
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-xl",
              leaveTypeConfig[leave.type].bg,
              leaveTypeConfig[leave.type].text
            )}
          >
            {leaveTypeConfig[leave.type].icon}
          </div>
          
          {/* รายละเอียด */}
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-bold text-slate-800">{leave.user.prefix}{leave.user.name}</h3>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-medium",
                  leaveStatusConfig[leave.status].bg,
                  leaveStatusConfig[leave.status].text
                )}
              >
                {leaveStatusConfig[leave.status].label}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-slate-500">
              <span className="font-medium text-slate-600">
                {leaveTypeConfig[leave.type].label}
              </span>
              <span className="hidden sm:inline">•</span>
              <div className="flex items-center gap-1">
                <Calendar size={14} />
                <span>
                  {formatLeaveDate(leave.startDate)} - {' '}
                  {formatLeaveDate(leave.endDate)}
                </span>
                <span className="text-slate-400">
                  ({leave.isHalfDay
                    ? 'ครึ่งวัน'
                    : leave.hours && leave.hours > 0
                      ? `${leave.hours} ชม.`
                      : `${workingDays} วันทำการ`})
                </span>
              </div>
              <span className="hidden sm:inline">•</span>
              <span className="italic text-slate-400">"{leave.reason}"</span>
            </div>
          </div>
        </div>

        {/* ปุ่มดำเนินการ */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(leave)}
            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
            title="แก้ไขรายละเอียด"
          >
            <Pencil size={18} />
          </button>
          <button
            onClick={() => onPrint(leave)}
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="พิมพ์แบบฟอร์ม"
          >
            <FileSpreadsheet size={20} />
          </button>
          {(() => {
            // ห้ามยื่นลาเอง-อนุมัติเอง ในทุกขั้นตอน (ยกเว้น break-glass ขั้นที่ 3 ด้านล่าง)
            const isSelfLeave = leave.userId === currentUserId;
            // ขั้นที่ 1: เฉพาะ ADMIN/SUPER_ADMIN (ธุรการ) เท่านั้น ไม่มี override ข้ามขั้น
            const canActAdminStage = leave.status === 'PENDING' && isAdminRole && !isSelfLeave;
            // ขั้นที่ 2: เฉพาะหัวหน้างานที่ถูกกำหนดไว้เท่านั้น ไม่มี fallback
            const isAssignedSupervisor = leave.user.supervisorId === currentUserId;
            const canActSupervisorStage =
              leave.status === 'ADMIN_REVIEWED' && isAssignedSupervisor && !isSelfLeave;
            // ขั้นที่ 3: เฉพาะ role DIRECTOR เท่านั้น + break-glass (SUPER_ADMIN อนุมัติแทนได้
            // เฉพาะกรณี ผอ.กอง ยื่นลาเองจนอนุมัติเองไม่ได้)
            const canActDirectorStage =
              leave.status === 'SUPERVISOR_APPROVED' &&
              ((userRole === 'DIRECTOR' && !isSelfLeave) ||
                (isSelfLeave && leave.user.role === 'DIRECTOR' && userRole === 'SUPER_ADMIN'));

            if (!canActAdminStage && !canActSupervisorStage && !canActDirectorStage) return null;
            return (
              <>
                <button
                  onClick={() => onUpdateStatus(leave.id, 'REJECTED')}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="ไม่อนุมัติ"
                >
                  <XCircle size={20} />
                </button>
                <button
                  onClick={() => onUpdateStatus(leave.id, 'APPROVED')}
                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="อนุมัติ"
                >
                  <CheckCircle size={20} />
                </button>
              </>
            );
          })()}
          <button
            onClick={() => onDelete(leave.id)}
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors ml-2"
            title="ลบ"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default React.memo(LeaveCard);
