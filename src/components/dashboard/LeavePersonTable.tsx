/**
 * ==================================================
 * Dashboard — LeavePersonTable
 * ==================================================
 * ตารางสรุปการลารายบุคคล
 */

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { leaveTypeConfig, fmtDays } from './leaveTypeConfig';
import { LeaveRecord, UserSummary } from './types';

interface LeavePersonTableProps {
  userTableData: UserSummary[];
  filteredLeaves: LeaveRecord[];
  selectedMonth: string;
}

export default function LeavePersonTable({
  userTableData,
  filteredLeaves,
  selectedMonth,
}: LeavePersonTableProps) {
  if (userTableData.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-3 px-4 font-semibold text-slate-600">ชื่อ</th>
            <th className="text-left py-3 px-4 font-semibold text-slate-600">หน่วยงาน</th>
            {Object.entries(leaveTypeConfig).map(([type, cfg]) => {
              const hasData = userTableData.some(
                (u) => u.byType[type] && u.byType[type].count > 0,
              );
              if (!hasData) return null;
              return (
                <th key={type} className="text-center py-3 px-3 font-semibold text-slate-600">
                  <span className="flex items-center justify-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: leaveTypeConfig[type].color }}
                    />
                    {cfg.label}
                  </span>
                </th>
              );
            })}
            <th className="text-center py-3 px-4 font-semibold text-slate-600">รวม (ครั้ง)</th>
            <th className="text-center py-3 px-4 font-semibold text-slate-600">รวม (วัน)</th>
          </tr>
        </thead>
        <tbody>
          {userTableData.map((u, idx) => {
            // ถ้าเลือกเดือน ให้กรองข้อมูลเฉพาะเดือนนั้น
            let displayData = u;
            if (selectedMonth !== 'ALL') {
              const [mIdx, yr] = selectedMonth.split('-').map(Number);
              const monthLeaves = filteredLeaves.filter(
                (l) => l.userId === u.userId && l.month === mIdx && l.year === yr,
              );
              if (monthLeaves.length === 0) return null;

              const byType: Record<string, { count: number; days: number }> = {};
              for (const l of monthLeaves) {
                if (!byType[l.type]) byType[l.type] = { count: 0, days: 0 };
                byType[l.type].count++;
                byType[l.type].days += l.days;
              }
              displayData = {
                ...u,
                byType,
                totalCount: monthLeaves.length,
                totalDays: Math.round(monthLeaves.reduce((s, l) => s + l.days, 0) * 100) / 100,
              };
            }

            return (
              <tr
                key={u.userId}
                className={cn(
                  'border-b border-slate-100 hover:bg-slate-50 transition-colors',
                  idx % 2 === 0 ? 'bg-white' : 'bg-slate-25',
                )}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                      {u.avatar || u.userName.charAt(0)}
                    </div>
                    <span className="font-medium text-slate-800">{u.userName}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-500">{u.department || '-'}</td>
                {Object.entries(leaveTypeConfig).map(([type]) => {
                  const hasData = userTableData.some(
                    (uu) => uu.byType[type] && uu.byType[type].count > 0,
                  );
                  if (!hasData) return null;
                  const typeData = displayData.byType[type];
                  return (
                    <td key={type} className="text-center py-3 px-3 text-slate-600">
                      {typeData && typeData.count > 0
                        ? `${typeData.count}/${fmtDays(typeData.days)}`
                        : '-'}
                    </td>
                  );
                })}
                <td className="text-center py-3 px-4 font-semibold text-slate-700">
                  {displayData.totalCount}
                </td>
                <td className="text-center py-3 px-4 font-semibold text-indigo-600">
                  {fmtDays(displayData.totalDays)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
