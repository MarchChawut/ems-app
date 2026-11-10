/**
 * ==================================================
 * Root Layout - โครงสร้างหลักของแอปพลิเคชัน
 * ==================================================
 * ไฟล์นี้กำหนดโครงสร้าง HTML และ providers หลักของแอปพลิเคชัน
 */

import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';

// นำเข้า Noto Sans Thai จาก Google Fonts
// หมายเหตุ: UI ของแอปเป็นภาษาไทยเป็นหลัก ต้องใช้ฟอนต์ที่มี subset thai จริง (ก่อนหน้านี้ใช้ Inter
// ซึ่งไม่มี glyph ภาษาไทยเลย ทำให้ข้อความไทยทั้งหมด fallback ไปฟอนต์ของระบบปฏิบัติการแทน)
const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  display: 'swap',
  variable: '--font-thai',
});

// ============================================
// Metadata ของแอปพลิเคชัน
// ============================================
export const metadata: Metadata = {
  title: 'EMS Admin - ระบบจัดการพนักงาน',
  description: 'ระบบบันทึกและจัดการพนักงานครบวงจร - Employee Management System',
  keywords: ['EMS', 'Employee Management', 'HR System', 'ระบบบุคคล'],
  authors: [{ name: 'EMS Team' }],
  creator: 'EMS Admin',
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'th_TH',
    url: '/',
    title: 'EMS Admin - ระบบจัดการพนักงาน',
    description: 'ระบบบันทึกและจัดการพนักงานครบวงจร',
    siteName: 'EMS Admin',
  },
  robots: {
    index: false, // ไม่ให้ search engine index (ระบบภายใน)
    follow: false,
  },
};

// ============================================
// Viewport Configuration
// ============================================
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

// ============================================
// Root Layout Component
// ============================================
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={notoSansThai.variable} suppressHydrationWarning>
      <head>
        {/* Security Headers ที่ไม่สามารถตั้งผ่าน next.config.js */}
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      </head>
      <body className={`${notoSansThai.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
