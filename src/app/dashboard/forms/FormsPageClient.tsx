'use client';

import React, { useMemo, useState } from 'react';
import { FileSignature, Loader2, X, Printer, Pencil, Trash2, Check } from 'lucide-react';
import { cn, safeGetGregorianYear } from '@/lib/utils';
import { FormRequest, FormTemplateConfig } from '@/types';
import { useCurrentUser } from '@/contexts/UserContext';
import { isOtherSelected, OTHER_OPTION, OTHER_FIELD_PARENTS, VEHICLE_HIDDEN_FIELD_KEYS, VEHICLE_USER_FIELD_SOURCES, VEHICLE_PERSON_FIELDS, VEHICLE_POSITIVE_INT_KEYS, COORDINATOR_OTHER, buildRequesterSnapshot, type RequesterSourceUser } from '@/lib/vehicle-request';
import { hasPermission, canUseFormTemplate, PERMISSIONS } from '@/lib/permissions';
import { useLoadMore, type LoadMoreMeta } from '@/hooks/useLoadMore';
import FormRequestPrintModal from '@/components/forms/FormRequestPrintModal';

// ============================================
// Helpers
// ============================================

function formatDate(d: Date | string | null | undefined) {
  if (!d) return '-';
  const date = new Date(d);
  const correctedYear = safeGetGregorianYear(date);
  if (correctedYear !== date.getFullYear()) {
    date.setFullYear(correctedYear);
  }
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toDateInputValue(d: Date | string | null | undefined) {
  if (!d) return new Date().toISOString().split('T')[0];
  return new Date(d).toISOString().split('T')[0];
}

/** ค่าที่เติมลงช่องตามคนที่เลือกเป็น "ข้าพเจ้า" (สังกัดส่วนราชการ/ฝ่าย และ แผนก ไม่มีในระบบ ให้กรอกเอง) */
function requesterAutofill(user: RequesterSourceUser): Record<string, string> {
  const s = buildRequesterSnapshot(user);
  return { requesterPosition: s.position, division: s.division, bureau: s.bureau, phone: s.phone, section: s.section };
}

/** key ของฟิลด์ชื่อ (เช่น coordinator) → key ของ dropdown คนที่คุมมัน (coordinatorUserId) */
function personIdKeyOfName(nameKey: string): string | undefined {
  return Object.keys(VEHICLE_PERSON_FIELDS).find((k) => VEHICLE_PERSON_FIELDS[k].nameKey === nameKey);
}

function defaultFieldValues(template: FormTemplateConfig): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of template.fields) values[field.key] = '';
  return values;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'รอพิจารณา', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'อนุมัติแล้ว', className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'ไม่อนุมัติ', className: 'bg-rose-100 text-rose-700' },
};

interface FormsPageClientProps {
  initialTemplates: FormTemplateConfig[];
  initialFormRequests: FormRequest[];
  initialMeta: LoadMoreMeta;
  /** รายชื่อที่เลือกเป็น "ข้าพเจ้า" ได้ (ใบขอรถยนต์) — admin ทุกคน, คนอื่นเฉพาะตัวเอง */
  requesterOptions: (RequesterSourceUser & { id: number })[];
  /** รายชื่อ ผบ.ชา. (MANAGER/DIRECTOR) สำหรับช่องผู้อนุมัติการใช้รถ */
  approverOptions: (RequesterSourceUser & { id: number })[];
  /** รายชื่อผู้ประสานงาน (คนในกอง) พร้อมเบอร์โทร */
  coordinatorOptions: (RequesterSourceUser & { id: number })[];
}

async function fetchFormRequestsPage(skip: number, limit: number) {
  const res = await fetch(`/api/form-requests?skip=${skip}&limit=${limit}`);
  const result = await res.json();
  if (!result.success) return null;
  return { items: result.data as FormRequest[], meta: result.meta as LoadMoreMeta };
}

// ============================================
// Main Page
// ============================================

