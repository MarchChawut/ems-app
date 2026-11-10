/**
 * ==================================================
 * Dashboard — LowStockSuppliesWidget
 * ==================================================
 * รายการพัสดุใกล้หมด
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight } from 'lucide-react';
import { LowStockSupplySummary } from '@/types';

interface LowStockSuppliesWidgetProps {
  supplies: LowStockSupplySummary[];
  totalLowStockCount: number;
}

export default function LowStockSuppliesWidget({
  supplies,
  totalLowStockCount,
}: LowStockSuppliesWidgetProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">
          พัสดุใกล้หมด
          {totalLowStockCount > 0 && (
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
              {totalLowStockCount}
            </span>
          )}
        </h2>
        <button
          onClick={() => router.push('/dashboard/supplies')}
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
        >
          ดูทั้งหมด <ChevronRight size={14} />
        </button>
      </div>

      {supplies.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">พัสดุคงเหลือในเกณฑ์ปกติ</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {supplies.map((s) => (
            <li key={s.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{s.name}</p>
                <p className="text-xs text-slate-500">{s.category?.name || 'ไม่มีหมวดหมู่'}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-rose-50 text-rose-600 font-semibold shrink-0">
                {s.currentQuantity}/{s.minimumQuantity} {s.unit || ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
