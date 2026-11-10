// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PendingApprovalsList from './PendingApprovalsList';
import type { RecentPendingLeaveSummary } from '@/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function makeLeave(overrides: Partial<RecentPendingLeaveSummary> = {}): RecentPendingLeaveSummary {
  return {
    id: 1,
    userId: 1,
    user: { id: 1, name: 'สมชาย ใจดี', avatar: 'SJ', department: 'IT' },
    type: 'SICK',
    startDate: new Date('2026-07-06'),
    endDate: new Date('2026-07-07'),
    reason: 'ป่วย',
    status: 'PENDING',
    approvedBy: null,
    approvedAt: null,
    isHalfDay: false,
    hours: null,
    outTime: null,
    backTime: null,
    formCategory: null,
    totalDays: 2,
    contactAddress: null,
    createdAt: new Date('2026-07-06'),
    updatedAt: new Date('2026-07-06'),
    ...overrides,
  } as unknown as RecentPendingLeaveSummary;
}

describe('PendingApprovalsList', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('shows the empty state when there are no pending leaves', () => {
    render(<PendingApprovalsList leaves={[]} />);
    expect(screen.getByText('ไม่มีคำขอรออนุมัติ')).toBeInTheDocument();
  });

  it('renders the requester name, translated leave type, and date range', () => {
    render(<PendingApprovalsList leaves={[makeLeave()]} />);
    expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
    expect(screen.getByText(/ลาป่วย/)).toBeInTheDocument();
  });

  it('falls back to the raw type key when not in leaveTypeConfig', () => {
    render(<PendingApprovalsList leaves={[makeLeave({ type: 'UNKNOWN_TYPE' as never })]} />);
    expect(screen.getByText(/UNKNOWN_TYPE/)).toBeInTheDocument();
  });

  it("falls back to the name's first letter when avatar is missing", () => {
    const leave = makeLeave({ user: { id: 1, name: 'Zara', avatar: null, department: null } });
    render(<PendingApprovalsList leaves={[leave]} />);
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('navigates to /dashboard/leaves when "ดูทั้งหมด" is clicked', async () => {
    const user = userEvent.setup();
    render(<PendingApprovalsList leaves={[]} />);
    await user.click(screen.getByText('ดูทั้งหมด'));
    expect(push).toHaveBeenCalledWith('/dashboard/leaves');
  });
});
