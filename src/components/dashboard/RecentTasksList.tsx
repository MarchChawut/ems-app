/**
 * ==================================================
 * Dashboard — RecentTasksList
 * ==================================================
 * สรุปงานตามคอลัมน์ + รายการงานล่าสุด
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { RecentTaskSummary } from '@/types';

interface RecentTasksListProps {
  tasks: RecentTaskSummary[];
  tasksByColumn: { columnId: number; columnName: string; count: number }[];
}

export default function RecentTasksList({ tasks, tasksByColumn }: RecentTasksListProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">งานล่าสุด</h2>
        <button
          onClick={() => router.push('/dashboard/tasks')}
          className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5"
        >
          ดูทั้งหมด <ChevronRight size={14} />
        </button>
      </div>

      {tasksByColumn.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {tasksByColumn.map((col) => (
            <span
              key={col.columnId}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium"
            >
              {col.columnName}: {col.count}
            </span>
          ))}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-8">
          <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">ยังไม่มีงาน</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {tasks.map((task) => (
            <li key={task.id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                <p className="text-xs text-slate-500">
                  {task.column?.name || '-'}
                  {task.assignee ? ` · ${task.assignee.name}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
