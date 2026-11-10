// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users } from 'lucide-react';
import StatCard from './StatCard';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('StatCard', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('renders title, value, and subtext', () => {
    render(
      <StatCard
        title="Total Users"
        value={42}
        subtext="active this month"
        icon={Users}
        borderColor="border-blue-500"
        bgColor="bg-blue-50"
        iconColor="text-blue-600"
      />
    );

    expect(screen.getByText('Total Users')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('active this month')).toBeInTheDocument();
  });

  it('renders a string value as-is', () => {
    render(
      <StatCard
        title="Status"
        value="OK"
        subtext="system"
        icon={Users}
        borderColor="border-green-500"
        bgColor="bg-green-50"
        iconColor="text-green-600"
      />
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('navigates when clicked and href is provided', async () => {
    const user = userEvent.setup();
    render(
      <StatCard
        title="Tasks"
        value={5}
        subtext="pending"
        icon={Users}
        borderColor="border-blue-500"
        bgColor="bg-blue-50"
        iconColor="text-blue-600"
        href="/dashboard/tasks"
      />
    );

    await user.click(screen.getByText('Tasks'));
    expect(push).toHaveBeenCalledWith('/dashboard/tasks');
  });

  it('does not navigate when no href is provided', async () => {
    const user = userEvent.setup();
    render(
      <StatCard
        title="Tasks"
        value={5}
        subtext="pending"
        icon={Users}
        borderColor="border-blue-500"
        bgColor="bg-blue-50"
        iconColor="text-blue-600"
      />
    );

    await user.click(screen.getByText('Tasks'));
    expect(push).not.toHaveBeenCalled();
  });
});
