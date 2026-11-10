/**
 * ==================================================
 * Dashboard Page - หน้าแดชบอร์ดหลัก
 * ==================================================
 * ภาพรวมทั้งระบบในหน้าเดียว — พนักงาน, การลา, งาน, พัสดุ, ครุภัณฑ์
 */

'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Users, Calendar, Clock, Package, AlertTriangle, Loader2 } from 'lucide-react';
import {
  DashboardStats,
  RecentPendingLeaveSummary,
  RecentTaskSummary,
  LowStockSupplySummary,
  OverdueCheckoutSummary,
} from '@/types';
import { LeaveRecord, UserSummary, LeaveStatsData } from '@/components/dashboard/types';
import { leaveTypeConfig } from '@/components/dashboard/leaveTypeConfig';
import StatCard from '@/components/dashboard/StatCard';
import { useFeatures } from '@/contexts/FeaturesContext';
import type { FeatureId } from '@/lib/features';
import LeaveFilterPanel from '@/components/dashboard/LeaveFilterPanel';
import LeavePersonTable from '@/components/dashboard/LeavePersonTable';
import PendingApprovalsList from '@/components/dashboard/PendingApprovalsList';
import RecentTasksList from '@/components/dashboard/RecentTasksList';
import LowStockSuppliesWidget from '@/components/dashboard/LowStockSuppliesWidget';
import AssetStatusWidget from '@/components/dashboard/AssetStatusWidget';
import RosterSummaryWidget, { type RosterSummaryData } from '@/components/dashboard/RosterSummaryWidget';

/**
 * โหลด LeaveChart (recharts) แบบ lazy — ไม่ต้องอยู่ใน bundle หลักของหน้า dashboard
 */
const LeaveChart = dynamic(() => import('@/components/dashboard/LeaveChart'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
    </div>
  ),
});

/**
 * ข้อมูลสถิติเริ่มต้น
 */
const defaultStats: DashboardStats = {
  totalUsers: 0,
  activeUsers: 0,
  pendingLeaves: 0,
  totalLeaves: 0,
  inProgressTasks: 0,
  doneTasks: 0,
  totalTasks: 0,
};

/**
 * หน้าแดชบอร์ดหลัก
 */
