/**
 * ==================================================
 * Dashboard — AssetStatusWidget
 * ==================================================
 * สรุปสถานะครุภัณฑ์ + รายการเกินกำหนดคืน
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, ChevronRight, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { OverdueCheckoutSummary } from '@/types';

interface AssetStatusWidgetProps {
  assetsInUse: number;
  assetsInRepair: number;
  overdueCheckouts: OverdueCheckoutSummary[];
  overdueCount: number;
}

export default function AssetStatusWidget({
  assetsInUse,
  assetsInRepair,
  overdueCheckouts,
  overdueCount,
}: AssetStatusWidgetProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">ครุภัณฑ์</h2>
        <button
          onClick={() => router.push('/dashboard/assets')}
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
        >
          ดูทั้งหมด <ChevronRight size={14} />
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="flex-1 rounded-lg bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">ถูกใช้งาน</p>
          <p className="text-lg font-bold text-blue-800">{assetsInUse}</p>
        </div>
        <div className="flex-1 rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-700">ส่งซ่อม</p>
          <p className="text-lg font-bold text-amber-800">{assetsInRepair}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <AlertTriangle size={14} className="text-rose-500" />
        <p className="text-sm font-semibold text-slate-700">
          เกินกำหนดคืน{overdueCount > 0 ? ` (${overdueCount})` : ''}
        </p>
      </div>

      {overdueCheckouts.length === 0 ? (
        <div className="text-center py-6">
          <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">ไม่มีรายการเกินกำหนดคืน</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {overdueCheckouts.map((c) => (
            <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{c.asset.name}</p>
                <p className="text-xs text-slate-500 truncate">{c.holder.name}</p>
              </div>
              <span className="text-xs text-rose-600 font-semibold shrink-0">
                {formatDate(c.expectedReturnAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
