'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Download, Loader2, X, Inbox } from 'lucide-react';
import { cn, safeGetGregorianYear } from '@/lib/utils';
import { DocumentRegister, DocumentDirection, DocumentCategory, User } from '@/types';
import { useCurrentUser } from '@/contexts/UserContext';

// ============================================
// Config
// ============================================

const DIRECTION_CONFIG: Record<DocumentDirection, { label: string; bg: string; text: string }> = {
  RECEIVE: { label: 'หนังสือเข้า', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  SEND: { label: 'หนังสือออก', bg: 'bg-blue-100', text: 'text-blue-700' },
};

const DOCUMENT_CATEGORY_CONFIG: Record<DocumentCategory, { label: string; bg: string; text: string }> = {
  MEMO: { label: 'บันทึกข้อความ', bg: 'bg-amber-100', text: 'text-amber-700' },
  EXTERNAL_LETTER: { label: 'หนังสือภายนอก', bg: 'bg-violet-100', text: 'text-violet-700' },
  PW_NEWS: { label: 'พว.แจ้งข่าว', bg: 'bg-cyan-100', text: 'text-cyan-700' },
  VEHICLE_SUPPORT_REQUEST: { label: 'ขอรับสนับสนุนยานพาหนะ', bg: 'bg-rose-100', text: 'text-rose-700' },
  REFRESHMENT_SUPPORT_REQUEST: { label: 'ขอรับสนับสนุนอาหารว่าง', bg: 'bg-lime-100', text: 'text-lime-700' },
};

const OTHER_SENTINEL = '__OTHER__';

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
  if (!d) return '';
  return new Date(d).toISOString().split('T')[0];
}

function adminDisplayName(u: User) {
  return (u.prefix || '') + u.name;
}

// ============================================
// Default form
// ============================================

function defaultDocumentForm() {
  return {
    date: '',
    subject: '',
    direction: 'RECEIVE' as DocumentDirection,
    category: 'MEMO' as DocumentCategory,
    documentNumber: '',
    recipientName: '',
    senderName: '',
    remarks: '',
    senderChoice: '',
    recipientChoice: '',
  };
}

// ============================================
// Main Page
// ============================================

