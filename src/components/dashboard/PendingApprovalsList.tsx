/**
 * ==================================================
 * Dashboard — PendingApprovalsList
 * ==================================================
 * รายการคำขอลารออนุมัติล่าสุด
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { leaveTypeConfig } from './leaveTypeConfig';
import { RecentPendingLeaveSummary } from '@/types';

interface PendingApprovalsListProps {
  leaves: RecentPendingLeaveSummary[];
}

export default function PendingApprovalsList({ leaves }: PendingApprovalsListProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">คำขอลารออนุมัติล่าสุด</h2>
        <button
          onClick={() => router.push('/dashboard/leaves')}
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
        >
          ดูทั้งหมด <ChevronRight size={14} />
        </button>
      </div>

      {leaves.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">ไม่มีคำขอรออนุมัติ</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {leaves.map((leave) => {
            const cfg = leaveTypeConfig[leave.type];
            return (
              <li key={leave.id} className="py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                  {leave.user.avatar || leave.user.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{leave.user.name}</p>
                  <p className="text-xs text-slate-500">
                    {cfg?.label || leave.type} · {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
