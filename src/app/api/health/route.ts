/**
 * ==================================================
 * Health Check API - ตรวจสอบสถานะระบบ
 * ==================================================
 * Endpoint สำหรับตรวจสอบสถานะของระบบทั้งหมด
 * ใช้สำหรับ Monitoring และ Load Balancer Health Checks
 * 
 * GET /api/health - Basic health check
 * GET /api/health/detailed - Detailed system status
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger'

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime: number;
      message?: string;
    };
    memory: {
      status: 'healthy' | 'unhealthy' | 'warning';
      used: number;
      total: number;
      percentage: number;
    };
    uptime: {
      status: 'healthy';
      seconds: number;
    };
  };
}

const START_TIME = Date.now();
const VERSION = process.env.npm_package_version || '1.0.0';

/**
 * ตรวจสอบสถานะฐานข้อมูล
 */
async function checkDatabase(): Promise<HealthStatus['checks']['database']> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'healthy',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    logger.error('Health check - Database connection failed', { error });
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: 'Database connection failed',
    };
  }
}

/**
 * ตรวจสอบสถานะ Memory
 */
function checkMemory(): HealthStatus['checks']['memory'] {
  const used = process.memoryUsage();
  const total = used.heapTotal;
  const usedMemory = used.heapUsed;
  const percentage = Math.round((usedMemory / total) * 100);
  
  let status: 'healthy' | 'unhealthy' | 'warning' = 'healthy';
  if (percentage > 90) {
    status = 'unhealthy';
  } else if (percentage > 75) {
    status = 'warning';
  }
  
  return {
    status,
    used: Math.round(usedMemory / 1024 / 1024), // MB
    total: Math.round(total / 1024 / 1024), // MB
    percentage,
  };
}

/**
 * GET /api/health
 * Basic health check สำหรับ Load Balancer
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get('detailed') === 'true';
  
  try {
    // Basic health check - ตรวจสอบ database เท่านั้น
    const dbCheck = await checkDatabase();
    
    if (!detailed) {
      // Simple response for load balancers
      if (dbCheck.status === 'healthy') {
        return NextResponse.json(
          { status: 'healthy', timestamp: new Date().toISOString() },
          { status: 200 }
        );
      } else {
        return NextResponse.json(
          { status: 'unhealthy', timestamp: new Date().toISOString() },
          { status: 503 }
        );
      }
    }
    
    // Detailed health check
    const memoryCheck = checkMemory();
    const uptime = Math.floor((Date.now() - START_TIME) / 1000);
    
    // Determine overall status
    let overallStatus: HealthStatus['status'] = 'healthy';
    if (dbCheck.status === 'unhealthy') {
      overallStatus = 'unhealthy';
    } else if (memoryCheck.status === 'warning' || memoryCheck.status === 'unhealthy') {
      overallStatus = 'degraded';
    }
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: VERSION,
      checks: {
        database: dbCheck,
        memory: memoryCheck,
        uptime: {
          status: 'healthy',
          seconds: uptime,
        },
      },
    };
    
    const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
    
    logger.info('Health check completed', { status: overallStatus });
    
    return NextResponse.json(healthStatus, { status: statusCode });
    
  } catch (error) {
    logger.error('Health check failed', { error });
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check execution failed',
      },
      { status: 503 }
    );
  }
}
