/**
 * ==================================================
 * API Route: POST /api/users/import
 * ==================================================
 * API สำหรับ Import รายชื่อพนักงานจาก CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { canAssignRole } from '@/lib/user-policy';
import { initialSetupFlags } from '@/lib/security-setup';
import { hashPassword } from '@/lib/security';
import { logger } from '@/lib/logger';

/**
 * แยกข้อมูล CSV เป็น array
 */
function parseCSV(csvText: string): string[][] {
  const lines = csvText.trim().split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  });
}

/**
 * ตรวจสอบความถูกต้องของอีเมล
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/users/import
 * Import รายชื่อพนักงานจาก CSV
 * 
 * Request Body:
 * - file: CSV file
 * 
 * CSV Format:
 * name,email,username,role,department
 * สมชาย ใจดี,somchai@example.com,somchai,EMPLOYEE,Development
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     imported: number,
 *     errors: string[]
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบการเข้าสู่ระบบ
    const authResult = await requireAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { success: false, error: authResult.error, message: authResult.message },
        { status: authResult.status }
      );
    }

    // ตรวจสอบสิทธิ์ (เฉพาะ ADMIN และ SUPER_ADMIN)
    if (!['ADMIN', 'SUPER_ADMIN'].includes(authResult.user!.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'FORBIDDEN',
          message: 'คุณไม่มีสิทธิ์ import พนักงาน',
        },
        { status: 403 }
      );
    }

    // อ่านข้อมูลจาก form
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_FILE',
          message: 'กรุณาเลือกไฟล์ CSV',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบประเภทไฟล์
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_FILE_TYPE',
          message: 'รองรับเฉพาะไฟล์ CSV เท่านั้น',
        },
        { status: 400 }
      );
    }

    // อ่านเนื้อหาไฟล์
    const csvText = await file.text();
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: 'EMPTY_FILE',
          message: 'ไฟล์ CSV ว่างเปล่าหรือไม่มีข้อมูล',
        },
        { status: 400 }
      );
    }

    // ตรวจสอบ header
    const headers = rows[0].map(h => h.toLowerCase().trim());
    const requiredFields = ['name', 'email', 'username'];
    const missingFields = requiredFields.filter(f => !headers.includes(f));

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'MISSING_FIELDS',
          message: `ไฟล์ CSV ต้องมีคอลัมน์: ${requiredFields.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // หาตำแหน่งของแต่ละคอลัมน์
    const nameIndex = headers.indexOf('name');
    const emailIndex = headers.indexOf('email');
    const usernameIndex = headers.indexOf('username');
    const roleIndex = headers.indexOf('role');
    const departmentIndex = headers.indexOf('department');

    // รหัสผ่านเริ่มต้นสำหรับพนักงานที่ import
    const defaultPassword = await hashPassword('password123');

    // ตัวเลือก role ที่ valid
    const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DIRECTOR', 'EMPLOYEE', 'HR'];

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // ประมวลผลแต่ละแถว
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      
      if (row.length < 3) {
        results.errors.push(`แถวที่ ${i + 1}: ข้อมูลไม่ครบ`);
        continue;
      }

      const name = row[nameIndex]?.trim();
      const email = row[emailIndex]?.trim();
      const username = row[usernameIndex]?.trim();
      const role = row[roleIndex]?.trim().toUpperCase() || 'EMPLOYEE';
      const department = row[departmentIndex]?.trim() || '';

      // ตรวจสอบข้อมูลที่จำเป็น
      if (!name || !email || !username) {
        results.errors.push(`แถวที่ ${i + 1}: ชื่อ, อีเมล หรือชื่อผู้ใช้ว่างเปล่า`);
        continue;
      }

      // ตรวจสอบรูปแบบอีเมล
      if (!isValidEmail(email)) {
        results.errors.push(`แถวที่ ${i + 1}: รูปแบบอีเมลไม่ถูกต้อง (${email})`);
        continue;
      }

      // ตรวจสอบ role
      if (!validRoles.includes(role)) {
        results.errors.push(`แถวที่ ${i + 1}: ตำแหน่งไม่ถูกต้อง (${role})`);
        continue;
      }

      // ADMIN นำเข้าบัญชีระดับ ADMIN/SUPER_ADMIN ไม่ได้ (กันยกระดับสิทธิ์ผ่านไฟล์นำเข้า)
      if (!canAssignRole(authResult.user!.role, role)) {
        results.errors.push(`แถวที่ ${i + 1}: ไม่มีสิทธิ์กำหนดบทบาท ${role} (เฉพาะ Super Admin)`);
        continue;
      }

      try {
        // ตรวจสอบว่าอีเมลหรือ username ซ้ำหรือไม่
        const existingUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email },
              { username },
            ],
          },
        });

        if (existingUser) {
          results.skipped++;
          continue;
        }

        // สร้าง avatar จากชื่อ
        const names = name.split(' ');
        const avatar = (names[0][0] + (names[1]?.[0] || '')).toUpperCase();

        // สร้างผู้ใช้ใหม่
        await prisma.user.create({
          data: {
            name,
            email,
            username,
            password: defaultPassword,
            // รหัสผ่านเริ่มต้นร่วมกัน: ต้องเปลี่ยนเองตอนล็อกอินครั้งแรก + ลงทะเบียน passkey + หมดอายุถ้าไม่ตั้งค่าภายใน 7 วัน
            ...initialSetupFlags(),
            role: role as any,
            department: department || null,
            avatar: avatar || name[0],
            isActive: true,
          },
        });

        results.imported++;
      } catch (error) {
        results.errors.push(`แถวที่ ${i + 1}: ${error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      message: `Import สำเร็จ: ${results.imported} รายการ, ข้าม: ${results.skipped} รายการ`,
    });

  } catch (error) {
    logger.error('Import users error', { error });
    return NextResponse.json(
      {
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'เกิดข้อผิดพลาดภายในระบบ',
      },
      { status: 500 }
    );
  }
}
