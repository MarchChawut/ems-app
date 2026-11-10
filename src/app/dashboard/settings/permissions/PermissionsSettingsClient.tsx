'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/types';
import { useLoadMore, type LoadMoreMeta } from '@/hooks/useLoadMore';

const PERMISSION_LABELS: Record<string, string> = {
  'leaves.approve': 'อนุมัติ/ปฏิเสธการลา',
  'employees.manage': 'จัดการข้อมูลพนักงาน',
  'supplies.manage': 'จัดการวัสดุ',
  'assets.manage': 'จัดการครุภัณฑ์',
  'documents.manage': 'จัดการหนังสือเข้า-ออก',
  'forms.manage_templates': 'สร้าง/แก้ไขแบบฟอร์ม',
  'forms.approve': 'อนุมัติ/ปฏิเสธแบบฟอร์ม',
  'forms.request_vehicle': 'ขอใช้รถยนต์ (ใบขอรับการสนับสนุนรถยนต์)',
  'org.manage': 'แก้ไขชื่อสังกัด/ชื่อกอง (ข้อมูลหน่วยงาน)',
  'permissions.manage': 'จัดการสิทธิ์การใช้งาน',
  'tasks.manage_folders': 'สร้างแฟ้มงานเก็บถาวร',
  'roster.manage': 'จัดการตารางเวรประจำกอง (เพิ่ม/แก้ไข/ลบ)',
};

const USERS_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_USERS_META: LoadMoreMeta = { total: 0, limit: USERS_PAGE_SIZE, hasMore: false };

interface UserGrants {
  role: string;
  roleDefaults: string[];
  overrides: { permissionKey: string; granted: boolean }[];
}

