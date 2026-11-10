'use client';

import React, { useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FormTemplateConfig, FormFieldInputType } from '@/types';

const INPUT_TYPE_LABELS: Record<FormFieldInputType, string> = {
  text: 'ข้อความสั้น',
  textarea: 'ข้อความยาว',
  number: 'ตัวเลข',
  time: 'เวลา',
  date: 'วันที่',
  select: 'ตัวเลือก (dropdown)',
  checkbox: 'ติ๊กเลือกได้หลายข้อ',
  tel: 'เบอร์โทร',
  user: 'เลือกผู้ใช้ (ชื่อบุคคล)',
};

interface FieldDraft {
  key: string;
  label: string;
  inputType: FormFieldInputType;
  required: boolean;
  options: string; // comma-separated ในฟอร์ม แปลงเป็น array ตอนบันทึก
}

function emptyField(): FieldDraft {
  return { key: '', label: '', inputType: 'text', required: false, options: '' };
}

interface FormBuilderClientProps {
  initialTemplates: FormTemplateConfig[];
}

export default function FormBuilderClient({ initialTemplates }: FormBuilderClientProps) {
  const [templates, setTemplates] = useState<FormTemplateConfig[]>(initialTemplates);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FormTemplateConfig | null>(null);
  const [menuTitle, setMenuTitle] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [fields, setFields] = useState<FieldDraft[]>([emptyField()]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ข้อมูลเริ่มต้นโหลดมาจาก server (page.tsx) แล้ว - ใช้ตัวนี้แค่ refetch หลัง create/edit/delete/toggle
  const fetchTemplates = () => {
    setIsRefetching(true);
    fetch('/api/form-templates')
      .then((r) => r.json())
      .then((result) => {
        if (result.success) setTemplates(result.data);
        else setError(result.message || 'ไม่สามารถดึงข้อมูลได้');
      })
      .catch(() => setError('ไม่สามารถดึงข้อมูลได้'))
      .finally(() => setIsRefetching(false));
  };

  function openCreateEditor() {
    setEditingTemplate(null);
    setMenuTitle('');
    setDocumentTitle('');
    setFields([emptyField()]);
    setFormError(null);
    setIsEditorOpen(true);
  }

  function openEditEditor(template: FormTemplateConfig) {
    setEditingTemplate(template);
    setMenuTitle(template.menuTitle);
    setDocumentTitle(template.documentTitle);
    setFields(
      template.fields.map((f) => ({
        key: f.key,
        label: f.label,
        inputType: f.inputType,
        required: f.required,
        options: (f.options ?? []).join(', '),
      }))
    );
    setFormError(null);
    setIsEditorOpen(true);
  }

  function closeEditor() {
    setIsEditorOpen(false);
  }

  function updateField(index: number, patch: Partial<FieldDraft>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (fields.length === 0) {
      setFormError('ต้องมีอย่างน้อย 1 field');
      return;
    }
    const keys = fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      setFormError('key ของ field ต้องไม่ซ้ำกัน');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        menuTitle,
        documentTitle,
        fields: fields.map((f, i) => ({
          key: f.key,
          label: f.label,
          inputType: f.inputType,
          required: f.required,
          order: i,
          options: f.inputType === 'select' || f.inputType === 'checkbox'
            ? f.options.split(',').map((o) => o.trim()).filter(Boolean)
            : null,
        })),
      };

      const url = editingTemplate ? `/api/form-templates/${editingTemplate.id}` : '/api/form-templates';
      const method = editingTemplate ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      closeEditor();
      fetchTemplates();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(template: FormTemplateConfig) {
    const res = await fetch(`/api/form-templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !template.isActive }),
    });
    const result = await res.json();
    if (result.success) fetchTemplates();
    else alert(result.message || 'อัปเดตไม่สำเร็จ');
  }

  async function handleDelete(template: FormTemplateConfig) {
    if (!confirm(`ยืนยันการลบแบบฟอร์ม "${template.menuTitle}"?`)) return;
    const res = await fetch(`/api/form-templates/${template.id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) fetchTemplates();
    else alert(result.message || 'ลบไม่สำเร็จ (ถ้ามีข้อมูลส่งแล้ว ให้ปิดการใช้งานแทน)');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">สร้าง/แก้ไขแบบฟอร์ม</h1>
          <p className="text-slate-500 mt-1 text-sm">จัดการแบบฟอร์มที่พนักงานเลือกกรอกได้ในหน้า &quot;แบบฟอร์ม&quot;</p>
        </div>
        <button
          onClick={openCreateEditor}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          <Plus size={16} /> สร้างแบบฟอร์มใหม่
        </button>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{error}</div>}

      {isRefetching ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
          <FileSignature className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          ยังไม่มีแบบฟอร์ม
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div key={template.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 text-sm truncate">{template.menuTitle}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{template.fields.length} field{template.systemKey ? ' · แบบฟอร์มเดิม' : ''}</div>
                </div>
                <span
                  className={cn(
                    'shrink-0 px-2 py-0.5 rounded-full text-xs font-medium',
                    template.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {template.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-3">
                <button onClick={() => openEditEditor(template)} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-600">
                  <Pencil size={13} /> แก้ไข
                </button>
                <button onClick={() => toggleActive(template)} className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs text-slate-600">
                  {template.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </button>
                <button onClick={() => handleDelete(template)} className="px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Editor Modal ===== */}
      {isEditorOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editingTemplate ? 'แก้ไขแบบฟอร์ม' : 'สร้างแบบฟอร์มใหม่'}</h2>
              <button onClick={closeEditor} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{formError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อเมนู (แสดงบนการ์ดเลือกแบบฟอร์ม) *</label>
                  <input
                    required
                    value={menuTitle}
                    onChange={(e) => setMenuTitle(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อเรื่อง (พิมพ์บนเอกสาร) *</label>
                  <input
                    required
                    value={documentTitle}
                    onChange={(e) => setDocumentTitle(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Field ในแบบฟอร์ม</label>
                  <button
                    type="button"
                    onClick={() => setFields((prev) => [...prev, emptyField()])}
                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus size={13} /> เพิ่ม field
                  </button>
                </div>
                <div className="space-y-2">
                  {fields.map((field, i) => {
                    // key แก้ไม่ได้เฉพาะตอนแก้ template ที่มีคนส่งข้อมูลมาแล้วจริงๆ (ไม่ใช่แค่เคยมี field นี้อยู่)
                    const keyLocked =
                      Boolean(editingTemplate) &&
                      editingTemplate!.submissionCount > 0 &&
                      editingTemplate!.fields.some((f) => f.key === field.key);
                    return (
                      <div key={i} className="border border-slate-200 rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">ป้ายกำกับ *</label>
                            <input
                              required
                              value={field.label}
                              onChange={(e) => updateField(i, { label: e.target.value })}
                              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">
                              key (ห้ามซ้ำ){keyLocked && ' — แก้ไม่ได้ (มีข้อมูลส่งแล้ว)'}
                            </label>
                            <input
                              required
                              disabled={keyLocked}
                              value={field.key}
                              onChange={(e) => updateField(i, { key: e.target.value })}
                              placeholder="เช่น item_name (a-z, 0-9, _ เท่านั้น)"
                              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">ชนิดข้อมูล</label>
                            <select
                              value={field.inputType}
                              onChange={(e) => updateField(i, { inputType: e.target.value as FormFieldInputType })}
                              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {(Object.keys(INPUT_TYPE_LABELS) as FormFieldInputType[]).map((t) => (
                                <option key={t} value={t}>{INPUT_TYPE_LABELS[t]}</option>
                              ))}
                            </select>
                          </div>
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap pb-1.5">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateField(i, { required: e.target.checked })}
                              className="rounded"
                            />
                            บังคับกรอก
                          </label>
                        </div>
                        {(field.inputType === 'select' || field.inputType === 'checkbox') && (
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">ตัวเลือก (คั่นด้วย comma)</label>
                            <input
                              value={field.options}
                              onChange={(e) => updateField(i, { options: e.target.value })}
                              placeholder="เช่น รถตู้, รถเก๋ง, รถกระบะ"
                              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1 pt-1">
                          <button type="button" onClick={() => moveField(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30">
                            <ArrowUp size={14} />
                          </button>
                          <button type="button" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-30">
                            <ArrowDown size={14} />
                          </button>
                          <button type="button" onClick={() => removeField(i)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={closeEditor} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  บันทึกแบบฟอร์ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
