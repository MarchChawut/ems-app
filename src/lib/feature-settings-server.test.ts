import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
vi.mock('./prisma', () => ({ prisma: { featureSetting: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock('./logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { getFeatureSettings, clearFeatureCache, isFeatureEnabled } from './feature-settings-server';

describe('getFeatureSettings', () => {
  beforeEach(() => {
    findMany.mockReset();
    clearFeatureCache();
  });

  it('caches reads for a short time', async () => {
    findMany.mockResolvedValue([]);
    await getFeatureSettings();
    await getFeatureSettings();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('with nothing stored every feature is enabled', async () => {
    findMany.mockResolvedValue([]);
    expect(await isFeatureEnabled('leaves')).toBe(true);
  });

  it('on a DB error uses the last-known-good map (a disabled feature stays disabled)', async () => {
    findMany.mockResolvedValueOnce([{ featureKey: 'supplies', enabled: false }]);
    expect((await getFeatureSettings()).supplies.enabled).toBe(false);

    // ให้แคชหมดอายุโดยไม่ล้าง lastGood: จำลองด้วยเวลา
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    findMany.mockRejectedValueOnce(new Error('db down'));
    expect((await getFeatureSettings()).supplies.enabled).toBe(false);
    vi.useRealTimers();
  });

  it('with no previous good read, a DB error falls back to all-enabled (fail-open, logged)', async () => {
    findMany.mockRejectedValueOnce(new Error('db down'));
    const map = await getFeatureSettings();
    expect(map.leaves.enabled).toBe(true);
  });

  it('a read that started before clearFeatureCache cannot repopulate the cache with stale data', async () => {
    let release!: (rows: unknown[]) => void;
    findMany.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const slow = getFeatureSettings(); // เริ่มอ่านค่าเก่า
    clearFeatureCache(); // แอดมินแก้ค่าแล้วล้างแคช
    release([{ featureKey: 'supplies', enabled: true }]); // ค่าเก่ามาถึงทีหลัง
    await slow;

    findMany.mockResolvedValueOnce([{ featureKey: 'supplies', enabled: false }]);
    expect((await getFeatureSettings()).supplies.enabled).toBe(false); // ต้องอ่านใหม่ ไม่ใช้ค่าเก่าที่ค้าง
  });
});
