/**
 * ==================================================
 * Prisma Client Singleton
 * ==================================================
 * ไฟล์นี้สร้าง Prisma Client instance แบบ singleton
 * เพื่อป้องกันการสร้างหลาย instance ใน development mode
 * 
 * การใช้งาน:
 * import { prisma } from '@/lib/prisma';
 * const users = await prisma.user.findMany();
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// ประกาศ global variable สำหรับเก็บ PrismaClient instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// สร้าง PrismaClient instance หรือใช้ instance ที่มีอยู่แล้ว
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

// เก็บ instance ไว้ใน global สำหรับ development mode
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * ฟังก์ชันสำหรับตรวจสอบการเชื่อมต่อฐานข้อมูล
 * @returns {Promise<boolean>} true หากเชื่อมต่อสำเร็จ
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    // ทดสอบการเชื่อมต่อด้วยการ query ง่ายๆ
    await prisma.$queryRaw`SELECT 1`;
    logger.info('เชื่อมต่อฐานข้อมูลสำเร็จ');
    return true;
  } catch (error) {
    logger.error('ไม่สามารถเชื่อมต่อฐานข้อมูลได้', { error });
    return false;
  }
}

/**
 * ฟังก์ชันสำหรับปิดการเชื่อมต่อฐานข้อมูล
 * ใช้เมื่อต้องการปิดแอปพลิเคชัน
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('ปิดการเชื่อมต่อฐานข้อมูลแล้ว');
}
