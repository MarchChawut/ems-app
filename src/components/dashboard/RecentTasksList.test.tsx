// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecentTasksList from './RecentTasksList';
import type { RecentTaskSummary } from '@/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function makeTask(overrides: Partial<RecentTaskSummary> = {}): RecentTaskSummary {
  return {
    id: 1,
    title: 'Fix the bug',
    description: null,
    priority: 'MEDIUM',
    columnId: 1,
    assigneeId: 1,
    reminderAt: null,
    reminderSentAt: null,
    reminderDayBeforeAt: null,
    reminderDayBeforeSentAt: null,
    reminderOnDayAt: null,
    reminderOnDaySentAt: null,
    archivedAt: null,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-01'),
    column: { id: 1, name: 'To Do', color: 'slate', order: 0, isDefault: true },
    assignee: { id: 1, name: 'สมชาย ใจดี', avatar: 'SJ' },
    ...overrides,
  } as unknown as RecentTaskSummary;
}

describe('RecentTasksList', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('shows the empty state when there are no tasks', () => {
    render(<RecentTasksList tasks={[]} tasksByColumn={[]} />);
    expect(screen.getByText('ยังไม่มีงาน')).toBeInTheDocument();
  });

  it('renders task title, column, and assignee', () => {
    render(<RecentTasksList tasks={[makeTask()]} tasksByColumn={[]} />);
    expect(screen.getByText('Fix the bug')).toBeInTheDocument();
    expect(screen.getByText('To Do · สมชาย ใจดี')).toBeInTheDocument();
  });

  it('falls back to "-" for a missing column and omits assignee when null', () => {
    const task = makeTask({ column: null as unknown as RecentTaskSummary['column'], assignee: null });
    render(<RecentTasksList tasks={[task]} tasksByColumn={[]} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders per-column count chips', () => {
    render(
      <RecentTasksList
        tasks={[]}
        tasksByColumn={[
          { columnId: 1, columnName: 'To Do', count: 3 },
          { columnId: 2, columnName: 'Done', count: 5 },
        ]}
      />
    );
    expect(screen.getByText('To Do: 3')).toBeInTheDocument();
    expect(screen.getByText('Done: 5')).toBeInTheDocument();
  });

  it('navigates to /dashboard/tasks when "ดูทั้งหมด" is clicked', async () => {
    const user = userEvent.setup();
    render(<RecentTasksList tasks={[]} tasksByColumn={[]} />);
    await user.click(screen.getByText('ดูทั้งหมด'));
    expect(push).toHaveBeenCalledWith('/dashboard/tasks');
  });
});
