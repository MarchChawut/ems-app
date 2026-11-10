/**
 * ==================================================
 * Leaves Page - หน้าบันทึกการลา (อัปเดตเวอร์ชันใหม่)
 * ==================================================
 * เพิ่มฟีเจอร์:
 * - Dashboard สถิติรายบุคคล
 * - ค้นหาด้วยชื่อหรือวันที่
 * - เลือกชื่อผู้ขอลาได้
 * - Export ข้อมูลการลา
 */

'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Calendar,
  X,
  Search,
  Users,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Leave, LeaveType, LeaveStatus, LeaveFormCategory, User, Holiday, SignaturePlacement } from '@/types';
import { useCurrentUser } from '@/contexts/UserContext';
import { useFeatures } from '@/contexts/FeaturesContext';
import { allowedModesFor, coerceMode } from '@/lib/leave-modes';
import { LeaveTab, LEAVE_TAB_LABELS, resolveLeaveTab } from '@/lib/leave-tabs';
import { getFiscalYearRange } from '@/lib/leave-calc';
import LeaveCard from './LeaveCard';
import {
  TIME_RANGE_TYPES,
  LEAVES_PAGE_SIZE,
} from './leaveConfig';

/** loading fallback ร่วมของฟอร์มลา/มาสาย/ออกก่อนเวลาที่โหลดแบบ lazy ด้านล่าง */
const formLoadingFallback = () => (
  <div className="flex items-center justify-center p-12">
    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
  </div>
);

/**
 * โหลดฟอร์มลา/มาสาย/ออกก่อนเวลาแบบ lazy — แสดงเฉพาะใน modal จึงไม่ต้องอยู่ใน bundle หลักของหน้า
 */
const LeaveForm = dynamic(() => import('@/components/leaves/LeaveForm'), {
  ssr: false,
  loading: formLoadingFallback,
});
const LateArrivalForm = dynamic(() => import('@/components/leaves/LateArrivalForm'), {
  ssr: false,
  loading: formLoadingFallback,
});
const EarlyLeaveForm = dynamic(() => import('@/components/leaves/EarlyLeaveForm'), {
  ssr: false,
  loading: formLoadingFallback,
});

const LEAVE_TABS: LeaveTab[] = ['KBK', 'STATS', 'LATE_ARRIVAL', 'EARLY_LEAVE'];

// ตัวเลือกชั่วโมง/นาทีสำหรับ TimeHourMinuteSelect (00-23 / 00-59)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/**
 * เลือกเวลา (HH:mm) ด้วย select ชั่วโมง/นาที แทน input type="time"
 * เพื่อเลี่ยงปัญหาความไม่สม่ำเสมอของ native time picker ข้ามเบราว์เซอร์ (พิมพ์เวลาไม่ได้/ไม่มี picker ให้เลือกใน Safari)
 * ประกาศนอก LeavesPage เพื่อไม่ให้ถูกสร้างใหม่ทุกครั้งที่ re-render (ซึ่งจะทำให้ input ถูก remount และเสีย focus)
 */
function TimeHourMinuteSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hour, minute] = value ? value.split(':') : ['', ''];

  return (
    <div className="flex items-center gap-1">
      <select
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute || '00'}`)}
        className="border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="" disabled>ชม.</option>
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-slate-400">:</span>
      <select
        value={minute}
        onChange={(e) => onChange(`${hour || '00'}:${e.target.value}`)}
        className="border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="" disabled>นาที</option>
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * ข้อมูลสถิติรายบุคคล
 */
interface UserLeaveStats {
  user: User;
  stats: {
    totalLeaves: number;
    sickDays: number;
    personalDays: number;
    pending: number;
    approved: number;
    rejected: number;
    totalDays: number;
  };
}

/**
 * หน้าบันทึกการลา
 */
export default function LeavesPageClient() {
  const router = useRouter();
  const { id: currentUserId, name: currentUserName, role: userRole } = useCurrentUser();
  // ค่าเริ่มต้น/ตัวเลือกจากหน้าตั้งค่า > ฟีเจอร์ของระบบ: เวลาเข้างานของใบมาสาย และเปิด/ปิดใบมาสาย-ออกก่อนเวลา
  const { map: featureMap } = useFeatures();
  const LATE_ARRIVAL_FIXED_TIME = String(featureMap.leaves.config.lateArrivalFixedTime);
  const lateArrivalOn = featureMap.leaves.enabled && featureMap.leaves.options.lateArrival === true;
  const earlyLeaveOn = featureMap.leaves.enabled && featureMap.leaves.options.earlyLeave === true;
  const canManage = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR'].includes(userRole);
  const isAdminRole = ['SUPER_ADMIN', 'ADMIN'].includes(userRole);

  // State สำหรับเก็บรายการลา
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leavesPage, setLeavesPage] = useState(1);
  const [hasMoreLeaves, setHasMoreLeaves] = useState(false);
  const [isLoadingMoreLeaves, setIsLoadingMoreLeaves] = useState(false);
  
  // State สำหรับเก็บรายชื่อผู้ใช้ (สำหรับเลือกผู้ขอลา)
  const [users, setUsers] = useState<User[]>([]);
  
  // State สำหรับเก็บสถิติรายบุคคล
  const [userStats, setUserStats] = useState<UserLeaveStats[]>([]);
  
  // State สำหรับสถานะการโหลด
  const [isLoading, setIsLoading] = useState(true);
  
  // State สำหรับข้อผิดพลาด
  const [error, setError] = useState<string | null>(null);
  
  // State สำหรับเปิด/ปิด Modal สร้างการลา
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // State สำหรับเปิด/ปิด Modal Export
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  // State สำหรับแสดง/ซ่อน Dashboard
  const [showDashboard, setShowDashboard] = useState(false);
  
  // State สำหรับแสดง LeaveForm
  const [selectedLeave, setSelectedLeave] = useState<Leave | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  
  // State สำหรับแท็บที่กำลังดู (การลา แบบส่ง กบก. / แบบเก็บสถิติ / ขอปฏิบัติหน้าที่ฯ หลังเวลา 08.30 น.)
  const [activeTab, setActiveTab] = useState<LeaveTab>('KBK');

  // State สำหรับค้นหา
  const [searchType, setSearchType] = useState<'name' | 'date'>('name');
  const [searchName, setSearchName] = useState('');
  const [searchDate, setSearchDate] = useState('');

  // State สำหรับ Export
  const [exportName, setExportName] = useState('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // State สำหรับข้อมูลการลาใหม่
  const [newLeave, setNewLeave] = useState({
    userId: '',
    type: 'SICK' as LeaveType,
    startDate: '',
    endDate: '',
    reason: '',
    contactAddress: '',
    formCategory: null as LeaveFormCategory | null,
  });
  // โหมดการลา: fullday / halfday / hours
  const [leaveMode, setLeaveMode] = useState<'fullday' | 'halfday' | 'hours'>('fullday');
  const [halfDayPeriod, setHalfDayPeriod] = useState<'MORNING' | 'AFTERNOON'>('MORNING');
  const [leaveHours, setLeaveHours] = useState<number>(1);
  // เวลาออก/เวลากลับ (HH:mm) ใช้เฉพาะประเภทลาใน TIME_RANGE_TYPES (มาสาย/ออกก่อนเวลา/ออกนอกเขตฯ)
  const [leaveTimeOut, setLeaveTimeOut] = useState<string>('');
  const [leaveTimeBack, setLeaveTimeBack] = useState<string>('');
  // เวลาออกที่ใช้จริง: มาสายล็อกที่ 08:30 เสมอ (ไม่สนค่าที่เลือก) ประเภทอื่นใช้ค่าที่เลือก
  const effectiveTimeOut = newLeave.type === 'LATE_ARRIVAL' ? LATE_ARRIVAL_FIXED_TIME : leaveTimeOut;

  // State สำหรับโหมดแก้ไข
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<number | null>(null);

  // State สำหรับ Export column checkboxes
  const [exportColumns, setExportColumns] = useState({
    id: true,
    name: true,
    department: true,
    type: true,
    startDate: true,
    endDate: true,
    days: true,
    reason: true,
    status: true,
    approvedBy: true,
    createdAt: true,
    formCategory: true,
  });

  // State สำหรับวันหยุด
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isHolidayPanelOpen, setIsHolidayPanelOpen] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ startDate: '', endDate: '', name: '' });
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());

  /**
   * ดึงรายการลาของแท็บที่ระบุ (หน้าที่ระบุ)
   */
  const fetchLeavesForTab = async (tab: LeaveTab, page: number) => {
    const response = await fetch(`/api/leaves?tab=${tab}&page=${page}&limit=${LEAVES_PAGE_SIZE}`);
    return response.json();
  };

  /**
   * ดึงข้อมูลผู้ใช้และวันหยุดจาก API (ครั้งเดียวตอนโหลดหน้า ไม่ขึ้นกับแท็บ)
   */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersResponse, holidaysData] = await Promise.all([
          // รายชื่อแบบย่อ (id/ชื่อ/ตำแหน่ง/กอง/role/หัวหน้า) พอสำหรับ dropdown และการหาผู้ตรวจสอบ/หัวหน้า/ผอ. — ไม่ดึงข้อมูลเต็มของทุกคน
          fetch('/api/users/options'),
          fetch(`/api/holidays?year=${new Date().getFullYear()}`).then(r => r.json()).catch(() => null),
        ]);

        const usersData = await usersResponse.json();
        if (usersResponse.ok && usersData.success) {
          setUsers(usersData.data as User[]);
        }

        if (holidaysData?.success) {
          setHolidays(holidaysData.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      }
    };

    fetchData();
  }, []);

  /**
   * ดึงรายการลาของแท็บที่กำลังดู (ตอนโหลดหน้าครั้งแรก และทุกครั้งที่สลับแท็บ)
   */
  useEffect(() => {
    // ป้องกัน race condition: ถ้าสลับแท็บเร็วกว่าคำขอก่อนหน้าจะตอบกลับ ผลลัพธ์เก่าต้องไม่
    // มาทับข้อมูลของแท็บปัจจุบัน
    let ignore = false;

    const loadTab = async () => {
      try {
        setIsLoading(true);
        const data = await fetchLeavesForTab(activeTab, 1);
        if (ignore) return;
        if (!data.success) {
          throw new Error(data.message || 'ไม่สามารถดึงข้อมูลการลาได้');
        }
        setLeaves(data.data);
        setLeavesPage(1);
        setHasMoreLeaves(Boolean(data.meta?.hasMore));
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    loadTab();
    return () => {
      ignore = true;
    };
  }, [activeTab]);

  /**
   * โหลดรายการลาหน้าถัดไป (เพิ่มต่อท้ายรายการที่มีอยู่)
   */
  const loadMoreLeaves = async () => {
    try {
      setIsLoadingMoreLeaves(true);
      const nextPage = leavesPage + 1;
      const data = await fetchLeavesForTab(activeTab, nextPage);
      if (data.success) {
        setLeaves([...leaves, ...data.data]);
        setLeavesPage(nextPage);
        setHasMoreLeaves(Boolean(data.meta?.hasMore));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsLoadingMoreLeaves(false);
    }
  };

  /**
   * ดึงข้อมูลสถิติรายบุคคล
   */
  const fetchDashboard = async () => {
    try {
      const response = await fetch('/api/leaves/dashboard');
      const data = await response.json();
      
      if (data.success) {
        setUserStats(data.data.users);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    }
  };

  /**
   * สลับการแสดง Dashboard
   */
  const toggleDashboard = () => {
    if (!showDashboard) {
      fetchDashboard();
    }
    setShowDashboard(!showDashboard);
  };

  /**
   * ค้นหาการลา
   */
  const handleSearch = async () => {
    try {
      setIsLoading(true);

      const params: string[] = [`tab=${activeTab}`];
      if (searchType === 'name' && searchName) {
        params.push(`name=${encodeURIComponent(searchName)}`);
      } else if (searchType === 'date' && searchDate) {
        params.push(`date=${searchDate}`);
      }
      const url = `/api/leaves/search?${params.join('&')}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        setLeaves(data.data);
        // ผลค้นหาไม่แบ่งหน้า (จำกัดสูงสุด 200 รายการที่ API) จึงไม่มี "โหลดเพิ่มเติม"
        setHasMoreLeaves(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * รีเซ็ตการค้นหา
   */
  const resetSearch = async () => {
    setSearchName('');
    setSearchDate('');

    try {
      const data = await fetchLeavesForTab(activeTab, 1);

      if (data.success) {
        setLeaves(data.data);
        setLeavesPage(1);
        setHasMoreLeaves(Boolean(data.meta?.hasMore));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /** จัดรูปแบบ Date เป็น YYYY-MM-DD ตามเวลาท้องถิ่น (ไม่ใช้ toISOString ที่จะเลื่อนวันจาก UTC shift) */
  const toDateInputValue = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /** ตั้งช่วงวันที่ export แบบเร็ว: สัปดาห์นี้ (จันทร์-อาทิตย์) / เดือนนี้ / ปีงบประมาณนี้ */
  const setExportPeriod = (period: 'week' | 'month' | 'fiscalYear') => {
    const now = new Date();
    if (period === 'week') {
      const day = now.getDay(); // 0=อาทิตย์ ... 6=เสาร์
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setExportStartDate(toDateInputValue(monday));
      setExportEndDate(toDateInputValue(sunday));
    } else if (period === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setExportStartDate(toDateInputValue(first));
      setExportEndDate(toDateInputValue(last));
    } else {
      const { start, end } = getFiscalYearRange(now);
      setExportStartDate(toDateInputValue(start));
      setExportEndDate(toDateInputValue(end));
    }
  };

  /**
   * Export ข้อมูลการลา
   */
  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      let url = '/api/leaves/export?';
      const params: string[] = [`tab=${activeTab}`];

      if (exportName) {
        params.push(`name=${encodeURIComponent(exportName)}`);
      }
      if (exportStartDate) {
        params.push(`startDate=${exportStartDate}`);
      }
      if (exportEndDate) {
        params.push(`endDate=${exportEndDate}`);
      }

      // ส่งคอลัมน์ที่เลือก
      const selectedCols = Object.entries(exportColumns)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (selectedCols.length > 0) {
        params.push(`columns=${selectedCols.join(',')}`);
      }

      url += params.join('&');
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถ export ข้อมูลได้');
      }
      
      // ดาวน์โหลดไฟล์
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `leaves_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      setIsExportModalOpen(false);
      setExportName('');
      setExportStartDate('');
      setExportEndDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * เปิดฟอร์มบันทึกการลาใหม่ โดย prefill ประเภทตามแท็บที่กำลังดูอยู่
   */
  const openCreateModal = () => {
    setIsEditMode(false);
    setEditingLeaveId(null);
    // แท็บ LATE_ARRIVAL/EARLY_LEAVE ชนะ formCategory เสมอ (ดู resolveLeaveTab) จึงต้องไม่เอาชื่อแท็บไปใส่ formCategory
    const isDedicatedTab = activeTab === 'LATE_ARRIVAL' || activeTab === 'EARLY_LEAVE';
    setNewLeave({
      // ผู้ใช้ทั่วไปยื่นลาแทนคนอื่นไม่ได้ (backend บังคับอยู่แล้ว) ล็อกเป็นตัวเองไว้ตั้งแต่ต้น
      userId: canManage ? '' : String(currentUserId),
      type: activeTab === 'LATE_ARRIVAL' || activeTab === 'EARLY_LEAVE' ? activeTab : 'SICK',
      startDate: '',
      endDate: '',
      reason: '',
      contactAddress: '',
      formCategory: activeTab === 'LATE_ARRIVAL' || activeTab === 'EARLY_LEAVE' ? null : activeTab,
    });
    setLeaveMode(isDedicatedTab ? 'hours' : 'fullday');
    setHalfDayPeriod('MORNING');
    setLeaveHours(1);
    setLeaveTimeOut('');
    setLeaveTimeBack('');
    setIsModalOpen(true);
  };

  /**
   * เปิดฟอร์มแก้ไขรายการลา
   */
  const handleEditLeave = (leave: Leave) => {
    setIsEditMode(true);
    setEditingLeaveId(leave.id);
    setNewLeave({
      userId: leave.userId.toString(),
      type: leave.type,
      startDate: new Date(leave.startDate).toISOString().split('T')[0],
      endDate: new Date(leave.endDate).toISOString().split('T')[0],
      reason: leave.reason.replace(/^\[(ครึ่งวันเช้า|ครึ่งวันบ่าย|ลา [\d.]+ ชม\.|เวลาออก \d{2}:\d{2} - เวลากลับ \d{2}:\d{2})\]\s*/, ''),
      contactAddress: (leave as any).contactAddress || '',
      formCategory: leave.formCategory || null,
    });
    if (leave.isHalfDay) {
      setLeaveMode('halfday');
      setHalfDayPeriod(leave.reason.includes('ครึ่งวันบ่าย') ? 'AFTERNOON' : 'MORNING');
    } else if (TIME_RANGE_TYPES.includes(leave.type) && leave.outTime && leave.backTime) {
      setLeaveMode('hours');
      setLeaveTimeOut(leave.outTime);
      setLeaveTimeBack(leave.backTime);
    } else if (leave.hours && leave.hours > 0) {
      setLeaveMode('hours');
      setLeaveHours(leave.hours);
    } else {
      setLeaveMode('fullday');
    }
    // ปรับโหมดให้ตรงกับที่ประเภทนี้อนุญาต: มาสาย = โหมดเวลาเสมอ, ลาบวชที่เคยบันทึกเป็นรายชั่วโมงเปิดเป็นเต็มวันให้เลือกใหม่
    setLeaveMode((mode) => coerceMode(leave.type, mode));
    setIsModalOpen(true);
  };

  /**
   * ฟังก์ชันสร้าง/แก้ไขรายการลา
   */
  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newLeave.userId || !newLeave.startDate || !newLeave.reason.trim()) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    // ถ้าลาเต็มวัน ต้องมี endDate
    if (leaveMode === 'fullday' && !newLeave.endDate) {
      setError('กรุณาระบุวันที่สิ้นสุด');
      return;
    }
    const isTimeRangeType = leaveMode === 'hours' && TIME_RANGE_TYPES.includes(newLeave.type);
    // ถ้าเป็นประเภทที่ใช้เวลาออก-เวลากลับ ต้องกรอกครบและเวลากลับต้องมากกว่าเวลาออก
    if (isTimeRangeType && (!effectiveTimeOut || !leaveTimeBack || timeRangeToHours(effectiveTimeOut, leaveTimeBack) <= 0)) {
      setError(
        newLeave.type === 'LATE_ARRIVAL'
          ? `กรุณาระบุเวลาที่มาถึง (ต้องมากกว่า ${LATE_ARRIVAL_FIXED_TIME} น.)`
          : 'กรุณาระบุเวลาออกและเวลากลับให้ถูกต้อง (เวลากลับต้องมากกว่าเวลาออก)'
      );
      return;
    }

    try {
      const payload: Record<string, any> = {
        ...newLeave,
        userId: parseInt(newLeave.userId),
        isHalfDay: leaveMode === 'halfday',
        hours: leaveMode === 'hours' ? (isTimeRangeType ? timeRangeToHours(effectiveTimeOut, leaveTimeBack) : leaveHours) : undefined,
      };
      if (isTimeRangeType) {
        payload.outTime = effectiveTimeOut;
        payload.backTime = leaveTimeBack;
      }
      // ถ้าลาครึ่งวันหรือลาเป็นชม. ให้ endDate = startDate
      if (leaveMode === 'halfday' || leaveMode === 'hours') {
        payload.endDate = newLeave.startDate;
      }
      // เพิ่มข้อมูลช่วงครึ่งวันในเหตุผล
      if (leaveMode === 'halfday') {
        const periodLabel = halfDayPeriod === 'MORNING' ? 'ครึ่งวันเช้า' : 'ครึ่งวันบ่าย';
        payload.reason = `[${periodLabel}] ${newLeave.reason}`;
      }
      if (leaveMode === 'hours') {
        payload.reason = isTimeRangeType
          ? `[เวลาออก ${effectiveTimeOut} - เวลากลับ ${leaveTimeBack}] ${newLeave.reason}`
          : `[ลา ${leaveHours} ชม.] ${newLeave.reason}`;
      }

      let response: Response;
      if (isEditMode && editingLeaveId) {
        // แก้ไขรายการลา
        response = await fetch(`/api/leaves/${editingLeaveId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // สร้างรายการลาใหม่
        response = await fetch('/api/leaves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'ไม่สามารถบันทึกการลาได้');
      }

      if (data.success) {
        const savedTab = resolveLeaveTab(data.data);
        if (isEditMode && editingLeaveId) {
          setLeaves(
            savedTab === activeTab
              ? leaves.map(l => (l.id === editingLeaveId ? data.data : l))
              : leaves.filter(l => l.id !== editingLeaveId)
          );
        } else if (savedTab === activeTab) {
          setLeaves([data.data, ...leaves]);
        }
        setIsModalOpen(false);
        setIsEditMode(false);
        setEditingLeaveId(null);
        setNewLeave({
          userId: '',
          type: 'SICK',
          startDate: '',
          endDate: '',
          reason: '',
          contactAddress: '',
          formCategory: null,
        });
        setLeaveMode('fullday');
        setHalfDayPeriod('MORNING');
        setLeaveHours(1);
        setLeaveTimeOut('');
        setLeaveTimeBack('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันอนุมัติ/ไม่อนุมัติการลา
   */
  const handleUpdateStatus = async (leaveId: number, status: LeaveStatus) => {
    try {
      const response = await fetch(`/api/leaves/${leaveId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'ไม่สามารถอัปเดตสถานะได้');
      }
      
      if (data.success) {
        setLeaves(leaves.map(l => l.id === leaveId ? data.data : l));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันลบรายการลา
   */
  const handleDeleteLeave = async (leaveId: number) => {
    if (!confirm('ต้องการลบรายการลานี้ใช่หรือไม่?')) return;
    
    try {
      const response = await fetch(`/api/leaves/${leaveId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถลบรายการลาได้');
      }
      
      setLeaves(leaves.filter(l => l.id !== leaveId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * เซตวันหยุดแบบ string เพื่อค้นหาแบบ O(1) แทนการ .some() วนทุกวันหยุดต่อวันที่ตรวจสอบ
   */
  const holidayDateSet = useMemo(
    () => new Set(holidays.map(h => new Date(h.date).toISOString().split('T')[0])),
    [holidays]
  );

  /**
   * ฟังก์ชันคำนวณจำนวนวันทำการ (ไม่นับ ส.-อา. และวันหยุด)
   */
  const calculateDays = useCallback((startDate: string | Date, endDate: string | Date): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const dateStr = current.toISOString().split('T')[0];
        if (!holidayDateSet.has(dateStr)) {
          count++;
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  }, [holidayDateSet]);

  // callback ของการ์ดต้อง stable เพื่อให้ React.memo(LeaveCard) ได้ผลจริง: ชี้ไปที่ handler รุ่นล่าสุดผ่าน ref
  // (handleEditLeave/handleUpdateStatus/handleDeleteLeave ถูกสร้างใหม่ทุกครั้งที่ page render)
  const latestHandlers = useRef({ handleEditLeave, handleUpdateStatus, handleDeleteLeave });
  useEffect(() => {
    // อัปเดต ref หลัง commit (ห้ามเขียน ref ระหว่าง render) — ผู้ใช้กดได้หลัง effect นี้ทำงานแล้วเสมอ
    latestHandlers.current = { handleEditLeave, handleUpdateStatus, handleDeleteLeave };
  });
  const cardActions = useMemo(
    () => ({
      onEdit: (leave: Leave) => latestHandlers.current.handleEditLeave(leave),
      onPrint: (leave: Leave) => {
        setSelectedLeave(leave);
        setShowLeaveForm(true);
      },
      onUpdateStatus: (leaveId: number, status: LeaveStatus) => latestHandlers.current.handleUpdateStatus(leaveId, status),
      onDelete: (leaveId: number) => latestHandlers.current.handleDeleteLeave(leaveId),
    }),
    []
  );

  /**
   * แคชผลลัพธ์จำนวนวันทำการต่อรายการลา คำนวณใหม่เฉพาะตอน leaves หรือวันหยุดเปลี่ยน
   * ไม่ใช่ทุกครั้งที่ component re-render จากสถานะอื่นที่ไม่เกี่ยวข้อง
   */
  const leaveWorkingDays = useMemo(() => {
    const map = new Map<number, number>();
    for (const leave of leaves) {
      if (leave.isHalfDay || (leave.hours && leave.hours > 0)) continue;
      map.set(leave.id, calculateDays(leave.startDate, leave.endDate));
    }
    return map;
  }, [leaves, calculateDays]);

  /**
   * คำนวณจำนวนชั่วโมง (ทศนิยม) จากเวลาออก-เวลากลับ (HH:mm)
   * คืนค่า 0 ถ้าข้อมูลไม่ครบหรือเวลากลับไม่มากกว่าเวลาออก
   */
  const timeRangeToHours = (out: string, back: string): number => {
    if (!out || !back) return 0;
    const [outH, outM] = out.split(':').map(Number);
    const [backH, backM] = back.split(':').map(Number);
    const diffMinutes = (backH * 60 + backM) - (outH * 60 + outM);
    return diffMinutes > 0 ? diffMinutes / 60 : 0;
  };

  /**
   * เพิ่มวันหยุด
   */
  const handleAddHoliday = async () => {
    if (!newHoliday.startDate || !newHoliday.name.trim()) return;
    try {
      const response = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: newHoliday.startDate,
          endDate: newHoliday.endDate || newHoliday.startDate,
          name: newHoliday.name,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (data.success) {
        const created = Array.isArray(data.data) ? data.data : [data.data];
        setHolidays([...holidays, ...created].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        setNewHoliday({ startDate: '', endDate: '', name: '' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ลบวันหยุด
   */
  const handleDeleteHoliday = async (id: number) => {
    if (!confirm('ต้องการลบวันหยุดนี้ใช่หรือไม่?')) return;
    try {
      const response = await fetch(`/api/holidays?id=${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message);
      }
      setHolidays(holidays.filter(h => h.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * โหลดวันหยุดตามปี
   */
  const fetchHolidaysByYear = async (year: number) => {
    try {
      const response = await fetch(`/api/holidays?year=${year}`);
      const data = await response.json();
      if (data.success) {
        setHolidays(data.data);
      }
    } catch {}
  };

  // ผู้อำนวยการที่ยัง active อยู่ (ใช้เป็นผู้ลงนามที่พิมพ์ล่วงหน้าบนแบบใบลา)
  const director = useMemo(
    () => users.find(u => u.role === 'DIRECTOR' && u.isActive) || null,
    [users]
  );

  // หัวหน้างานของเจ้าของใบลาที่กำลังเลือก (ใช้เป็นผู้ลงนามช่อง "ความเห็นของผู้บังคับบัญชา")
  const supervisorForSelected = useMemo(
    () => (selectedLeave?.user.supervisorId ? users.find(u => u.id === selectedLeave.user.supervisorId) || null : null),
    [users, selectedLeave]
  );

  // ธุรการที่ตรวจสอบใบลาที่กำลังเลือก (ใช้เป็นผู้ลงนามช่อง "ผู้ตรวจสอบ")
  const reviewerForSelected = useMemo(
    () => (selectedLeave?.adminReviewedBy ? users.find(u => u.id === selectedLeave.adminReviewedBy) || null : null),
    [users, selectedLeave]
  );

  // ลายเซ็นคือการรับรองด้วยตนเอง: เจ้าของใบลาเท่านั้นที่วาง/ย้าย/ย่อขยายได้ ส่วน MANAGER ขึ้นไปซ่อนได้อย่างเดียว
  // (ตรงกับกฎของ PATCH /api/leaves/[id]/signature)
  const canPlaceSelectedSignature = !!selectedLeave && selectedLeave.userId === currentUserId;
  const canHideSelectedSignature = canPlaceSelectedSignature || (!!selectedLeave && canManage);
  const handleSignatureSaved = (placement: SignaturePlacement | null) => {
    if (!selectedLeave) return;
    const id = selectedLeave.id;
    setSelectedLeave((l) => (l && l.id === id ? { ...l, signaturePlacement: placement } : l));
    setLeaves((ls) => ls.map((x) => (x.id === id ? { ...x, signaturePlacement: placement } : x)));
  };

  // ข้อมูลลาของผู้ใช้ที่กำลังเลือก (สำหรับ LeaveForm previousLeave/userLeaves)
  // "ครั้งสุดท้าย" ต้องเป็นการลาประเภทเดียวกับที่กำลังยื่น และเทียบตามวันที่ลาจริง (startDate) ไม่ใช่วันที่บันทึก (createdAt)
  const previousLeaveForSelected = useMemo(() => {
    if (!selectedLeave) return null;
    return leaves
      .filter(l =>
        l.userId === selectedLeave.userId &&
        l.id !== selectedLeave.id &&
        l.type === selectedLeave.type &&
        new Date(l.startDate) < new Date(selectedLeave.startDate)
      )
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0] || null;
  }, [leaves, selectedLeave]);

  const userLeavesForSelected = useMemo(() => {
    if (!selectedLeave) return [];
    return leaves.filter(l => l.userId === selectedLeave.userId);
  }, [leaves, selectedLeave]);

  // แสดง loading ขณะโหลดข้อมูล
  if (isLoading && leaves.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* หัวข้อหน้า */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">บันทึกการลา</h1>
          <p className="text-slate-500 mt-1">
            จัดการและบันทึกประวัติการลาของพนักงาน
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <button
              onClick={() => setIsHolidayPanelOpen(!isHolidayPanelOpen)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                isHolidayPanelOpen
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              <Calendar size={18} />
              <span>วันหยุด</span>
            </button>
          )}
          <button
            onClick={toggleDashboard}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              showDashboard 
                ? "bg-indigo-100 text-indigo-700" 
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            <BarChart3 size={18} />
            <span>สถิติรายบุคคล</span>
            {showDashboard ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={() => setIsExportModalOpen(true)}
            className={cn(
              "flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg",
              "hover:bg-emerald-200 transition-colors"
            )}
          >
            <Download size={18} />
            <span>Export</span>
          </button>
          <button
            onClick={openCreateModal}
            className={cn(
              "flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg",
              "hover:bg-indigo-700 transition-colors shadow-sm"
            )}
          >
            <Plus size={18} />
            <span>บันทึกการลาใหม่</span>
          </button>
        </div>
      </div>

      {/* แสดงข้อผิดพลาด */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-500" />
          <p className="text-rose-600">{error}</p>
        </div>
      )}

      {/* Holiday Management Panel */}
      {isHolidayPanelOpen && canManage && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Calendar size={18} className="text-amber-600" />
              จัดการวันหยุดของหน่วยงาน
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { const y = holidayYear - 1; setHolidayYear(y); fetchHolidaysByYear(y); }}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
              >
                <ChevronDown size={16} className="rotate-90" />
              </button>
              <span className="text-sm font-medium text-slate-700 min-w-[60px] text-center">
                ปี {holidayYear + 543}
              </span>
              <button
                onClick={() => { const y = holidayYear + 1; setHolidayYear(y); fetchHolidaysByYear(y); }}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
              >
                <ChevronUp size={16} className="rotate-90" />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500 mb-3">
            วันลาจะไม่นับวันเสาร์-อาทิตย์ และวันหยุดที่กำหนดไว้ด้านล่าง
          </p>

          {/* Holiday List */}
          <div className="space-y-1.5 mb-4 max-h-52 overflow-y-auto">
            {holidays.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีวันหยุดสำหรับปีนี้</p>
            ) : (
              holidays.map((holiday) => (
                <div key={holiday.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 group">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {new Date(holiday.date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                    </span>
                    <span className="text-sm font-medium text-slate-700">{holiday.name}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteHoliday(holiday.id)}
                    className="text-slate-300 hover:text-rose-500 p-1 rounded hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add new holiday */}
          <div className="space-y-2">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  value={newHoliday.startDate}
                  onChange={(e) => setNewHoliday({ ...newHoliday, startDate: e.target.value, endDate: newHoliday.endDate || e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">ถึงวันที่</label>
                <input
                  type="date"
                  value={newHoliday.endDate}
                  min={newHoliday.startDate}
                  onChange={(e) => setNewHoliday({ ...newHoliday, endDate: e.target.value })}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-medium text-slate-500 mb-1">ชื่อวันหยุด</label>
                <input
                  type="text"
                  placeholder="เช่น วันสงกรานต์"
                  value={newHoliday.name}
                  onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddHoliday()}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={handleAddHoliday}
                disabled={!newHoliday.startDate || !newHoliday.name.trim()}
                className={cn(
                  "bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 text-sm font-medium transition-colors flex items-center gap-1",
                  (!newHoliday.startDate || !newHoliday.name.trim()) && "opacity-50 cursor-not-allowed"
                )}
              >
                <Plus size={16} />
                เพิ่ม
              </button>
            </div>
            {newHoliday.startDate && newHoliday.endDate && newHoliday.startDate !== newHoliday.endDate && (
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                จะเพิ่มวันหยุดติดกัน {Math.ceil((new Date(newHoliday.endDate).getTime() - new Date(newHoliday.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} วัน ({new Date(newHoliday.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} - {new Date(newHoliday.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })})
              </p>
            )}
          </div>
        </div>
      )}

      {/* แท็บประเภทการลา */}
      <div className="flex gap-2 bg-white rounded-xl shadow-sm border border-slate-200 p-2">
        {LEAVE_TABS.filter((tab) => (tab !== 'LATE_ARRIVAL' || lateArrivalOn) && (tab !== 'EARLY_LEAVE' || earlyLeaveOn)).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-transparent text-slate-600 hover:bg-slate-100"
            )}
          >
            {LEAVE_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ส่วนค้นหา */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* เลือกประเภทการค้นหา */}
          <div className="flex gap-2">
            <button
              onClick={() => setSearchType('name')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                searchType === 'name'
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              ค้นหาด้วยชื่อ
            </button>
            <button
              onClick={() => setSearchType('date')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                searchType === 'date'
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              ค้นหาด้วยวันที่
            </button>
          </div>

          {/* ช่องค้นหา */}
          <div className="flex-1 flex gap-2">
            {searchType === 'name' ? (
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อพนักงาน..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            ) : (
              <input
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            )}
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              ค้นหา
            </button>
            <button
              onClick={resetSearch}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
            >
              รีเซ็ต
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard สถิติรายบุคคล */}
      {showDashboard && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            สถิติการลารายบุคคล (ปี {new Date().getFullYear()})
          </h2>
          
          {userStats.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p>กำลังโหลดข้อมูล...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 text-sm font-semibold text-slate-600">พนักงาน</th>
                    <th className="py-3 px-4 text-sm font-semibold text-slate-600 text-center">ลาป่วย</th>
                    <th className="py-3 px-4 text-sm font-semibold text-slate-600 text-center">ลากิจ</th>
                    <th className="py-3 px-4 text-sm font-semibold text-slate-600 text-center">รวม (วัน)</th>
                    <th className="py-3 px-4 text-sm font-semibold text-slate-600 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userStats.map((item) => (
                    <tr key={item.user.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                            {item.user.avatar || item.user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">{item.user.prefix}{item.user.name}</p>
                            <p className="text-xs text-slate-400">{item.user.department}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-rose-600 font-medium">{item.stats.sickDays}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-amber-600 font-medium">{item.stats.personalDays}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-slate-700">{item.stats.totalDays}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex justify-center gap-1 text-xs">
                          {item.stats.pending > 0 && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                              รอ {item.stats.pending}
                            </span>
                          )}
                          {item.stats.approved > 0 && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                              อนุมัติ {item.stats.approved}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      

      {/* รายการลา */}
      <div className="space-y-4">
        {leaves.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">ไม่มีข้อมูลการลา</p>
          </div>
        ) : (
          leaves.map((leave) => (
            <LeaveCard
              key={leave.id}
              leave={leave}
              workingDays={leaveWorkingDays.get(leave.id) ?? 0}
              currentUserId={currentUserId}
              userRole={userRole}
              isAdminRole={isAdminRole}
              {...cardActions}
            />
          ))
        )}
      </div>

      {/* โหลดรายการลาเพิ่มเติม */}
      {hasMoreLeaves && (
        <div className="flex justify-center">
          <button
            onClick={loadMoreLeaves}
            disabled={isLoadingMoreLeaves}
            className={cn(
              "px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2",
              isLoadingMoreLeaves && "opacity-70 cursor-not-allowed"
            )}
          >
            {isLoadingMoreLeaves ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังโหลด...</span>
              </>
            ) : (
              <span>โหลดเพิ่มเติม</span>
            )}
          </button>
        </div>
      )}

      {/* Modal บันทึกการลา */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            {/* Header - fixed */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl flex-shrink-0">
              <h3 className="font-bold text-slate-800">
                {isEditMode ? 'แก้ไขรายการลา' : 'บันทึกการลา'}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setIsEditMode(false);
                  setEditingLeaveId(null);
                  setNewLeave({ userId: '', type: 'SICK', startDate: '', endDate: '', reason: '', contactAddress: '', formCategory: null });
                  setLeaveMode('fullday');
                  setLeaveTimeOut('');
                  setLeaveTimeBack('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form - scrollable body */}
            <form id="leaveForm" onSubmit={handleCreateLeave} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* เลือกพนักงาน: ผู้ใช้ทั่วไปยื่นลาแทนคนอื่นไม่ได้ (backend บังคับอยู่แล้ว) จึงล็อกเป็นตัวเองเท่านั้น */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  พนักงาน <span className="text-rose-500">*</span>
                </label>
                {canManage ? (
                  <select
                    required
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={newLeave.userId}
                    onChange={(e) => setNewLeave({ ...newLeave, userId: e.target.value })}
                  >
                    <option value="">เลือกพนักงาน...</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.prefix}{user.name} {user.department && `(${user.department})`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={currentUserName}
                    className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-slate-500 cursor-not-allowed outline-none"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ประเภทการลา
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newLeave.type}
                  onChange={(e) => {
                    const nextType = e.target.value as LeaveType;
                    setNewLeave({ ...newLeave, type: nextType });
                    setLeaveMode((mode) => coerceMode(nextType, mode));
                  }}
                >
                  <option value="SICK">ลาป่วย</option>
                  <option value="PERSONAL">ลากิจ</option>
                  <option value="MATERNITY">ลาคลอดบุตร</option>
                  <option value="ORDINATION">ลาบวช</option>
                  {earlyLeaveOn && <option value="EARLY_LEAVE">ออกก่อนเวลา</option>}
                  {lateArrivalOn && <option value="LATE_ARRIVAL">มาสาย</option>}
                  <option value="RUN_AN_ERRAND">ออกนอกเขตพระราชฐาน</option>
                  <option value="OTHER">อื่นๆ</option>
                </select>
              </div>

              {/* ประเภทแบบฟอร์ม: แบบส่ง กบก. / แบบเก็บสถิติ (เลือกได้อย่างเดียว) - ไม่เกี่ยวกับ "มาสาย"/"ออกก่อนเวลา" เพราะสองแท็บนั้นแยกจาก formCategory เสมอ */}
              {newLeave.type !== 'LATE_ARRIVAL' && newLeave.type !== 'EARLY_LEAVE' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    ประเภทแบบฟอร์ม (ถ้ามี)
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newLeave.formCategory === 'KBK'}
                        onChange={() =>
                          setNewLeave({ ...newLeave, formCategory: newLeave.formCategory === 'KBK' ? null : 'KBK' })
                        }
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-slate-600">แบบส่ง กบก.</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newLeave.formCategory === 'STATS'}
                        onChange={() =>
                          setNewLeave({ ...newLeave, formCategory: newLeave.formCategory === 'STATS' ? null : 'STATS' })
                        }
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-slate-600">แบบเก็บสถิติ</span>
                    </label>
                  </div>
                </div>
              )}

              {/* โหมดการลา (มาสายไม่แสดง: ใช้เวลามาถึงจริงเทียบกับ 08:30 เสมอ) */}
              {allowedModesFor(newLeave.type).length > 1 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  รูปแบบการลา
                </label>
                <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setLeaveMode('fullday')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${
                      leaveMode === 'fullday'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    เต็มวัน
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveMode('halfday')}
                    className={`flex-1 py-2 text-sm font-medium transition-colors border-x border-slate-300 ${
                      leaveMode === 'halfday'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ครึ่งวัน
                  </button>
                  {/* ลาบวชมีเฉพาะเต็มวัน/ครึ่งวัน ไม่มีรายชั่วโมง */}
                  {allowedModesFor(newLeave.type).includes('hours') && (
                    <button
                      type="button"
                      onClick={() => setLeaveMode('hours')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        leaveMode === 'hours'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      รายชั่วโมง
                    </button>
                  )}
                </div>
              </div>
              )}

              {/* ครึ่งวัน: เลือกเช้า/บ่าย */}
              {leaveMode === 'halfday' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    ช่วงเวลา
                  </label>
                  <div className="flex rounded-lg border border-slate-300 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setHalfDayPeriod('MORNING')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        halfDayPeriod === 'MORNING'
                          ? 'bg-amber-500 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ครึ่งวันเช้า (08:30 - 12:00)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHalfDayPeriod('AFTERNOON')}
                      className={`flex-1 py-2 text-sm font-medium transition-colors border-l border-slate-300 ${
                        halfDayPeriod === 'AFTERNOON'
                          ? 'bg-amber-500 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ครึ่งวันบ่าย (13:00 - 16:30)
                    </button>
                  </div>
                </div>
              )}

              {/* รายชั่วโมง: เวลาออก-เวลากลับ (มาสาย/ออกก่อนเวลา/ออกนอกเขตฯ) หรือเลือกจำนวนชม. (ประเภทอื่น) */}
              {leaveMode === 'hours' && (
                <div>
                  {TIME_RANGE_TYPES.includes(newLeave.type) ? (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        {newLeave.type === 'LATE_ARRIVAL' ? 'เวลาเข้างาน - เวลาที่มาถึง' : 'เวลาออก - เวลากลับ'}
                      </label>
                      <div className="flex items-center gap-3 mb-2">
                        {newLeave.type === 'LATE_ARRIVAL' ? (
                          // มาสาย: ล็อกเวลาเข้างาน 08:30 น. ไม่ให้แก้ไข
                          <div className="px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-700 font-medium">
                            {LATE_ARRIVAL_FIXED_TIME} น.
                          </div>
                        ) : (
                          <TimeHourMinuteSelect value={leaveTimeOut} onChange={setLeaveTimeOut} />
                        )}
                        <span className="text-slate-400">ถึง</span>
                        <TimeHourMinuteSelect value={leaveTimeBack} onChange={setLeaveTimeBack} />
                      </div>
                      <span className="text-sm text-slate-500">
                        {effectiveTimeOut && leaveTimeBack
                          ? `รวม ${timeRangeToHours(effectiveTimeOut, leaveTimeBack).toFixed(2)} ชม.`
                          : newLeave.type === 'LATE_ARRIVAL'
                            ? 'กรุณาระบุเวลาที่มาถึง'
                            : 'กรุณาระบุเวลาออกและเวลากลับ'}
                      </span>
                      {/* เตือนเฉยๆ ไม่บังคับ - นโยบายออกก่อนเวลาปกติอนุญาตตั้งแต่ 14:30 เป็นต้นไป */}
                      {newLeave.type === 'EARLY_LEAVE' && leaveTimeOut && leaveTimeOut < '14:30' && (
                        <p className="text-sm text-amber-600 mt-1">
                          ⚠️ ปกติออกก่อนเวลาอนุญาตให้ออกได้ตั้งแต่ 14:30 น. เป็นต้นไป
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        จำนวนชั่วโมง
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => setLeaveHours(h)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              leaveHours === h
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {h} ชม.
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min={0.5}
                          max={7}
                          step={0.5}
                          value={leaveHours}
                          onChange={(e) => setLeaveHours(Math.max(0.5, Math.min(7, parseFloat(e.target.value) || 0.5)))}
                          className="w-24 border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                        />
                        <span className="text-sm text-slate-500">ชั่วโมง (0.5-8 ชม.)</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* วันที่ */}
              <div className={leaveMode === 'fullday' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : ''}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {leaveMode === 'fullday' ? 'ตั้งแต่วันที่' : 'วันที่ลา'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={newLeave.startDate}
                    onChange={(e) => setNewLeave({ ...newLeave, startDate: e.target.value })}
                  />
                </div>
                {leaveMode === 'fullday' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      ถึงวันที่ <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={newLeave.endDate}
                      onChange={(e) => setNewLeave({ ...newLeave, endDate: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  เหตุผล <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none resize-none"
                  placeholder="ระบุเหตุผล..."
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  สถานที่พักขณะลาครั้งนี้
                </label>
                <textarea
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none resize-none"
                  placeholder="ระบุสถานที่พักที่สามารถติดต่อได้ระหว่างลา..."
                  value={newLeave.contactAddress}
                  onChange={(e) => setNewLeave({ ...newLeave, contactAddress: e.target.value })}
                />
              </div>

            </form>

            {/* Footer - fixed submit button */}
            <div className="p-4 border-t border-slate-100 bg-white rounded-b-xl flex-shrink-0">
              <button
                type="submit"
                form="leaveForm"
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
              >
                {isEditMode ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Export */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Export ข้อมูลการลา
              </h3>
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* ค้นหาด้วยชื่อ */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ชื่อพนักงาน (ไม่บังคับ)
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                >
                  <option value="">ทั้งหมด</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.name}>
                      {user.prefix}{user.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* ช่วงวันที่ */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ช่วงเวลา
                </label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setExportPeriod('week')}
                    className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    สัปดาห์นี้
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportPeriod('month')}
                    className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    เดือนนี้
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportPeriod('fiscalYear')}
                    className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    ปีงบประมาณนี้
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      ตั้งแต่วันที่
                    </label>
                    <input
                      type="date"
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                      value={exportStartDate}
                      onChange={(e) => setExportStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      ถึงวันที่
                    </label>
                    <input
                      type="date"
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                      value={exportEndDate}
                      onChange={(e) => setExportEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* แสดงแท็บที่กำลัง export (ใช้แท็บที่เลือกอยู่ในหน้าเสมอ) */}
              <div className="text-sm bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg">
                Export ข้อมูลจากแท็บ: <span className="font-medium">{LEAVE_TAB_LABELS[activeTab]}</span>
              </div>

              {/* เลือกคอลัมน์ที่จะ export */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  เลือกข้อมูลที่ต้องการ
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg">
                  {[
                    { key: 'id', label: 'รหัส' },
                    { key: 'name', label: 'ชื่อพนักงาน' },
                    { key: 'department', label: 'แผนก' },
                    { key: 'type', label: 'ประเภทการลา' },
                    { key: 'startDate', label: 'วันที่เริ่ม' },
                    { key: 'endDate', label: 'วันที่สิ้นสุด' },
                    { key: 'days', label: 'จำนวนวัน' },
                    { key: 'reason', label: 'เหตุผล' },
                    { key: 'status', label: 'สถานะ' },
                    { key: 'approvedBy', label: 'ผู้อนุมัติ' },
                    { key: 'createdAt', label: 'วันที่บันทึก' },
                    { key: 'formCategory', label: 'ประเภทแบบฟอร์ม' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-1.5 rounded">
                      <input
                        type="checkbox"
                        checked={exportColumns[key as keyof typeof exportColumns]}
                        onChange={(e) => setExportColumns({ ...exportColumns, [key]: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-slate-600">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-lg">
                <p>ไฟล์จะถูกดาวน์โหลดในรูปแบบ CSV</p>
                <p className="text-xs mt-1">จำนวนคอลัมน์ที่เลือก: {Object.values(exportColumns).filter(Boolean).length} คอลัมน์</p>
              </div>

              <button
                onClick={handleExport}
                disabled={isExporting}
                className={cn(
                  "w-full bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 font-medium transition-colors",
                  "flex items-center justify-center gap-2",
                  isExporting && "opacity-70 cursor-not-allowed"
                )}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>กำลัง Export...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>ดาวน์โหลด CSV</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LeaveForm Modal */}
      {showLeaveForm && selectedLeave && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 sticky top-0">
              <h3 className="font-bold text-slate-800">
                {selectedLeave.type === 'LATE_ARRIVAL'
                  ? 'แบบขอลงเวลามาปฏิบัติราชการหลังเวลา 08.30 น.'
                  : selectedLeave.type === 'EARLY_LEAVE'
                    ? 'แบบขอออกก่อนเวลาปฏิบัติราชการ'
                    : 'แบบใบลาป่วย ลาคลอดบุตร ลากิจ'}
              </h3>
              <button
                onClick={() => {
                  setShowLeaveForm(false);
                  setSelectedLeave(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              {selectedLeave.type === 'LATE_ARRIVAL' ? (
                <LateArrivalForm
                  leave={selectedLeave}
                  userLeaves={userLeavesForSelected}
                  director={director}
                  reviewer={reviewerForSelected}
                  canPlaceSignature={canPlaceSelectedSignature}
                  canHideSignature={canHideSelectedSignature}
                  onSignatureSaved={handleSignatureSaved}
                  onClose={() => {
                    setShowLeaveForm(false);
                    setSelectedLeave(null);
                  }}
                />
              ) : selectedLeave.type === 'EARLY_LEAVE' ? (
                <EarlyLeaveForm
                  leave={selectedLeave}
                  userLeaves={userLeavesForSelected}
                  director={director}
                  reviewer={reviewerForSelected}
                  canPlaceSignature={canPlaceSelectedSignature}
                  canHideSignature={canHideSelectedSignature}
                  onSignatureSaved={handleSignatureSaved}
                  onClose={() => {
                    setShowLeaveForm(false);
                    setSelectedLeave(null);
                  }}
                />
              ) : (
                <LeaveForm
                  leave={selectedLeave}
                  previousLeave={previousLeaveForSelected}
                  userLeaves={userLeavesForSelected}
                  director={director}
                  supervisor={supervisorForSelected}
                  reviewer={reviewerForSelected}
                  canPlaceSignature={canPlaceSelectedSignature}
                  canHideSignature={canHideSelectedSignature}
                  onSignatureSaved={handleSignatureSaved}
                  onClose={() => {
                    setShowLeaveForm(false);
                    setSelectedLeave(null);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