export default function FormsPageClient({ initialTemplates, initialFormRequests, initialMeta, requesterOptions, approverOptions, coordinatorOptions }: FormsPageClientProps) {
  const currentUser = useCurrentUser();
  const canViewAll = ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUser.role);
  const canApprove = canViewAll || hasPermission(currentUser, PERMISSIONS.FORMS_APPROVE);

  // ข้อมูลเริ่มต้นโหลดมาจาก server (page.tsx) แล้ว ไม่ต้อง fetch ใหม่ตอน mount
  // ซ่อนแบบฟอร์มที่ผู้ใช้ไม่มีสิทธิ์ใช้ (เช่น ใบขอรถยนต์ ต้องมีสิทธิ์ forms.request_vehicle) — server ตรวจซ้ำอีกชั้นเสมอ
  const [templates] = useState<FormTemplateConfig[]>(() =>
    initialTemplates.filter((t) => canUseFormTemplate(currentUser, t.systemKey))
  );
  const {
    items: formRequests,
    setItems: setFormRequests,
    meta,
    setMeta,
    isLoadingMore,
    error,
    loadMore,
  } = useLoadMore<FormRequest>(initialFormRequests, initialMeta, fetchFormRequestsPage);

  // Fill modal
  const [isFillModalOpen, setIsFillModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [editingRequest, setEditingRequest] = useState<FormRequest | null>(null);
  const [requestDate, setRequestDate] = useState(toDateInputValue(null));
  const [documentNumber, setDocumentNumber] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  // ฟิลด์แบบ checkbox (เลือกได้หลายค่า) เก็บแยกเป็น string[]
  const [checkValues, setCheckValues] = useState<Record<string, string[]>>({});
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Print/preview modal
  const [previewRequest, setPreviewRequest] = useState<FormRequest | null>(null);

  const sortedRequests = useMemo(
    () => [...formRequests].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [formRequests]
  );

  // ----------------------------------------
  // Modal open/close
  // ----------------------------------------

  /** ค่าปัจจุบันของช่องหลัก (checkbox เก็บใน checkValues, ช่องอื่นใน fieldValues) */
  function parentValue(parentKey: string): unknown {
    return parentKey in checkValues ? checkValues[parentKey] : fieldValues[parentKey];
  }

  function openFillModal(template: FormTemplateConfig) {
    setSelectedTemplateId(template.id);
    setEditingRequest(null);
    setRequestDate(toDateInputValue(null));
    setDocumentNumber('');
    const defaults = defaultFieldValues(template);
    // ใบขอรถยนต์: เลือกชื่อตัวเองให้ก่อนและเติมตำแหน่ง/กอง/กรมตามข้อมูลผู้ใช้
    const self = requesterOptions.find((u) => u.id === currentUser.id);
    if (self && template.fields.some((f) => f.inputType === 'user')) {
      Object.assign(defaults, requesterAutofill(self), { requesterUserId: String(self.id) });
      // ผู้จัดทำเอกสาร: เลือกตัวเองให้ก่อน (เติมเบอร์ให้) เปลี่ยนได้
      const selfAsPerson = coordinatorOptions.find((u) => u.id === self.id);
      if (selfAsPerson && template.fields.some((f) => f.key === 'submitterUserId')) {
        Object.assign(defaults, { submitterUserId: String(self.id), submitterPhone: buildRequesterSnapshot(selfAsPerson).phone });
      }
    }
    setFieldValues(defaults);
    setCheckValues({});
    setFormError(null);
    setIsFillModalOpen(true);
  }

  function openEditModal(fr: FormRequest) {
    if (!fr.template) return;
    setSelectedTemplateId(fr.template.id);
    setEditingRequest(fr);
    setRequestDate(toDateInputValue(fr.requestDate));
    setDocumentNumber(fr.documentNumber ?? '');
    const data = (fr.data ?? {}) as unknown as Record<string, unknown>;
    const values: Record<string, string> = {};
    const checks: Record<string, string[]> = {};
    for (const field of fr.template.fields) {
      const v = data[field.key];
      if (field.inputType === 'checkbox') {
        checks[field.key] = Array.isArray(v) ? v.map(String) : [];
        values[field.key] = '';
        continue;
      }
      values[field.key] = v === null || v === undefined ? '' : String(v);
    }
    // ช่องเลือก + "อื่นๆ": ถ้าค่าที่เคยบันทึกไม่อยู่ในตัวเลือกปัจจุบันแล้ว (เช่น แอดมินเปลี่ยนชื่อสังกัด) แสดงเป็น "อื่นๆ" + ข้อความเดิม
    // เพื่อไม่ให้ค่าเก่าหาย/ตรวจไม่ผ่านตอนบันทึกใหม่
    for (const [otherKey, parentKey] of Object.entries(OTHER_FIELD_PARENTS)) {
      const parent = fr.template.fields.find((f) => f.key === parentKey);
      if (!parent || parent.inputType !== 'select') continue;
      const current = values[parentKey];
      if (current && current !== OTHER_OPTION && !(parent.options ?? []).includes(current)) {
        values[otherKey] = values[otherKey] || current;
        values[parentKey] = OTHER_OPTION;
      }
    }
    // ผู้ประสานงาน: ไม่มี id แต่มีชื่อ (กรอกเอง/ใบเก่า) = เลือก "อื่นๆ"
    for (const [idKey, { nameKey }] of Object.entries(VEHICLE_PERSON_FIELDS)) {
      if (!values[idKey] && values[nameKey]) values[idKey] = COORDINATOR_OTHER;
    }
    setFieldValues(values);
    setCheckValues(checks);
    setFormError(null);
    setIsFillModalOpen(true);
  }

  function closeFillModal() {
    setIsFillModalOpen(false);
    setSelectedTemplateId(null);
    setEditingRequest(null);
  }

  // ----------------------------------------
  // Submit
  // ----------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplateId) return;
    const template = templates.find((t) => t.id === selectedTemplateId) ?? editingRequest?.template;
    if (!template) return;
    setFormLoading(true);
    setFormError(null);
    try {
      const data: Record<string, unknown> = {};
      for (const field of template.fields) {
        if (field.inputType === 'checkbox') {
          const picked = checkValues[field.key] ?? [];
          data[field.key] = picked.length > 0 ? picked : null;
          continue;
        }
        if (VEHICLE_PERSON_FIELDS[field.key] && fieldValues[field.key] === COORDINATOR_OTHER) { data[field.key] = null; continue; }
        // ชื่อผู้ประสานงาน/ผู้จัดทำ: ส่งเฉพาะกรณี "อื่นๆ" (เลือกจากรายชื่อ เซิร์ฟเวอร์เติมชื่อให้)
        if (personIdKeyOfName(field.key) && fieldValues[personIdKeyOfName(field.key)!] !== COORDINATOR_OTHER) { data[field.key] = null; continue; }
        const parentKey = OTHER_FIELD_PARENTS[field.key];
        if (parentKey && !isOtherSelected(parentValue(parentKey))) { data[field.key] = null; continue; }
        const raw = fieldValues[field.key] ?? '';
        if (raw === '') { data[field.key] = null; continue; }
        data[field.key] = field.inputType === 'number' || field.inputType === 'user' ? Number(raw) : raw;
      }

      const payload = {
        templateId: template.id,
        requestDate,
        documentNumber: documentNumber || null,
        data,
      };

      const url = editingRequest ? `/api/form-requests/${editingRequest.id}` : '/api/form-requests';
      const method = editingRequest ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      if (editingRequest) {
        setFormRequests(prev => prev.map(fr => fr.id === editingRequest.id ? result.data : fr));
      } else {
        setFormRequests(prev => [result.data, ...prev]);
        setMeta((prev) => ({ ...prev, total: prev.total + 1 }));
      }
      closeFillModal();
      setPreviewRequest(result.data);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('ยืนยันการลบแบบฟอร์มนี้?')) return;
    const res = await fetch(`/api/form-requests/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setFormRequests(prev => prev.filter(fr => fr.id !== id));
      setMeta((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
    } else {
      alert(data.message || 'ลบไม่สำเร็จ');
    }
  }

  async function handleStatusChange(id: number, status: 'APPROVED' | 'REJECTED') {
    const res = await fetch(`/api/form-requests/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const result = await res.json();
    if (result.success) setFormRequests(prev => prev.map(fr => fr.id === id ? result.data : fr));
    else alert(result.message || 'ดำเนินการไม่สำเร็จ');
  }

  // ----------------------------------------
  // Render
  // ----------------------------------------

  const activeTemplate = selectedTemplateId
    ? templates.find((t) => t.id === selectedTemplateId) ?? editingRequest?.template ?? null
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">แบบฟอร์ม</h1>
        <p className="text-slate-500 mt-1 text-sm">กรอกข้อมูลแล้วบันทึก/พิมพ์เอกสารขอใช้บริการภายในหน่วยงาน</p>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{error}</div>}

      {/* เลือกแบบฟอร์ม */}
      {templates.length === 0 ? (
        <div className="p-6 bg-white rounded-xl border border-slate-200 text-center text-slate-400 text-sm">
          ยังไม่มีแบบฟอร์มให้เลือก {isAdmin && '— ไปที่ ตั้งค่า > สร้าง/แก้ไขแบบฟอร์ม เพื่อเพิ่มแบบฟอร์มแรก'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {templates.map(template => (
            <button
              key={template.id}
              onClick={() => openFillModal(template)}
              className="flex flex-col items-start gap-2 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FileSignature size={20} />
              </div>
              <div className="font-semibold text-slate-800 text-sm">{template.menuTitle}</div>
              <div className="text-xs text-slate-400">กรอกข้อมูล → บันทึก + พิมพ์ PDF</div>
            </button>
          ))}
        </div>
      )}

      {/* ประวัติ */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-700 text-sm">ประวัติแบบฟอร์ม</h2>
          <span className="text-xs text-slate-400">{sortedRequests.length} / {meta.total} รายการ</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-600">วันที่สร้าง</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">ประเภทแบบฟอร์ม</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">วันที่ในแบบฟอร์ม</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">เลขที่หนังสือ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">สถานะ</th>
                {canViewAll && <th className="text-left py-3 px-4 font-semibold text-slate-600">ผู้ขอ</th>}
                <th className="text-center py-3 px-4 font-semibold text-slate-600">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRequests.length === 0 ? (
                <tr>
                  <td colSpan={canViewAll ? 7 : 6} className="py-12 text-center text-slate-400">
                    <FileSignature className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    ยังไม่มีแบบฟอร์มที่บันทึกไว้
                  </td>
                </tr>
              ) : sortedRequests.map(fr => {
                const badge = fr.status ? STATUS_BADGE[fr.status] : null;
                return (
                  <tr key={fr.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDate(fr.createdAt)}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                        {fr.template?.menuTitle ?? '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDate(fr.requestDate)}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-xs">{fr.documentNumber || '-'}</td>
                    <td className="py-3 px-4">
                      {badge ? (
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', badge.className)}>
                          {badge.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">-</span>
                      )}
                    </td>
                    {canViewAll && (
                      <td className="py-3 px-4 text-slate-600">
                        {fr.requestedBy ? `${fr.requestedBy.prefix ?? ''}${fr.requestedBy.name}` : '-'}
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setPreviewRequest(fr)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="ดู/พิมพ์">
                          <Printer size={14} />
                        </button>
                        {canApprove && fr.status === 'PENDING' && (
                          <>
                            <button onClick={() => handleStatusChange(fr.id, 'APPROVED')} className="p-1.5 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600" title="อนุมัติ">
                              <Check size={14} />
                            </button>
                            <button onClick={() => handleStatusChange(fr.id, 'REJECTED')} className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="ไม่อนุมัติ">
                              <X size={14} />
                            </button>
                          </>
                        )}
                        {isAdmin && (
                          <>
                            <button onClick={() => openEditModal(fr)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="แก้ไข">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(fr.id)} className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="ลบ">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {meta.hasMore && (
          <div className="p-3 border-t border-slate-100 flex justify-center">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-2 px-4 py-1.5 text-sm text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
            >
              {isLoadingMore && <Loader2 size={14} className="animate-spin" />}
              โหลดเพิ่ม
            </button>
          </div>
        )}
      </div>

      {/* ===== Fill Modal ===== */}
      {isFillModalOpen && activeTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">
                {editingRequest ? `แก้ไข${activeTemplate.menuTitle}` : activeTemplate.menuTitle}
              </h2>
              <button onClick={closeFillModal} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{formError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">วันที่ *</label>
                  <input required type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่หนังสือ</label>
                  <input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)}
                    placeholder="กรอกภายหลังได้"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {activeTemplate.fields.filter(field => !VEHICLE_HIDDEN_FIELD_KEYS.includes(field.key) && (!personIdKeyOfName(field.key) || fieldValues[personIdKeyOfName(field.key)!] === COORDINATOR_OTHER) && (!OTHER_FIELD_PARENTS[field.key] || isOtherSelected(parentValue(OTHER_FIELD_PARENTS[field.key])))).map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {field.label}{field.required || OTHER_FIELD_PARENTS[field.key] || personIdKeyOfName(field.key) ? ' *' : ''}
                  </label>
                  {field.inputType === 'user' ? (() => {
                    const source = VEHICLE_USER_FIELD_SOURCES[field.key];
                    const isApprover = source === 'approver';
                    const isCoordinator = source === 'coordinator';
                    const options = isApprover ? approverOptions : isCoordinator ? coordinatorOptions : requesterOptions;
                    return (
                    <select
                      required={field.required}
                      value={fieldValues[field.key] ?? ''}
                      disabled={source === 'requester' && options.length <= 1 && !!fieldValues[field.key]}
                      onChange={e => {
                        const picked = options.find(u => String(u.id) === e.target.value);
                        setFieldValues(p => ({
                          ...p,
                          [field.key]: e.target.value,
                          ...(isCoordinator
                            // เลือกคน → เติมเบอร์; "อื่นๆ"/ว่าง → ล้างเบอร์ให้กรอกเอง
                            ? { [VEHICLE_PERSON_FIELDS[field.key]?.phoneKey ?? 'coordinatorPhone']: picked ? buildRequesterSnapshot(picked).phone : '' }
                            : picked
                              ? isApprover
                                ? { approverPosition: buildRequesterSnapshot(picked).position }
                                : requesterAutofill(picked)
                              : {}),
                        }));
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    >
                      <option value="">-- เลือกชื่อ --</option>
                      {options.map(u => (
                        <option key={u.id} value={u.id}>{`${u.prefix ?? ''}${u.name}`}</option>
                      ))}
                      {isCoordinator && <option value={COORDINATOR_OTHER}>อื่นๆ</option>}
                    </select>
                    );
                  })() : field.inputType === 'select' ? (
                    <select
                      required={field.required}
                      value={fieldValues[field.key] ?? ''}
                      onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- เลือก --</option>
                      {(field.options ?? []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.inputType === 'checkbox' ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-slate-300 px-3 py-2">
                      {(field.options ?? []).map(opt => {
                        const picked = checkValues[field.key] ?? [];
                        return (
                          <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={picked.includes(opt)}
                              onChange={e =>
                                setCheckValues(p => ({
                                  ...p,
                                  [field.key]: e.target.checked
                                    ? [...(p[field.key] ?? []), opt]
                                    : (p[field.key] ?? []).filter(v => v !== opt),
                                }))
                              }
                            />
                            {opt}
                          </label>
                        );
                      })}
                    </div>
                  ) : field.inputType === 'textarea' ? (
                    <textarea
                      required={field.required}
                      value={fieldValues[field.key] ?? ''}
                      onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                      rows={3}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <input
                      required={field.required || !!OTHER_FIELD_PARENTS[field.key] || !!personIdKeyOfName(field.key)}
                      {...(VEHICLE_POSITIVE_INT_KEYS.includes(field.key) ? { min: 1, step: 1 } : {})}
                      type={field.inputType === 'number' ? 'number' : field.inputType === 'time' ? 'time' : field.inputType === 'date' ? 'date' : field.inputType === 'tel' ? 'tel' : 'text'}
                      value={fieldValues[field.key] ?? ''}
                      onChange={e => setFieldValues(p => ({ ...p, [field.key]: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={closeFillModal} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                <button type="submit" disabled={formLoading} className={cn('flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400 flex items-center justify-center gap-2')}>
                  {formLoading && <Loader2 size={14} className="animate-spin" />}
                  {editingRequest ? 'บันทึกการแก้ไข' : 'บันทึกแบบฟอร์ม'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Preview/Print Modal ===== */}
      {previewRequest && (
        <FormRequestPrintModal formRequest={previewRequest} onClose={() => setPreviewRequest(null)} />
      )}
    </div>
  );
}
