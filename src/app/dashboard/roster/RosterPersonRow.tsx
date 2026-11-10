/**
 * RosterPersonRow - การ์ดรายคนในตารางเวรประจำกอง (ชื่อ/สถิติ + งานที่ขยายดูได้)
 * ห่อด้วย React.memo: กดขยาย/ย่อแถวหนึ่ง หรือพิมพ์ค้นหา ไม่ทำให้ทุกแถวในกอง render ใหม่
 * ต้องส่ง callback ที่ stable (useCallback) จากหน้าหลัก
 */

'use client';

import React from 'react';
import { ChevronDown, ChevronRight, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { ROSTER_CATEGORY_LABELS } from '@/lib/roster';
import {
  CATEGORY_STYLES,
  dateRangeLabel,
  personLabel,
  timeLabel,
  type RosterAssignmentRow,
  type RosterPerson,
} from './rosterTypes';

interface RosterPersonRowProps {
  person: RosterPerson;
  isOpen: boolean;
  canManage: boolean;
  onToggle: (userId: number) => void;
  onAdd: (userId: number) => void;
  onEdit: (assignment: RosterAssignmentRow) => void;
  onDelete: (assignment: RosterAssignmentRow) => void;
}

function RosterPersonRow({ person: p, isOpen, canManage, onToggle, onAdd, onEdit, onDelete }: RosterPersonRowProps) {
  return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <button
            onClick={() => onToggle(p.id)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronDown size={18} className="text-slate-400 shrink-0" />
            ) : (
              <ChevronRight size={18} className="text-slate-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate">{personLabel(p)}</p>
              <p className="text-xs text-slate-500 truncate">
                {[p.position, p.positionSecond].filter(Boolean).join(' · ') || p.department || '-'}
              </p>
            </div>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                p.stats.count > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {p.stats.count} งาน · {p.stats.days} วัน
            </span>
            {canManage && (
              <button
                onClick={() => onAdd(p.id)}
                title="เพิ่มงานให้คนนี้"
                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-slate-100 bg-slate-50/50">
            {p.assignments.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">ไม่มีงานในช่วงนี้</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {p.assignments.map((a) => (
                  <li key={a.id} className="px-4 py-3 flex items-start gap-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${CATEGORY_STYLES[a.category]}`}
                    >
                      {ROSTER_CATEGORY_LABELS[a.category]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{a.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {dateRangeLabel(a)}
                        {timeLabel(a) ? ` · ${timeLabel(a)}` : ''}
                      </p>
                      {a.location && (
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <MapPin size={12} /> {a.location}
                        </p>
                      )}
                      {a.note && <p className="text-xs text-slate-400 mt-0.5">{a.note}</p>}
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => onEdit(a)}
                          title="แก้ไข"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-lg"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => onDelete(a)}
                          title="ลบ"
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-white rounded-lg"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
  );
}

export default React.memo(RosterPersonRow);
