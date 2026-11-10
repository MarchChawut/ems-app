/**
 * ==================================================
 * Dashboard Shell - Sidebar และ Header (Client Component)
 * ==================================================
 * ส่วนที่ต้องมี interactivity ของ dashboard layout (ย่อ/ขยาย sidebar, เมนูมือถือ)
 * แยกออกมาจาก dashboard/layout.tsx เพื่อให้ layout เป็น Server Component ได้
 * (ดึง user ครั้งเดียวฝั่ง server แล้วส่ง user ลงมาเป็น prop)
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Calendar,
  Layout,
  LogOut,
  CheckCircle,
  Briefcase,
  Menu,
  X,
  Package,
  Monitor,
  Settings,
  Inbox,
  FileSignature,
  UserCircle,
  CalendarDays,
  ChevronDown,
} from 'lucide-react';
import { useFeatures } from '@/contexts/FeaturesContext';
import { FEATURES, type FeatureId } from '@/lib/features';
import { cn } from '@/lib/utils';
import { SessionUser, UserRole } from '@/types';
import { hasPermission, type PermissionKey } from '@/lib/permissions';

/** id เมนูที่ตรงกับฟีเจอร์ที่ปิดได้ (ดู src/lib/features.ts) — เมนูอื่น (พนักงาน/ข้อมูลส่วนตัว/ตั้งค่า) เป็นฟีเจอร์หลักปิดไม่ได้ */
const isToggleableFeature = (id: string) => FEATURES.some((f) => f.id === id);

/**
 * ข้อมูลเมนูใน Sidebar
 * requiredPermission: ไม่ใส่ = ทุกคนเห็น (พฤติกรรมเดิม) / ใส่ = ต้องมี permission นี้ (หรือเป็น admin) ถึงจะเห็น
 * hiddenForRoles: role ที่ระบุจะไม่เห็นเมนูนี้เลย (ใช้คู่กับการบล็อกฝั่ง server ที่หน้า/API จริง ไม่ใช่แค่ซ่อน UI)
 */
const menuItems: {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  href: string;
  requiredPermission?: PermissionKey;
  hiddenForRoles?: UserRole[];
  /** false = ไม่แสดงใน sidebar (ใช้เป็นชื่อหน้าเท่านั้น — เช่น ข้อมูลส่วนตัวอยู่ในเมนูรูปโปรไฟล์) */
  sidebar?: boolean;
}[] = [
  {
    id: 'dashboard',
    label: 'หน้าหลัก',
    icon: Layout,
    href: '/dashboard',
    hiddenForRoles: ['EMPLOYEE'],
  },
  {
    id: 'tasks',
    label: 'ติดตามงาน',
    icon: CheckCircle,
    href: '/dashboard/tasks',
  },
  {
    id: 'leaves',
    label: 'การลา',
    icon: Calendar,
    href: '/dashboard/leaves',
  },
  {
    id: 'roster',
    label: 'ตารางเวรประจำกอง',
    icon: CalendarDays,
    href: '/dashboard/roster',
  },
  {
    id: 'employees',
    label: 'พนักงาน',
    icon: Users,
    href: '/dashboard/employees',
    hiddenForRoles: ['EMPLOYEE'],
  },
  {
    id: 'supplies',
    label: 'วัสดุ',
    icon: Package,
    href: '/dashboard/supplies',
    hiddenForRoles: ['EMPLOYEE'],
  },
  {
    id: 'assets',
    label: 'ครุภัณฑ์',
    icon: Monitor,
    href: '/dashboard/assets',
    hiddenForRoles: ['EMPLOYEE'],
  },
  {
    id: 'documents',
    label: 'หนังสือเข้า-ออก',
    icon: Inbox,
    href: '/dashboard/documents',
    hiddenForRoles: ['EMPLOYEE'],
  },
  {
    id: 'forms',
    label: 'แบบฟอร์ม',
    icon: FileSignature,
    href: '/dashboard/forms',
  },
  {
    id: 'profile',
    label: 'ข้อมูลส่วนตัว',
    icon: UserCircle,
    href: '/dashboard/profile',
    sidebar: false,
  },
  {
    id: 'settings',
    label: 'ตั้งค่า',
    icon: Settings,
    href: '/dashboard/settings',
  },
];

/**
 * เมนูรูปโปรไฟล์ที่หัวหน้าหน้า: กดแล้วแสดง "ข้อมูลส่วนตัว" และ "ออกจากระบบ"
 * ปิดเมื่อกดนอกกรอบ / กด Esc / เลือกรายการ (a11y: aria-haspopup, aria-expanded, role=menu/menuitem)
 */
