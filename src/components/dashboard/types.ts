/**
 * ==================================================
 * Dashboard — Shared local types (leave-stats API shape)
 * ==================================================
 */

export interface LeaveRecord {
  id: number;
  userId: number;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  hours: number | null;
  status: string;
  month: number;
  year: number;
}

export interface UserInfo {
  userId: number;
  userName: string;
  avatar: string | null;
  department: string | null;
}

export interface UserSummary {
  userId: number;
  userName: string;
  avatar: string | null;
  department: string | null;
  byType: Record<string, { count: number; days: number }>;
  totalCount: number;
  totalDays: number;
}

export interface FiscalYearOption {
  label: string;
  value: number;
}

export interface LeaveStatsData {
  fiscalYear: string;
  fiscalStartYear: number;
  availableFiscalYears: FiscalYearOption[];
  fiscalRange: { start: string; end: string };
  fiscalMonths: string[];
  chartData: Record<string, any>[];
  users: UserInfo[];
  userSummaries: UserSummary[];
  leaves: LeaveRecord[];
}