export default function DashboardPageClient() {
  // ฟีเจอร์ที่แอดมินปิดไว้ — ไม่เรียก API และไม่แสดงวิดเจ็ตของฟีเจอร์นั้น
  const { isEnabled } = useFeatures();
  const leavesOn = isEnabled('leaves');
  const rosterOn = isEnabled('roster');
  const tasksOn = isEnabled('tasks');
  const suppliesOn = isEnabled('supplies');
  const assetsOn = isEnabled('assets');
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [leaveStats, setLeaveStats] = useState<LeaveStatsData | null>(null);
  const [recentPendingLeaves, setRecentPendingLeaves] = useState<RecentPendingLeaveSummary[]>([]);
  const [recentTasks, setRecentTasks] = useState<RecentTaskSummary[]>([]);
  const [lowStockSupplies, setLowStockSupplies] = useState<LowStockSupplySummary[]>([]);
  const [overdueCheckouts, setOverdueCheckouts] = useState<OverdueCheckoutSummary[]>([]);
  const [rosterSummary, setRosterSummary] = useState<RosterSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ตัวกรอง
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>(''); // '' = ปีปัจจุบัน
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  /**
   * ดึงข้อมูลสถิติการลาจาก API (รองรับ filters)
   */
  // ยกเลิกคำขอสถิติการลาที่ค้างอยู่เมื่อมีคำขอใหม่ (เปลี่ยนตัวกรองรัวๆ) — กันคำตอบเก่าที่มาช้ากว่าไปเขียนทับผลใหม่
  const leaveStatsAbortRef = useRef<AbortController | null>(null);

  const fetchLeaveStats = useCallback(async (options?: {
    fiscalYear?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    leaveStatsAbortRef.current?.abort();
    const controller = new AbortController();
    leaveStatsAbortRef.current = controller;
    try {
      const params = new URLSearchParams();
      const fy = options?.fiscalYear !== undefined ? options.fiscalYear : selectedFiscalYear;
      const tp = options?.type !== undefined ? options.type : selectedType;
      const sd = options?.startDate !== undefined ? options.startDate : customStartDate;
      const ed = options?.endDate !== undefined ? options.endDate : customEndDate;

      if (fy) params.set('fiscalYear', fy);
      if (tp && tp !== 'ALL') params.set('type', tp);
      if (sd) params.set('startDate', sd);
      if (ed) params.set('endDate', ed);

      const qs = params.toString();
      const url = `/api/dashboard/leave-stats${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();

      if (data.success && !controller.signal.aborted) {
        setLeaveStats(data.data);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // ถูกแทนที่ด้วยคำขอใหม่ ไม่ใช่ข้อผิดพลาด
      console.error('Failed to fetch leave stats', err);
    }
  }, [selectedFiscalYear, selectedType, customStartDate, customEndDate]);

  /**
   * ดึงสรุปตารางเวรประจำกอง (แยกจาก /api/dashboard — ถ้าล้มเหลวไม่กระทบส่วนอื่นของแดชบอร์ด)
   */
  useEffect(() => {
    if (!rosterOn) return;
    fetch('/api/roster/summary')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setRosterSummary(data.data);
      })
      .catch((err) => console.error('Failed to fetch roster summary', err));
  }, [rosterOn]);

  /**
   * ดึงข้อมูลสถิติจาก API (ครั้งแรก)
   */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashRes, leaveRes] = await Promise.all([
          fetch('/api/dashboard'),
          leavesOn ? fetch('/api/dashboard/leave-stats') : Promise.resolve(null),
        ]);

        const dashData = await dashRes.json();
        const leaveData = leaveRes ? await leaveRes.json() : { success: false };

        if (!dashRes.ok) {
          if (dashRes.status === 401) {
            router.push('/');
            return;
          }
          throw new Error(dashData.message || 'ไม่สามารถดึงข้อมูลได้');
        }

        if (dashData.success) {
          setStats(dashData.data.stats);
          setRecentPendingLeaves(dashData.data.recentPendingLeaves || []);
          setRecentTasks(dashData.data.recentTasks || []);
          setLowStockSupplies(dashData.data.lowStockSupplies || []);
          setOverdueCheckouts(dashData.data.overdueCheckouts || []);
        }

        if (leaveData.success) {
          setLeaveStats(leaveData.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [router, leavesOn]);

  /**
   * จัดการเมื่อเปลี่ยนปีงบประมาณ
   */
  const handleFiscalYearChange = async (value: string) => {
    setSelectedFiscalYear(value);
    setSelectedMonth('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
    setIsRefreshing(true);
    await fetchLeaveStats({ fiscalYear: value, type: selectedType, startDate: '', endDate: '' });
    setIsRefreshing(false);
  };

  /**
   * จัดการเมื่อเปลี่ยนประเภทการลา
   */
  const handleTypeChange = async (value: string) => {
    setSelectedType(value);
    setIsRefreshing(true);
    await fetchLeaveStats({ type: value });
    setIsRefreshing(false);
  };

  /**
   * จัดการเมื่อกดค้นหาช่วงวันที่
   */
  const handleDateRangeSearch = async () => {
    if (!customStartDate || !customEndDate) return;
    setSelectedMonth('ALL');
    setIsRefreshing(true);
    await fetchLeaveStats({ startDate: customStartDate, endDate: customEndDate });
    setIsRefreshing(false);
  };

  /**
   * รีเซ็ตตัวกรองทั้งหมด
   */
  const handleResetFilters = async () => {
    setSelectedFiscalYear('');
    setSelectedType('ALL');
    setSelectedMonth('ALL');
    setCustomStartDate('');
    setCustomEndDate('');
    setIsRefreshing(true);
    await fetchLeaveStats({ fiscalYear: '', type: 'ALL', startDate: '', endDate: '' });
    setIsRefreshing(false);
  };

  /**
   * กรองข้อมูลการลาตามเดือน
   */
  const filteredLeaves = useMemo<LeaveRecord[]>(() => {
    if (!leaveStats) return [];
    let leaves = leaveStats.leaves;

    if (selectedMonth !== 'ALL') {
      const [mIdx, yr] = selectedMonth.split('-').map(Number);
      leaves = leaves.filter((l) => l.month === mIdx && l.year === yr);
    }

    return leaves;
  }, [leaveStats, selectedMonth]);

  /**
   * สร้างข้อมูลกราฟ "รายบุคคล" — X-axis = ชื่อคน, แท่งแยกตามประเภทลา (grouped)
   */
  const chartDataByPerson = useMemo(() => {
    if (!leaveStats) return [];

    let relevantLeaves = leaveStats.leaves;
    if (selectedMonth !== 'ALL') {
      const [mIdx, yr] = selectedMonth.split('-').map(Number);
      relevantLeaves = relevantLeaves.filter((l) => l.month === mIdx && l.year === yr);
    }

    const userIds = Array.from(new Set(relevantLeaves.map((l) => l.userId)));

    return userIds.map((userId) => {
      const user = leaveStats.users.find((u) => u.userId === userId);
      const userLeaves = relevantLeaves.filter((l) => l.userId === userId);
      const row: Record<string, any> = { name: user?.userName || `User ${userId}` };

      for (const type of Object.keys(leaveTypeConfig)) {
        const typeLeaves = userLeaves.filter((l) => l.type === type);
        if (typeLeaves.length > 0) {
          const days = typeLeaves.reduce((s, l) => s + l.days, 0);
          row[type] = Math.round(days * 100) / 100;
        }
      }

      return row;
    });
  }, [leaveStats, selectedMonth]);

  /**
   * สร้างตารางสรุปรายคน (เฉพาะคนที่มีการลา)
   */
  const userTableData = useMemo<UserSummary[]>(() => {
    if (!leaveStats) return [];

    return leaveStats.userSummaries
      .filter((u) => u.totalCount > 0)
      .map((u) => ({ ...u, totalDays: Math.round(u.totalDays * 100) / 100 }))
      .sort((a, b) => b.totalDays - a.totalDays);
  }, [leaveStats]);

  // fiscal months สำหรับ dropdown
  const fiscalMonthOptions = useMemo(() => {
    if (!leaveStats) return [];
    return leaveStats.chartData.map((fm) => ({
      label: fm.month as string,
      value: `${fm.monthIndex}-${fm.year}`,
    }));
  }, [leaveStats]);

  // ประเภทลาที่มีข้อมูลจริง (สำหรับแสดงแท่งในกราฟ)
  const activeLeaveTypes = useMemo(() => {
    if (!leaveStats) return [];
    return Object.keys(leaveTypeConfig).filter((type) =>
      leaveStats.leaves.some((l) => l.type === type),
    );
  }, [leaveStats]);

  // แสดง loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // ข้อมูลการ์ดสถิติ
  const allStatCards = [
    {
      feature: null as FeatureId | null,
      title: 'พนักงานทั้งหมด',
      value: stats.totalUsers,
      subtext: `${stats.activeUsers} คนกำลังใช้งาน`,
      icon: Users,
      borderColor: 'border-indigo-500',
      bgColor: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
      href: '/dashboard/employees',
    },
    {
      feature: 'leaves' as FeatureId | null,
      title: 'คำขอลา (รออนุมัติ)',
      value: stats.pendingLeaves,
      subtext: `จากทั้งหมด ${stats.totalLeaves} รายการ`,
      icon: Calendar,
      borderColor: 'border-amber-500',
      bgColor: 'bg-amber-50',
      iconColor: 'text-amber-600',
      href: '/dashboard/leaves',
    },
    {
      feature: 'tasks' as FeatureId | null,
      title: 'งานทั้งหมด',
      value: stats.totalTasks,
      subtext: 'Projects On-going',
      icon: Clock,
      borderColor: 'border-blue-500',
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600',
      href: '/dashboard/tasks',
    },
    {
      feature: 'supplies' as FeatureId | null,
      title: 'พัสดุใกล้หมด',
      value: stats.lowStockCount ?? 0,
      subtext: 'ต้องเติมสต็อก',
      icon: Package,
      borderColor: 'border-rose-500',
      bgColor: 'bg-rose-50',
      iconColor: 'text-rose-600',
      href: '/dashboard/supplies',
    },
    {
      feature: 'assets' as FeatureId | null,
      title: 'ครุภัณฑ์เกินกำหนดคืน',
      value: stats.overdueCheckoutsCount ?? 0,
      subtext: 'รอติดตามคืน',
      icon: AlertTriangle,
      borderColor: 'border-orange-500',
      bgColor: 'bg-orange-50',
      iconColor: 'text-orange-600',
      href: '/dashboard/assets',
    },
  ];
  // การ์ดของฟีเจอร์ที่ปิดไม่แสดง
  const statCards = allStatCards
    .filter((c) => !c.feature || isEnabled(c.feature))
    .map(({ feature: _feature, ...card }) => card);

  return (
    <div className="space-y-6">
      {/* หัวข้อหน้า */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">แดชบอร์ด</h1>
        <p className="text-slate-500 mt-1">
          ภาพรวมของระบบจัดการพนักงาน
          {leaveStats && (
            <span className="ml-2 text-indigo-600 font-medium">
              ปีงบประมาณ {leaveStats.fiscalYear}
            </span>
          )}
        </p>
      </div>

      {/* แสดงข้อผิดพลาด */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
          <p className="text-rose-600">{error}</p>
        </div>
      )}

      {/* การ์ดสถิติ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {statCards.map((card, index) => (
          <StatCard key={index} {...card} />
        ))}
      </div>

      {/* กราฟสถิติการลา — แท่งแยกตามประเภทลาต่อคน (grouped) */}
      {leaveStats && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                สถิติการลาในปีงบประมาณ {leaveStats.fiscalYear}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                แสดงจำนวนวันลา (วันทำการ) แยกรายบุคคล — แสดงเฉพาะคนที่มีการลา
              </p>
            </div>
            {isRefreshing && (
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            )}
          </div>

          {/* Filters */}
          <LeaveFilterPanel
            availableFiscalYears={leaveStats.availableFiscalYears}
            fiscalMonthOptions={fiscalMonthOptions}
            selectedFiscalYear={selectedFiscalYear}
            selectedType={selectedType}
            selectedMonth={selectedMonth}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            isRefreshing={isRefreshing}
            onFiscalYearChange={handleFiscalYearChange}
            onTypeChange={handleTypeChange}
            onMonthChange={setSelectedMonth}
            onStartDateChange={setCustomStartDate}
            onEndDateChange={setCustomEndDate}
            onDateRangeSearch={handleDateRangeSearch}
            onReset={handleResetFilters}
          />

          <LeaveChart chartData={chartDataByPerson} activeLeaveTypes={activeLeaveTypes} />
        </div>
      )}

      {/* ตารางสรุปรายคน */}
      {leaveStats && userTableData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">
            สรุปการลารายบุคคล
          </h2>
          <LeavePersonTable
            userTableData={userTableData}
            filteredLeaves={filteredLeaves}
            selectedMonth={selectedMonth}
          />
        </div>
      )}

      {/* ไม่มีข้อมูลการลา */}
      {leaveStats && chartDataByPerson.length === 0 && !isLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">ไม่มีข้อมูลการลาในปีงบประมาณนี้</p>
        </div>
      )}

      {/* คำขอลารออนุมัติ + งานล่าสุด */}
      {(leavesOn || tasksOn) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {leavesOn && <PendingApprovalsList leaves={recentPendingLeaves} />}
          {tasksOn && <RecentTasksList tasks={recentTasks} tasksByColumn={stats.tasksByColumn || []} />}
        </div>
      )}

      {/* ตารางเวรประจำกอง */}
      {rosterOn && <RosterSummaryWidget data={rosterSummary} />}

      {/* พัสดุใกล้หมด + ครุภัณฑ์ */}
      {(suppliesOn || assetsOn) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {suppliesOn && (
            <LowStockSuppliesWidget
              supplies={lowStockSupplies}
              totalLowStockCount={stats.lowStockCount ?? 0}
            />
          )}
          {assetsOn && (
            <AssetStatusWidget
              assetsInUse={stats.assetsInUse ?? 0}
              assetsInRepair={stats.assetsInRepair ?? 0}
              overdueCheckouts={overdueCheckouts}
              overdueCount={stats.overdueCheckoutsCount ?? 0}
            />
          )}
        </div>
      )}
    </div>
  );
}
