/**
 * ==================================================
 * Dashboard — RosterSummaryWidget
 * ==================================================
 * สรุปตารางเวรประจำกอง: สถิติเดือนนี้ + คนที่มีงานวันนี้ + งานที่จะถึงใน 7 วัน
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { ROSTER_CATEGORY_LABELS, ROSTER_CATEGORIES, type RosterCategoryKey } from '@/lib/roster';

export interface RosterSummaryUser {
  id: number;
  prefix: string | null;
  name: string;
  position: string | null;
}

export interface RosterSummaryItem {
  id: number;
  title: string;
  category: RosterCategoryKey;
  location: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  user: RosterSummaryUser;
}

export interface RosterSummaryData {
  monthTotal: number;
  monthDays: number;
  peopleInvolved: number;
  byCategory: Record<RosterCategoryKey, number>;
  outToday: RosterSummaryItem[];
  upcoming: RosterSummaryItem[];
  topPeople: { user: RosterSummaryUser; count: number; days: number }[];
}

function personName(u: RosterSummaryUser) {
  return `${u.prefix ?? ''}${u.name}`;
}

function timeLabel(it: RosterSummaryItem) {
  return it.startTime ? ` ${it.startTime}${it.endTime ? `–${it.endTime}` : ''} น.` : '';
}

export default function RosterSummaryWidget({ data }: { data: RosterSummaryData | null }) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">ตารางเวรประจำกอง</h2>
        <button
          onClick={() => router.push('/dashboard/roster')}
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
        >
          ดูทั้งหมด <ChevronRight size={14} />
        </button>
      </div>

      {!data ? (
        <div className="text-center py-6">
          <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">ไม่สามารถโหลดข้อมูลตารางเวรได้</p>
        </div>
      ) : (
        <>
          <div className="flex gap-3 mb-4">
            <div className="flex-1 rounded-lg bg-indigo-50 px-3 py-2">
              <p className="text-xs text-indigo-700">งานเดือนนี้</p>
              <p className="text-lg font-bold text-indigo-800">{data.monthTotal}</p>
            </div>
            <div className="flex-1 rounded-lg bg-emerald-50 px-3 py-2">
              <p className="text-xs text-emerald-700">รวมวัน-คน</p>
              <p className="text-lg font-bold text-emerald-800">{data.monthDays}</p>
            </div>
            <div className="flex-1 rounded-lg bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-700">ผู้ปฏิบัติงาน</p>
              <p className="text-lg font-bold text-amber-800">{data.peopleInvolved}</p>
            </div>
          </div>

          {data.monthTotal > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {ROSTER_CATEGORIES.filter((c) => data.byCategory[c] > 0).map((c) => (
                <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {ROSTER_CATEGORY_LABELS[c]} {data.byCategory[c]}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm font-semibold text-slate-700 mb-2">
            วันนี้{data.outToday.length > 0 ? ` (${data.outToday.length})` : ''}
          </p>
          {data.outToday.length === 0 ? (
            <p className="text-slate-400 text-sm mb-4">ไม่มีงานในตารางเวรวันนี้</p>
          ) : (
            <ul className="divide-y divide-slate-100 mb-4">
              {data.outToday.slice(0, 6).map((it) => (
                <li key={it.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{personName(it.user)}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {it.title}
                      {it.location ? ` · ${it.location}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-indigo-600 font-medium shrink-0">
                    {ROSTER_CATEGORY_LABELS[it.category]}
                    {timeLabel(it)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-sm font-semibold text-slate-700 mb-2">7 วันข้างหน้า</p>
          {data.upcoming.length === 0 ? (
            <p className="text-slate-400 text-sm">ไม่มีงานที่จะถึงใน 7 วันนี้</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcoming.slice(0, 5).map((it) => (
                <li key={it.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{personName(it.user)}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {it.title}
                      {it.location ? ` · ${it.location}` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{formatDate(it.startDate)}</span>
                </li>
              ))}
            </ul>
          )}

          {data.topPeople.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-sm font-semibold text-slate-700 mb-2">ปฏิบัติงานมากสุดเดือนนี้</p>
              <ul className="space-y-1">
                {data.topPeople.map((p) => (
                  <li key={p.user.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate">{personName(p.user)}</span>
                    <span className="text-slate-500 shrink-0">
                      {p.count} งาน · {p.days} วัน
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
