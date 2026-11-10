// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LowStockSuppliesWidget from './LowStockSuppliesWidget';
import type { LowStockSupplySummary } from '@/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('LowStockSuppliesWidget', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('shows the empty state and no badge when there are no low-stock supplies', () => {
    render(<LowStockSuppliesWidget supplies={[]} totalLowStockCount={0} />);
    expect(screen.getByText('พัสดุคงเหลือในเกณฑ์ปกติ')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows the total count badge when there are low-stock supplies', () => {
    render(<LowStockSuppliesWidget supplies={[]} totalLowStockCount={12} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('lists supplies with quantity and category, falling back for missing category', () => {
    const supplies: LowStockSupplySummary[] = [
      { id: 1, name: 'Paper', unit: 'ream', currentQuantity: 2, minimumQuantity: 10, category: { id: 1, name: 'Office' } },
      { id: 2, name: 'Uncategorized item', unit: null, currentQuantity: 0, minimumQuantity: 5, category: null },
    ];
    render(<LowStockSuppliesWidget supplies={supplies} totalLowStockCount={2} />);

    expect(screen.getByText('Paper')).toBeInTheDocument();
    expect(screen.getByText('2/10 ream')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized item')).toBeInTheDocument();
    expect(screen.getByText('ไม่มีหมวดหมู่')).toBeInTheDocument();
  });

  it('navigates to /dashboard/supplies when "ดูทั้งหมด" is clicked', async () => {
    const user = userEvent.setup();
    render(<LowStockSuppliesWidget supplies={[]} totalLowStockCount={0} />);
    await user.click(screen.getByText('ดูทั้งหมด'));
    expect(push).toHaveBeenCalledWith('/dashboard/supplies');
  });
});
