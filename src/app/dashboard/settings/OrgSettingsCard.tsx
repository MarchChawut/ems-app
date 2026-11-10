/**
 * การ์ดตั้งค่า "ข้อมูลหน่วยงาน" — แก้ชื่อสังกัด/ชื่อกองหลักที่เดียว ใช้เป็นหัวกระดาษและผู้รับของทุกแบบฟอร์ม
 * และเป็นค่าเริ่มต้นของพนักงาน (ผู้ช่วยราชการที่มีสังกัด/กองของตัวเองไม่ถูกแก้)
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrg } from '@/contexts/OrgContext';
import { ORG_DEPARTMENT_MAX, ORG_DIVISION_MAX } from '@/lib/org-settings';

export default function OrgSettingsCard() {
  const org = useOrg();
  const router = useRouter();
  const [divisionName, setDivisionName] = useState(org.divisionName);
  const [departmentName, setDepartmentName] = useState(org.departmentName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const changed = divisionName.trim() !== org.divisionName || departmentName.trim() !== org.departmentName;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/org-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ divisionName, departmentName }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'บันทึกไม่สำเร็จ');
      const updated = (result.meta?.divisionUsers ?? 0) + (result.meta?.departmentUsers ?? 0);
      setMessage({
        type: 'success',
        text: updated > 0 ? `บันทึกแล้ว — อัปเดตข้อมูลพนักงานตามชื่อใหม่ (${updated} รายการ)` : 'บันทึกแล้ว',
      });
      router.refresh(); // ให้ layout โหลดชื่อใหม่ไปยังทุกหน้า/แบบฟอร์ม
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex items-start gap-4">
        <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center text-sky-600 shrink-0">
          <Building2 size={24} />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-800">ข้อมูลหน่วยงาน</h2>
          <p className="text-sm text-slate-500 mt-1">
            ชื่อสังกัดและชื่อกองหลัก ใช้เป็นหัวกระดาษ ผู้รับ และตำแหน่งผู้อำนวยการในแบบฟอร์มทั้งหมด และเป็นค่าเริ่มต้นของพนักงาน
            แก้ที่นี่ที่เดียว
          </p>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            'mx-6 mt-4 p-3 rounded-lg text-sm',
            message.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border border-rose-200 text-rose-600'
          )}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อสังกัด</label>
          <input
            value={divisionName}
            onChange={(e) => setDivisionName(e.target.value)}
            required
            maxLength={ORG_DIVISION_MAX}
            placeholder="เช่น ศูนย์เทคโนโลยีดิจิทัล หน่วยราชการในพระองค์"
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">ชื่อกอง</label>
          <input
            value={departmentName}
            onChange={(e) => setDepartmentName(e.target.value)}
            required
            maxLength={ORG_DEPARTMENT_MAX}
            placeholder="เช่น กองการศึกษา วิจัย และพัฒนา"
            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-400 mt-1">ใส่คำว่า &quot;กอง&quot; นำหน้าด้วย</p>
        </div>
        <p className="text-xs text-slate-500">
          เมื่อบันทึก พนักงานที่ใช้ชื่อเดิมอยู่จะถูกเปลี่ยนเป็นชื่อใหม่อัตโนมัติ (ผู้ช่วยราชการที่ตั้งสังกัด/กองของตนเองไม่เปลี่ยน)
          และเอกสารที่พิมพ์หลังจากนี้ รวมถึงการพิมพ์เอกสารเก่าซ้ำ จะใช้ชื่อใหม่
        </p>
        <button
          type="submit"
          disabled={saving || !changed}
          className={cn(
            'flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg',
            'hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200',
            'disabled:bg-indigo-300 disabled:cursor-not-allowed'
          )}
        >
          {saving && <Loader2 size={18} className="animate-spin" />}
          <span>บันทึกข้อมูลหน่วยงาน</span>
        </button>
      </form>
    </div>
  );
}