function UserMenu({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="เมนูผู้ใช้"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-full pl-2 pr-1 py-1 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-slate-700">{user.name}</p>
          <p className="text-xs text-slate-400 capitalize">{user.role}</p>
        </div>
        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
          {user.avatar || user.name.charAt(0)}
        </div>
        <ChevronDown size={16} className={cn('text-slate-400 transition-transform hidden sm:block', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="เมนูผู้ใช้"
          className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-30"
        >
          <div className="px-4 py-2 border-b border-slate-100 sm:hidden">
            <p className="text-sm font-medium text-slate-700 truncate">{user.name}</p>
            <p className="text-xs text-slate-400 capitalize">{user.role}</p>
          </div>
          <Link
            href="/dashboard/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <UserCircle size={18} className="text-slate-400" />
            ข้อมูลส่วนตัว
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
          >
            <LogOut size={18} />
            ออกจากระบบ
          </button>
        </div>
      )}
    </div>
  );
}

export default function DashboardShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // State สำหรับเปิด/ปิด Sidebar (บนมือถือ)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // State สำหรับย่อ/ขยาย Sidebar (บน desktop)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  /**
   * ฟังก์ชันออกจากระบบ
   */
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // หาเมนูปัจจุบัน (ใช้ menuItems เต็ม ไม่ filter เพื่อให้ title ถูกต้องแม้เมนูจะถูกซ่อนไว้)
  const isMenuActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
  const currentMenuItem = menuItems.find((item) => isMenuActive(item.href));
  const pageTitle = currentMenuItem?.label || 'แดชบอร์ด';

  // เมนูที่ผู้ใช้คนนี้เห็นได้จริง (ไม่ใส่ requiredPermission = เห็นทุกคนเหมือนเดิม)
  // + ฟีเจอร์ที่แอดมินปิดไว้ (หน้าตั้งค่า > ฟีเจอร์ของระบบ) ไม่แสดงในเมนู — id ของเมนูที่ไม่ใช่ฟีเจอร์ที่ปิดได้ผ่านเสมอ
  const { isEnabled } = useFeatures();
  const visibleMenuItems = menuItems.filter(
    (item) =>
      (!item.requiredPermission || hasPermission(user, item.requiredPermission)) &&
      !item.hiddenForRoles?.includes(user.role) &&
      item.sidebar !== false &&
      (!isToggleableFeature(item.id) || isEnabled(item.id as FeatureId))
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar - Desktop */}
      <aside
        className={cn(
          "bg-white border-r border-slate-200 transition-all duration-300",
          "hidden md:flex flex-col fixed h-full z-20 shadow-sm",
          isSidebarCollapsed ? 'w-20' : 'w-20 lg:w-64'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-slate-100 px-4 bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <Briefcase size={20} />
            </div>
            <span className={cn("whitespace-nowrap", isSidebarCollapsed ? "hidden" : "hidden lg:inline")}>
              EMS Admin
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {visibleMenuItems.map((item) => {
            const isActive = isMenuActive(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all",
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                )}
                title={item.label}
              >
                <item.icon size={20} className="shrink-0" />
                <span className={cn("whitespace-nowrap", isSidebarCollapsed ? "hidden" : "hidden lg:inline")}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

      </aside>

      {/* Sidebar - Mobile (Overlay) */}
      {isSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* Sidebar */}
          <aside className="fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 z-40 md:hidden flex flex-col shadow-xl">
            {/* Logo */}
            <div className="h-16 flex items-center justify-between border-b border-slate-100 px-4 bg-slate-50">
              <div className="flex items-center gap-2 font-bold text-xl text-indigo-600">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-indigo-200">
                  <Briefcase size={20} />
                </div>
                <span>EMS Admin</span>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
              {visibleMenuItems.map((item) => {
                const isActive = isMenuActive(item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsSidebarOpen(false)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all",
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    )}
                  >
                    <item.icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

          </aside>
        </>
      )}

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          "md:ml-20",
          !isSidebarCollapsed && "lg:ml-64"
        )}
      >
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md bg-white/90">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors md:hidden"
            >
              <Menu size={20} />
            </button>

            {/* Desktop Sidebar Toggle */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden md:block p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            >
              <Menu size={20} />
            </button>

            {/* Page Title */}
            <h1 className="text-lg font-semibold text-slate-700">
              {pageTitle}
            </h1>
          </div>

          {/* เมนูผู้ใช้ (กดรูปโปรไฟล์: ข้อมูลส่วนตัว / ออกจากระบบ) */}
          <UserMenu user={user} onLogout={handleLogout} />
        </header>

        {/* Content Area */}
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