export default function PermissionsSettingsClient() {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [grants, setGrants] = useState<UserGrants | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isLoadingGrants, setIsLoadingGrants] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // skip คำนวณจากจำนวนแถวที่มีอยู่จริงเสมอ (ดู useLoadMore) - แปลงเป็น page ตอนเรียก /api/users
  // เพราะหน้านี้ไม่มีการเพิ่มผู้ใช้ใหม่แบบ optimistic ระหว่างเลื่อนดู จึง skip เป็นทวีคูณของ limit เสมอ ปลอดภัย
  function fetchUsersPage(skip: number, limit: number) {
    const page = Math.floor(skip / limit) + 1;
    return fetch(`/api/users?page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearch)}`)
      .then((r) => r.json())
      .then((result) => (result.success ? { items: result.data as User[], meta: result.meta as LoadMoreMeta } : null));
  }

  const {
    items: users,
    meta: usersMeta,
    isLoadingMore: isLoadingMoreUsers,
    loadMore: loadMoreUsers,
    reset: resetUsers,
  } = useLoadMore<User>([], EMPTY_USERS_META, fetchUsersPage);

  // debounce: รอผู้ใช้หยุดพิมพ์ 300ms ก่อนค่อยอัปเดต debouncedSearch (ตัวที่ใช้ยิง API จริง)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // โหลด permission catalog ครั้งเดียว (ไม่ผูกกับ search/pagination)
  useEffect(() => {
    fetch('/api/permissions')
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setCatalog(result.data.catalog);
        else setError(result.message || 'ไม่สามารถดึงข้อมูลได้');
      })
      .catch(() => setError('ไม่สามารถดึงข้อมูลได้'));
  }, []);

  // ค้นหาใหม่ (debouncedSearch เปลี่ยน) = โหลดหน้าแรกใหม่ทั้งหมด ไม่ต่อท้าย
  // - เคลียร์ selectedUserId กันเลือกพนักงานที่หลุดจากผลค้นหาใหม่ค้างอยู่
  // - ใช้ AbortController ยกเลิก request เดิมที่ยังค้างอยู่ กันกรณี response ของคำค้นหาเก่ามาถึงหลัง
  //   คำค้นหาใหม่ (เช่น เครือข่ายช้าไม่เท่ากัน) แล้วทับผลลัพธ์ที่ถูกต้องกว่าด้วยของเก่า
  useEffect(() => {
    setSelectedUserId(null);
    setIsLoadingUsers(true);
    const controller = new AbortController();

    fetch(`/api/users?page=1&limit=${USERS_PAGE_SIZE}&search=${encodeURIComponent(debouncedSearch)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((result) => {
        if (result.success) resetUsers(result.data, result.meta);
        else setError(result.message || 'ไม่สามารถดึงข้อมูลได้');
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('ไม่สามารถดึงข้อมูลได้');
      })
      .finally(() => setIsLoadingUsers(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    if (!selectedUserId) return;
    setIsLoadingGrants(true);
    setGrants(null);
    fetch(`/api/permissions/user/${selectedUserId}`)
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setGrants(result.data);
        else setError(result.message || 'ไม่สามารถดึงข้อมูลสิทธิ์ได้');
      })
      .catch(() => setError('ไม่สามารถดึงข้อมูลสิทธิ์ได้'))
      .finally(() => setIsLoadingGrants(false));
  }, [selectedUserId]);

  const isAdminRole = grants?.role === 'ADMIN' || grants?.role === 'SUPER_ADMIN';

  function stateOf(key: string): 'grant' | 'revoke' {
    const override = grants?.overrides.find((o) => o.permissionKey === key);
    return override?.granted ? 'grant' : 'revoke';
  }

  async function setGrant(key: string, granted: boolean) {
    if (!selectedUserId) return;
    setSavingKey(key);
    try {
      const res = await fetch(`/api/permissions/user/${selectedUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionKey: key, granted }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      setGrants((prev) => {
        if (!prev) return prev;
        const overrides = prev.overrides.filter((o) => o.permissionKey !== key);
        overrides.push({ permissionKey: key, granted });
        return { ...prev, overrides };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">จัดการสิทธิ์การใช้งาน</h1>
        <p className="text-slate-500 mt-1 text-sm">
          กำหนดสิทธิ์เพิ่มเติม/ตัดสิทธิ์เป็นรายบุคคล — Admin/Super Admin มีสิทธิ์ทุกอย่างเสมอ ไม่ต้องตั้งค่า
        </p>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* รายชื่อผู้ใช้ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden lg:col-span-1">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาพนักงาน..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {isLoadingUsers ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-indigo-600" /></div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">ไม่พบพนักงาน</div>
            ) : (
              <>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className={cn(
                      'w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors',
                      selectedUserId === u.id && 'bg-indigo-50 hover:bg-indigo-50'
                    )}
                  >
                    <div className="text-sm font-medium text-slate-700 truncate">{u.name}</div>
                    <div className="text-xs text-slate-400">@{u.username} · {u.role}</div>
                  </button>
                ))}
                {usersMeta.hasMore && (
                  <div className="p-2 flex justify-center">
                    <button
                      onClick={loadMoreUsers}
                      disabled={isLoadingMoreUsers}
                      className="flex items-center gap-2 px-4 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {isLoadingMoreUsers && <Loader2 size={14} className="animate-spin" />}
                      โหลดเพิ่ม
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ตารางสิทธิ์ของผู้ใช้ที่เลือก */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden lg:col-span-2">
          {!selectedUserId ? (
            <div className="p-12 text-center text-slate-400">
              <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              เลือกพนักงานทางซ้ายเพื่อดู/แก้ไขสิทธิ์
            </div>
          ) : isLoadingGrants ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
          ) : isAdminRole ? (
            <div className="p-12 text-center text-slate-400">
              ผู้ใช้นี้เป็น {grants?.role} มีสิทธิ์การใช้งานทุกอย่างในระบบอยู่แล้ว ไม่ต้องตั้งค่าเพิ่ม
            </div>
          ) : grants ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-2.5 px-4 font-semibold text-slate-600">สิทธิ์</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-slate-600 w-24">ให้สิทธิ์</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-slate-600 w-24">ตัดสิทธิ์</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.map((key) => {
                  const state = stateOf(key);
                  const isSaving = savingKey === key;
                  return (
                    <tr key={key}>
                      <td className="py-2.5 px-4 text-slate-700">{PERMISSION_LABELS[key] ?? key}</td>
                      <td className="text-center px-3">
                        <input
                          type="radio"
                          checked={state === 'grant'}
                          disabled={isSaving}
                          onChange={() => setGrant(key, true)}
                        />
                      </td>
                      <td className="text-center px-3">
                        <input
                          type="radio"
                          checked={state === 'revoke'}
                          disabled={isSaving}
                          onChange={() => setGrant(key, false)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}
