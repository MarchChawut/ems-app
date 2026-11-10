import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Role } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { setupTestDatabase } from '../tests/helpers/with-test-db';
import { runSeed } from './seed-lib';
import { verifyPassword } from '../src/lib/security';
import { FEATURES } from '../src/lib/features';

setupTestDatabase();

const PW = 'Correct-Horse-Battery-9';
const env = (extra: Record<string, string> = {}) => ({ NODE_ENV: 'test', ...extra }) as unknown as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('runSeed — ติดตั้งใหม่', () => {
  it('สร้างผู้ใช้ 1 คนเท่านั้น เป็น SUPER_ADMIN ที่ต้องเปลี่ยนรหัสผ่าน และไม่มีข้อมูลส่วนบุคคล', async () => {
    const r = await runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW }));
    expect(r.freshInstall).toBe(true);
    expect(r.adminCreated).toBe(true);
    expect(r.generatedPassword).toBeNull();

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    const u = users[0];
    expect(u.username).toBe('admin');
    expect(u.role).toBe(Role.SUPER_ADMIN);
    expect(u.mustChangePassword).toBe(true);
    expect(u.initialPasswordExpiresAt).not.toBeNull();
    expect(u.email).toBeNull();
    expect(u.phone).toBeNull();
    expect(u.birthday).toBeNull();
    expect(await verifyPassword(PW, u.password)).toBe(true);
  });

  it('ปิดฟีเจอร์เสริมทั้งหมด (ยกเว้นแจ้งเตือน LINE ที่ไม่อยู่ในรายการปิด)', async () => {
    await runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW }));
    const rows = await prisma.featureSetting.findMany();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.enabled === false)).toBe(true);
    expect(rows.some((x) => x.featureKey === 'notifications')).toBe(false);
  });

  it('SEED_ENABLE_ALL_FEATURES=true → ไม่ปิดฟีเจอร์ใดเลย', async () => {
    await runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW, SEED_ENABLE_ALL_FEATURES: 'true' }));
    expect(await prisma.featureSetting.count()).toBe(0);
    expect(FEATURES.length).toBeGreaterThan(0);
  });

  it('ใช้ค่า SEED_ADMIN_* ที่ตั้งไว้', async () => {
    await runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW, SEED_ADMIN_USERNAME: 'root.it', SEED_ADMIN_NAME: 'ผู้ดูแล ทดสอบ', SEED_ADMIN_EMAIL: 'it@example.test' }));
    const u = await prisma.user.findFirstOrThrow();
    expect(u).toMatchObject({ username: 'root.it', name: 'ผู้ดูแล ทดสอบ', email: 'it@example.test' });
  });

  it('ไม่ตั้งรหัสผ่านนอก production → สุ่มรหัสให้ (≥12 ตัว) และคืนค่าครั้งเดียว', async () => {
    const r = await runSeed(prisma, env());
    expect(r.generatedPassword).toBeTruthy();
    expect(r.generatedPassword!.length).toBeGreaterThanOrEqual(12);
    const u = await prisma.user.findFirstOrThrow();
    expect(await verifyPassword(r.generatedPassword!, u.password)).toBe(true);
  });
});

describe('runSeed — การป้องกัน', () => {
  it('production ไม่มีรหัสผ่านหรือสั้นเกินไป → throw และไม่สร้างผู้ใช้', async () => {
    await expect(runSeed(prisma, env({ NODE_ENV: 'production' }))).rejects.toThrow();
    await expect(runSeed(prisma, env({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: 'short' }))).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });

  it('username/อีเมลผิดรูปแบบ → throw ก่อนเขียนฐานข้อมูล', async () => {
    await expect(runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW, SEED_ADMIN_USERNAME: 'a b;' }))).rejects.toThrow();
    await expect(runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW, SEED_ADMIN_EMAIL: 'not-an-email' }))).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.featureSetting.count()).toBe(0);
  });
});

describe('runSeed — รันซ้ำ / ระบบที่ใช้งานอยู่แล้ว', () => {
  it('รันซ้ำ → ยังมี 1 คน และไม่ทับชื่อ/รหัสผ่านที่แก้แล้ว', async () => {
    await runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW }));
    const before = await prisma.user.findFirstOrThrow();
    await prisma.user.update({ where: { id: before.id }, data: { name: 'ชื่อที่แก้เอง', mustChangePassword: false } });

    const r = await runSeed(prisma, env({ SEED_ADMIN_PASSWORD: 'Another-Password-123' }));
    expect(r.adminCreated).toBe(false);
    expect(r.freshInstall).toBe(false);
    expect(await prisma.user.count()).toBe(1);
    const after = await prisma.user.findFirstOrThrow();
    expect(after.name).toBe('ชื่อที่แก้เอง');
    expect(after.mustChangePassword).toBe(false);
    expect(after.password).toBe(before.password);
  });

  it('ฐานข้อมูลที่มีผู้ใช้อยู่แล้ว → ไม่ปิดฟีเจอร์ใด และไม่ทับผู้ใช้เดิมที่ username ซ้ำ', async () => {
    await prisma.user.create({
      data: { username: 'admin', password: 'existing-hash', name: 'ผู้ใช้เดิม', role: Role.EMPLOYEE, avatar: 'ผ' },
    });
    const r = await runSeed(prisma, env({ SEED_ADMIN_PASSWORD: PW }));
    expect(r.freshInstall).toBe(false);
    expect(r.adminCreated).toBe(false);
    expect(await prisma.featureSetting.count()).toBe(0);
    const u = await prisma.user.findFirstOrThrow();
    expect(u).toMatchObject({ name: 'ผู้ใช้เดิม', role: Role.EMPLOYEE, password: 'existing-hash' });
  });
});