export default function DocumentsPageClient() {
  const { role: userRole } = useCurrentUser();
  const [documents, setDocuments] = useState<DocumentRegister[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState<DocumentDirection | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | ''>('');

  // Create/Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<DocumentRegister | null>(null);
  const [formData, setFormData] = useState(defaultDocumentForm());
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Export modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDirection, setExportDirection] = useState<'all' | DocumentDirection>('all');
  const [exportCategory, setExportCategory] = useState<'all' | DocumentCategory>('all');
  const [exportPeriod, setExportPeriod] = useState<'day' | 'week' | 'month' | 'custom'>('month');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const canManage = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);

  const adminUsers = useMemo(() => users
    .filter(u => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN')
    .sort((a, b) => a.name.localeCompare(b.name, 'th')), [users]);

  // ----------------------------------------
  // Fetch
  // ----------------------------------------

  const fetchAll = useCallback(async () => {
    try {
      const [docsRes, usersRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/users?isActive=true'),
      ]);
      const docsData = await docsRes.json();
      const usersData = await usersRes.json();

      if (docsData.success) setDocuments(docsData.data);
      if (usersData.success) setUsers(usersData.data);
    } catch {
      setError('ไม่สามารถดึงข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ----------------------------------------
  // Filtered
  // ----------------------------------------

  const filteredDocuments = useMemo(() => documents.filter(d => {
    if (directionFilter && d.direction !== directionFilter) return false;
    if (categoryFilter && d.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return d.subject.toLowerCase().includes(q) ||
        (d.documentNumber || '').toLowerCase().includes(q) ||
        (d.recipientName || '').toLowerCase().includes(q) ||
        (d.senderName || '').toLowerCase().includes(q);
    }
    return true;
  }), [documents, directionFilter, categoryFilter, searchQuery]);

  // ----------------------------------------
  // CRUD
  // ----------------------------------------

  function openCreateModal() {
    setEditingDoc(null);
    setFormData(defaultDocumentForm());
    setFormError(null);
    setIsModalOpen(true);
  }

  function choiceForName(name: string) {
    if (!name) return '';
    return adminUsers.some(u => adminDisplayName(u) === name) ? name : OTHER_SENTINEL;
  }

  function openEditModal(d: DocumentRegister) {
    setEditingDoc(d);
    const senderName = d.senderName ?? '';
    const recipientName = d.recipientName ?? '';
    setFormData({
      date: toDateInputValue(d.date),
      subject: d.subject,
      direction: d.direction,
      category: d.category ?? 'MEMO',
      documentNumber: d.documentNumber ?? '',
      recipientName,
      senderName,
      remarks: d.remarks ?? '',
      senderChoice: choiceForName(senderName),
      recipientChoice: choiceForName(recipientName),
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      const payload = {
        date: formData.date,
        subject: formData.subject,
        direction: formData.direction,
        category: formData.category,
        documentNumber: formData.documentNumber || null,
        recipientName: formData.recipientName || null,
        senderName: formData.senderName || null,
        remarks: formData.remarks || null,
      };

      const url = editingDoc ? `/api/documents/${editingDoc.id}` : '/api/documents';
      const method = editingDoc ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      if (editingDoc) {
        setDocuments(prev => prev.map(d => d.id === editingDoc.id ? data.data : d));
      } else {
        setDocuments(prev => [data.data, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('ยืนยันการลบเอกสารนี้?')) return;
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) setDocuments(prev => prev.filter(d => d.id !== id));
  }

  // ----------------------------------------
  // Export
  // ----------------------------------------

  async function handleExport() {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (exportDirection !== 'all') params.set('direction', exportDirection);
      if (exportCategory !== 'all') params.set('category', exportCategory);
      params.set('period', exportPeriod);
      if (exportPeriod === 'custom') {
        if (exportStartDate) params.set('startDate', exportStartDate);
        if (exportEndDate) params.set('endDate', exportEndDate);
      }

      const res = await fetch(`/api/documents/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export ล้มเหลว');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
      a.download = match ? decodeURIComponent(match[1]) : 'document_register.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      setIsExportModalOpen(false);
    } catch {
      alert('เกิดข้อผิดพลาดในการ Export กรุณาลองใหม่อีกครั้ง');
    } finally {
      setExportLoading(false);
    }
  }

  // ----------------------------------------
  // Render
  // ----------------------------------------

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">หนังสือเข้า-ออก</h1>
          <p className="text-slate-500 mt-1 text-sm">ทะเบียนบันทึกเอกสารรับเข้า-ส่งออกของหน่วยงาน</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm transition-colors">
            <Download size={16} /> Export
          </button>
          {canManage && (
            <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm transition-colors shadow-sm">
              <Plus size={16} /> บันทึกเอกสาร
            </button>
          )}
        </div>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{error}</div>}

      {/* Direction tabs */}
      <div className="flex border-b border-slate-200">
        {([['', 'ทั้งหมด'], ['RECEIVE', 'หนังสือเข้า'], ['SEND', 'หนังสือออก']] as const).map(([dir, label]) => {
          const count = dir === '' ? documents.length : documents.filter(d => d.direction === dir).length;
          return (
            <button key={dir} onClick={() => setDirectionFilter(dir as DocumentDirection | '')}
              className={cn(
                'px-6 py-3 text-sm font-medium border-b-2 transition-colors',
                directionFilter === dir
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}>
              {label}
              <span className={cn('ml-2 px-2 py-0.5 rounded-full text-xs', directionFilter === dir ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
          <input type="text" placeholder="ค้นหาเรื่อง, เลขที่เอกสาร, ผู้รับ, ผู้ส่ง..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="off" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as DocumentCategory | '')}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">ทุกประเภทเอกสาร</option>
          {(Object.entries(DOCUMENT_CATEGORY_CONFIG) as [DocumentCategory, typeof DOCUMENT_CATEGORY_CONFIG[DocumentCategory]][]).map(([cat, cfg]) => (
            <option key={cat} value={cat}>{cfg.label}</option>
          ))}
        </select>
        {categoryFilter && (
          <button onClick={() => setCategoryFilter('')} className="px-3 py-1 rounded-full text-xs text-slate-500 border border-slate-200 hover:bg-slate-50">
            ล้างตัวกรอง ×
          </button>
        )}
        <span className="text-sm text-slate-500">{filteredDocuments.length} รายการ</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-600">ลำดับ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">วันที่</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">เลขที่เอกสาร</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">เรื่อง</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">ประเภท</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">ชื่อผู้ส่ง</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">ชื่อผู้รับ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">หมายเหตุ</th>
                {canManage && <th className="text-center py-3 px-4 font-semibold text-slate-600">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="py-12 text-center text-slate-400">
                    <Inbox className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    ไม่มีรายการเอกสาร
                  </td>
                </tr>
              ) : filteredDocuments.map((d, i) => {
                const catCfg = d.category ? DOCUMENT_CATEGORY_CONFIG[d.category] : null;
                return (
                  <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4 text-slate-500">{i + 1}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDate(d.date)}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-xs">{d.documentNumber || '-'}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{d.subject}</div>
                    </td>
                    <td className="py-3 px-4">
                      {catCfg ? (
                        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', catCfg.bg, catCfg.text)}>
                          {catCfg.label}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{d.senderName || '-'}</td>
                    <td className="py-3 px-4 text-slate-600">{d.recipientName || '-'}</td>
                    <td className="py-3 px-4 text-slate-500 text-xs max-w-[200px] truncate">{d.remarks || '-'}</td>
                    {canManage && (
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEditModal(d)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-xs" title="แก้ไข">
                            แก้ไข
                          </button>
                          <button onClick={() => handleDelete(d.id)} className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 text-xs" title="ลบ">
                            ลบ
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Create/Edit Modal ===== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editingDoc ? 'แก้ไขเอกสาร' : 'บันทึกเอกสารใหม่'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{formError}</div>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ประเภทของหนังสือ *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(Object.entries(DOCUMENT_CATEGORY_CONFIG) as [DocumentCategory, typeof DOCUMENT_CATEGORY_CONFIG[DocumentCategory]][]).map(([cat, cfg]) => (
                    <button key={cat} type="button" onClick={() => setFormData(p => ({ ...p, category: cat }))}
                      className={cn('py-2 rounded-lg border text-sm font-medium transition-colors',
                        formData.category === cat ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50')}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ทิศทาง *</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.entries(DIRECTION_CONFIG) as [DocumentDirection, typeof DIRECTION_CONFIG[DocumentDirection]][]).map(([dir, cfg]) => (
                    <button key={dir} type="button" onClick={() => setFormData(p => ({ ...p, direction: dir }))}
                      className={cn('py-2 rounded-lg border text-sm font-medium transition-colors',
                        formData.direction === dir ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50')}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">วันที่ *</label>
                  <input required type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่เอกสาร</label>
                  <input value={formData.documentNumber} onChange={e => setFormData(p => ({ ...p, documentNumber: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เช่น ผบ.นสค.ที่ 123/2569" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">เรื่อง *</label>
                <input required value={formData.subject} onChange={e => setFormData(p => ({ ...p, subject: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ระบุเรื่อง" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้ส่ง</label>
                  <select value={formData.senderChoice}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(p => ({ ...p, senderChoice: val, senderName: val === OTHER_SENTINEL ? '' : val }));
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- ไม่ระบุ --</option>
                    {adminUsers.map(u => <option key={u.id} value={adminDisplayName(u)}>{adminDisplayName(u)}</option>)}
                    <option value={OTHER_SENTINEL}>อื่นๆ (พิมพ์เอง)</option>
                  </select>
                  {formData.senderChoice === OTHER_SENTINEL && (
                    <input value={formData.senderName} onChange={e => setFormData(p => ({ ...p, senderName: e.target.value }))}
                      placeholder="พิมพ์ชื่อ-นามสกุล" autoFocus
                      className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้รับ</label>
                  <select value={formData.recipientChoice}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(p => ({ ...p, recipientChoice: val, recipientName: val === OTHER_SENTINEL ? '' : val }));
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- ไม่ระบุ --</option>
                    {adminUsers.map(u => <option key={u.id} value={adminDisplayName(u)}>{adminDisplayName(u)}</option>)}
                    <option value={OTHER_SENTINEL}>อื่นๆ (พิมพ์เอง)</option>
                  </select>
                  {formData.recipientChoice === OTHER_SENTINEL && (
                    <input value={formData.recipientName} onChange={e => setFormData(p => ({ ...p, recipientName: e.target.value }))}
                      placeholder="พิมพ์ชื่อ-นามสกุล" autoFocus
                      className="mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <textarea rows={2} value={formData.remarks} onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                <button type="submit" disabled={formLoading} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400 flex items-center justify-center gap-2">
                  {formLoading && <Loader2 size={14} className="animate-spin" />}
                  {editingDoc ? 'บันทึก' : 'บันทึกเอกสาร'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Export Modal ===== */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Download size={18} className="text-indigo-600" />
                <h2 className="font-bold text-slate-800">Export ทะเบียนรับ-ส่งเอกสาร</h2>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ช่วงเวลา</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([['day', 'วันนี้'], ['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['custom', 'กำหนดเอง']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setExportPeriod(val)}
                      className={cn('py-2 rounded-lg border text-sm font-medium transition-colors',
                        exportPeriod === val
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {exportPeriod === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">จากวันที่</label>
                    <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">ถึงวันที่</label>
                    <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ทิศทาง</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([['all', 'ทั้งหมด'], ['RECEIVE', 'หนังสือเข้า'], ['SEND', 'หนังสือออก']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setExportDirection(val)}
                      className={cn('py-2 rounded-lg border text-sm font-medium transition-colors',
                        exportDirection === val
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ประเภทเอกสาร</label>
                <select value={exportCategory} onChange={e => setExportCategory(e.target.value as 'all' | DocumentCategory)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="all">ทั้งหมด</option>
                  {(Object.entries(DOCUMENT_CATEGORY_CONFIG) as [DocumentCategory, typeof DOCUMENT_CATEGORY_CONFIG[DocumentCategory]][]).map(([cat, cfg]) => (
                    <option key={cat} value={cat}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setIsExportModalOpen(false)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleExport}
                disabled={exportLoading || (exportPeriod === 'custom' && (!exportStartDate || !exportEndDate))}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                {exportLoading
                  ? <><Loader2 size={14} className="animate-spin" /> กำลัง Export...</>
                  : <><Download size={14} /> Export Excel</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
