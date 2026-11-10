import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { setupTestDatabase } from '@tests/helpers/with-test-db';
import { loginAsNewUser } from '@tests/helpers/auth';
import { prisma } from '@/lib/prisma';

setupTestDatabase();

function req() {
  return new NextRequest('http://localhost:3000/api/dashboard');
}

describe('GET /api/dashboard', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('aggregates counts across users/leaves/tasks/assets/supplies', async () => {
    const user = await loginAsNewUser('MANAGER');
    await prisma.leave.create({
      data: { userId: user.id, type: 'SICK', status: 'PENDING', startDate: new Date(), endDate: new Date(), reason: 'x', totalDays: 1 },
    });
    await prisma.supply.create({ data: { name: 'Low', type: 'STOCK', currentQuantity: 1, minimumQuantity: 5 } });
    await prisma.asset.create({ data: { name: 'InUse', status: 'IN_USE' } });
    await prisma.asset.create({ data: { name: 'InRepair', status: 'IN_REPAIR' } });

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stats.pendingLeaves).toBe(1);
    expect(body.data.stats.lowStockCount).toBe(1);
    expect(body.data.stats.assetsInUse).toBe(1);
    expect(body.data.stats.assetsInRepair).toBe(1);
    expect(body.data.lowStockSupplies).toHaveLength(1);
  });

  it('reports overdue checkouts (expectedReturnAt in the past, not yet returned)', async () => {
    const manager = await loginAsNewUser('MANAGER');
    const asset = await prisma.asset.create({ data: { name: 'Overdue asset', status: 'IN_USE' } });
    await prisma.assetCheckout.create({
      data: {
        assetId: asset.id,
        holderId: manager.id,
        issuedById: manager.id,
        expectedReturnAt: new Date(Date.now() - 86400000),
      },
    });

    const res = await GET(req());
    const body = await res.json();
    expect(body.data.stats.overdueCheckoutsCount).toBe(1);
    expect(body.data.overdueCheckouts).toHaveLength(1);
  });

  it('breaks down tasksByColumn per seeded kanban column', async () => {
    const user = await loginAsNewUser('MANAGER'); // แดชบอร์ดระดับกอง — EMPLOYEE เข้าไม่ได้
    const column = await prisma.kanbanColumn.findFirstOrThrow();
    await prisma.task.create({ data: { title: 'x', priority: 'LOW', columnId: column.id, assigneeId: user.id } });

    const res = await GET(req());
    const body = await res.json();
    const columnStat = body.data.stats.tasksByColumn.find((c: { columnId: number }) => c.columnId === column.id);
    expect(columnStat.count).toBe(1);
  });
});
