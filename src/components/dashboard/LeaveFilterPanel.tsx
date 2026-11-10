/**
 * ==================================================
 * Dashboard — LeaveFilterPanel
 * ==================================================
 * แผงตัวกรองสำหรับกราฟ/ตารางสถิติการลา (controlled component)
 * ไม่ถือ state หรือ fetch logic เอง — parent เป็นผู้ควบคุมทั้งหมด
 */

'use client';

import React from 'react';
import { Filter, RefreshCw } from 'lucide-react';
import { leaveTypeConfig } from './leaveTypeConfig';

interface FiscalYearOption {
  label: string;
  value: number;
}

interface FiscalMonthOption {
  label: string;
  value: string;
}

interface LeaveFilterPanelProps {
  availableFiscalYears: FiscalYearOption[];
  fiscalMonthOptions: FiscalMonthOption[];
  selectedFiscalYear: string;
  selectedType: string;
  selectedMonth: string;
  customStartDate: string;
  customEndDate: string;
  isRefreshing: boolean;
  onFiscalYearChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onDateRangeSearch: () => void;
  onReset: () => void;
}

export default function LeaveFilterPanel({
  availableFiscalYears,
  fiscalMonthOptions,
  selectedFiscalYear,
  selectedType,
  selectedMonth,
  customStartDate,
  customEndDate,
  isRefreshing,
  onFiscalYearChange,
  onTypeChange,
  onMonthChange,
  onStartDateChange,
  onEndDateChange,
  onDateRangeSearch,
  onReset,
}: LeaveFilterPanelProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
      <Filter size={16} className="text-slate-400 mb-2 shrink-0" />

      {/* กลุ่ม 1: ปีงบประมาณ / ประเภทการลา / เดือน */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500 font-medium">ปีงบประมาณ</label>
          <select
            value={selectedFiscalYear}
            onChange={(e) => onFiscalYearChange(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">ปีปัจจุบัน</option>
            {availableFiscalYears?.map((fy) => (
              <option key={fy.value} value={fy.value.toString()}>
                {fy.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500 font-medium">ประเภทการลา</label>
          <select
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">ทั้งหมด</option>
            {Object.entries(leaveTypeConfig).map(([type, cfg]) => (
              <option key={type} value={type}>{cfg.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500 font-medium">เดือน</label>
          <select
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">ทั้งปีงบประมาณ</option>
            {fiscalMonthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* กลุ่ม 2: ช่วงวันที่ (แบบแถบเดียว) */}
      <div className="flex flex-wrap items-end gap-1.5">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500 font-medium">ช่วงเวลา (เริ่มต้น)</label>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-slate-400 text-sm mb-2">ถึง</span>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500 font-medium">ช่วงเวลา (สิ้นสุด)</label>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={onDateRangeSearch}
          disabled={!customStartDate || !customEndDate || isRefreshing}
          className="text-sm px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          ค้นหา
        </button>
      </div>

      {/* ปุ่มรีเซ็ต */}
      <button
        onClick={onReset}
        disabled={isRefreshing}
        className="text-sm px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
      >
        <RefreshCw size={14} />
        รีเซ็ต
      </button>
    </div>
  );
}
