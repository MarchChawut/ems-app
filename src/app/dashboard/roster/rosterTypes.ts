/**
 * ตารางเวรประจำกอง — ชนิดข้อมูลและตัวช่วยแสดงผลที่ใช้ร่วมกันระหว่างหน้า (RosterPageClient) และแถวรายคน (RosterPersonRow)
 */

import { formatDate } from '@/lib/utils';
import { type RosterCategoryKey } from '@/lib/roster';

export interface RosterAssignmentRow {
  id: number;
  userId: number;
  title: string;
  category: RosterCategoryKey;
  location: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
}

export interface RosterPerson {
  id: number;
  prefix: string | null;
  name: string;
  position: string | null;
  positionSecond: string | null;
  department: string | null;
  assignments: RosterAssignmentRow[];
  stats: { count: number; days: number; byCategory: Record<RosterCategoryKey, number> };
}

export interface RosterSummary {
  totalAssignments: number;
  totalDays: number;
  byCategory: Record<RosterCategoryKey, number>;
  peopleInvolved: number;
  totalPeople: number;
}

export const CATEGORY_STYLES: Record<RosterCategoryKey, string> = {
  DUTY: 'bg-rose-100 text-rose-700',
  OFFICIAL_TRIP: 'bg-sky-100 text-sky-700',
  MEETING: 'bg-violet-100 text-violet-700',
  TRAINING: 'bg-amber-100 text-amber-700',
  EVENT: 'bg-emerald-100 text-emerald-700',
  OTHER: 'bg-slate-100 text-slate-600',
};

export function personLabel(p: { prefix: string | null; name: string }) {
  return `${p.prefix ?? ''}${p.name}`;
}

export function dateRangeLabel(a: RosterAssignmentRow) {
  const start = formatDate(a.startDate);
  const same = a.startDate.slice(0, 10) === a.endDate.slice(0, 10);
  return same ? start : `${start} – ${formatDate(a.endDate)}`;
}

export function timeLabel(a: RosterAssignmentRow) {
  if (!a.startTime) return '';
  return `${a.startTime}${a.endTime ? ` – ${a.endTime}` : ''} น.`;
}

