// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssetStatusWidget from './AssetStatusWidget';
import type { OverdueCheckoutSummary } from '@/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('AssetStatusWidget', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('shows the empty state when there are no overdue checkouts', () => {
    render(<AssetStatusWidget assetsInUse={3} assetsInRepair={1} overdueCheckouts={[]} overdueCount={0} />);
    expect(screen.getByText('ไม่มีรายการเกินกำหนดคืน')).toBeInTheDocument();
    expect(screen.queryByText(/เกินกำหนดคืน \(/)).not.toBeInTheDocument();
  });

  it('renders in-use and in-repair counts', () => {
    render(<AssetStatusWidget assetsInUse={7} assetsInRepair={2} overdueCheckouts={[]} overdueCount={0} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('lists overdue checkouts with the overdue count badge', () => {
    const overdue: OverdueCheckoutSummary[] = [
      {
        id: 1,
        expectedReturnAt: '2026-07-01T00:00:00.000Z',
        asset: { id: 1, name: 'Projector', assetTag: 'TAG-1' },
        holder: { id: 1, name: 'สมชาย ใจดี', avatar: null, department: 'IT' },
      },
    ];
    render(<AssetStatusWidget assetsInUse={7} assetsInRepair={2} overdueCheckouts={overdue} overdueCount={1} />);

    expect(screen.getByText('เกินกำหนดคืน (1)')).toBeInTheDocument();
    expect(screen.getByText('Projector')).toBeInTheDocument();
    expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
  });

  it('navigates to /dashboard/assets when "ดูทั้งหมด" is clicked', async () => {
    const user = userEvent.setup();
    render(<AssetStatusWidget assetsInUse={0} assetsInRepair={0} overdueCheckouts={[]} overdueCount={0} />);
    await user.click(screen.getByText('ดูทั้งหมด'));
    expect(push).toHaveBeenCalledWith('/dashboard/assets');
  });
});
