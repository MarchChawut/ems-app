'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
  Plus, Search, Download, Loader2, X, Monitor,
  FileText, History, Settings, Image as ImageIcon
} from 'lucide-react';
import { cn, safeGetGregorianYear } from '@/lib/utils';
import {
  Asset, AssetCategory, AssetCheckout, AssetStatus,
  AssetCondition, User
} from '@/types';
import { useCurrentUser } from '@/contexts/UserContext';

// ============================================
// Config
// ============================================

const STATUS_CONFIG: Record<AssetStatus, { label: string; bg: string; text: string }> = {
  AVAILABLE: { label: 'พร้อมใช้งาน', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  IN_USE:    { label: 'ถูกใช้งาน',   bg: 'bg-blue-100',    text: 'text-blue-700' },
  IN_REPAIR: { label: 'ส่งซ่อม',     bg: 'bg-amber-100',   text: 'text-amber-700' },
  RETURNED:  { label: 'ส่งคืนคลัง',  bg: 'bg-slate-100',   text: 'text-slate-500' },
  DISPOSED:  { label: 'ตัดจำหน่าย',  bg: 'bg-rose-100',    text: 'text-rose-700' },
};

const CONDITION_LABELS: Record<AssetCondition, string> = {
  EXCELLENT: 'ดีมาก', GOOD: 'ดี', FAIR: 'พอใช้', POOR: 'ไม่ดี', DAMAGED: 'เสียหาย',
};

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

function fmtPrice(n: number | null | undefined) {
  if (n == null) return '-';
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 }) + ' บาท';
}

function holderName(h: any) {
  if (!h) return '-';
  return (h.prefix || '') + h.name;
}

async function uploadDocument(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/uploads/document', { method: 'POST', body: fd });
  const data = await res.json();
  return data.success ? data.data.url : null;
}

// ============================================
// Default forms
// ============================================

function defaultAssetForm() {
  return {
    name: '', assetTag: '', serialNumber: '', model: '', brand: '',
    categoryId: '' as string | number,
    status: 'AVAILABLE' as AssetStatus, condition: 'GOOD' as AssetCondition,
    acquisitionDate: '', acquisitionCost: '' as string | number,
    documentNumber: '', documentUrl: '', imageUrl: '',
    location: '', department: '', notes: '',
    receiverName: '',
  };
}

function defaultCheckoutForm() {
  return { holderId: '' as string | number, issuedById: '' as string | number, expectedReturnAt: '', notes: '' };
}

// ============================================
// Main Page
// ============================================

export default function AssetsPageClient() {
  const { role: userRole } = useCurrentUser();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [formData, setFormData] = useState(defaultAssetForm());
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  // Checkout modal
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [checkoutAsset, setCheckoutAsset] = useState<Asset | null>(null);
  const [checkoutForm, setCheckoutForm] = useState(defaultCheckoutForm());
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // Active checkout id for return
  const [activeCheckoutId, setActiveCheckoutId] = useState<number | null>(null);

  // History modal
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyAsset, setHistoryAsset] = useState<(Asset & { checkouts?: AssetCheckout[] }) | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Inspection modal
  const [isInspectionOpen, setIsInspectionOpen] = useState(false);
  const [inspectionAsset, setInspectionAsset] = useState<Asset | null>(null);
  const [inspectionForm, setInspectionForm] = useState({ date: '', condition: '' as AssetCondition | '', inspector: '' });
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  // Autocomplete dropdowns for text fields
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);

  // Category modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catLoading, setCatLoading] = useState(false);

  const canManage = ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

  // ----------------------------------------
  // Fetch
  // ----------------------------------------

  const fetchAll = useCallback(async () => {
    try {
      const [assetsRes, catsRes, usersRes] = await Promise.all([
        fetch('/api/assets'),
        fetch('/api/asset-categories'),
        fetch('/api/users'),
      ]);
      const assetsData = await assetsRes.json();
      const catsData = await catsRes.json();
      const usersData = await usersRes.json();

      if (assetsData.success) setAssets(assetsData.data);
      if (catsData.success) setCategories(catsData.data);
      if (usersData.success) {
        const roleOrder: Record<string, number> = { SUPER_ADMIN: 0, ADMIN: 1, MANAGER: 2, DIRECTOR: 3, HR: 4, EMPLOYEE: 5 };
        const sorted = [...usersData.data].sort((a: User, b: User) =>
          (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5) || a.name.localeCompare(b.name, 'th')
        );
        setUsers(sorted);
      }
    } catch {
      setError('ไม่สามารถดึงข้อมูลได้');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ----------------------------------------
  // Recent searches (localStorage)
  // ----------------------------------------

  const RECENT_KEY = 'assets_recent_searches';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecentSearches(parsed.filter(v => typeof v === 'string'));
      }
    } catch { /* ignore */ }
  }, []);

  function commitSearch(term: string) {
    const t = term.trim();
    if (!t) return;
    setRecentSearches(prev => {
      const next = [t, ...prev.filter(v => v.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function clearRecentSearches() {
    setRecentSearches([]);
    try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  }

  // ----------------------------------------
  // Filtered
  // ----------------------------------------

  const filteredAssets = useMemo(() => assets.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (categoryFilter && a.categoryId !== Number(categoryFilter)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) ||
        (a.assetTag || '').toLowerCase().includes(q) ||
        (a.serialNumber || '').toLowerCase().includes(q) ||
        (a.model || '').toLowerCase().includes(q) ||
        (a.brand || '').toLowerCase().includes(q);
    }
    return true;
  }), [assets, statusFilter, categoryFilter, searchQuery]);

  // ----------------------------------------
  // Asset CRUD
  // ----------------------------------------

  function openCreateModal() {
    setEditingAsset(null);
    setFormData(defaultAssetForm());
    setImageFile(null);
    setDocFile(null);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(a: Asset) {
    setEditingAsset(a);
    setFormData({
      name: a.name, assetTag: a.assetTag ?? '', serialNumber: a.serialNumber ?? '',
      model: a.model ?? '', brand: a.brand ?? '',
      categoryId: a.categoryId ?? '',
      status: a.status, condition: a.condition,
      acquisitionDate: a.acquisitionDate ? new Date(a.acquisitionDate).toISOString().split('T')[0] : '',
      acquisitionCost: a.acquisitionCost ?? '',
      documentNumber: a.documentNumber ?? '', documentUrl: a.documentUrl ?? '',
      imageUrl: a.imageUrl ?? '', location: a.location ?? '',
      department: a.department ?? '', notes: a.notes ?? '',
      receiverName: (a as any).receiverName ?? '',
    });
    setImageFile(null);
    setDocFile(null);
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmitAsset(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      let imageUrl = formData.imageUrl || null;
      let docUrl = formData.documentUrl || null;

      if (imageFile) {
        imageUrl = await uploadDocument(imageFile);
        if (!imageUrl) throw new Error('อัปโหลดรูปภาพไม่สำเร็จ');
      }
      if (docFile) {
        docUrl = await uploadDocument(docFile);
        if (!docUrl) throw new Error('อัปโหลดเอกสารไม่สำเร็จ');
      }

      const payload: any = {
        name: formData.name,
        assetTag: formData.assetTag || null,
        serialNumber: formData.serialNumber || null,
        model: formData.model || null,
        brand: formData.brand || null,
        categoryId: formData.categoryId ? Number(formData.categoryId) : null,
        status: formData.status,
        condition: formData.condition,
        acquisitionDate: formData.acquisitionDate || null,
        acquisitionCost: formData.acquisitionCost !== '' ? Number(formData.acquisitionCost) : null,
        documentNumber: formData.documentNumber || null,
        documentUrl: docUrl,
        imageUrl,
        location: formData.location || null,
        department: formData.department || null,
        notes: formData.notes || null,
        receiverName: formData.receiverName || null,
      };

      const url = editingAsset ? `/api/assets/${editingAsset.id}` : '/api/assets';
      const method = editingAsset ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      if (editingAsset) {
        setAssets(prev => prev.map(a => a.id === editingAsset.id ? data.data : a));
      } else {
        setAssets(prev => [...prev, data.data]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteAsset(id: number) {
    if (!confirm('ยืนยันการลบครุภัณฑ์นี้?')) return;
    const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) setAssets(prev => prev.filter(a => a.id !== id));
  }

  // ----------------------------------------
  // Inspection
  // ----------------------------------------

  function openInspectionModal(a: Asset) {
    setInspectionAsset(a);
    setInspectionForm({
      date: (a as any).lastInspectionDate ? new Date((a as any).lastInspectionDate).toISOString().split('T')[0] : '',
      condition: (a as any).lastInspectionCondition ?? '',
      inspector: (a as any).lastInspectedBy ?? '',
    });
    setInspectionError(null);
    setIsInspectionOpen(true);
  }

  async function handleSubmitInspection(e: React.FormEvent) {
    e.preventDefault();
    setInspectionLoading(true);
    setInspectionError(null);
    try {
      const res = await fetch(`/api/assets/${inspectionAsset!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastInspectionDate: inspectionForm.date || null,
          lastInspectionCondition: inspectionForm.condition || null,
          lastInspectedBy: inspectionForm.inspector || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setAssets(prev => prev.map(a => a.id === inspectionAsset!.id ? data.data : a));
      setIsInspectionOpen(false);
    } catch (err) {
      setInspectionError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setInspectionLoading(false);
    }
  }

  // ----------------------------------------
  // Checkout / Return
  // ----------------------------------------

  async function openCheckoutModal(a: Asset) {
    setCheckoutAsset(a);
    setCheckoutForm(defaultCheckoutForm());
    setCheckoutError(null);
    setActiveCheckoutId(null);

    if (a.status === 'IN_USE') {
      // ค้นหา active checkout
      const res = await fetch(`/api/asset-checkouts?assetId=${a.id}&active=true&limit=1`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setActiveCheckoutId(data.data[0].id);
      }
    }
    setIsCheckoutModalOpen(true);
  }

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/asset-checkouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: checkoutAsset!.id,
          holderId: Number(checkoutForm.holderId),
          issuedById: checkoutForm.issuedById ? Number(checkoutForm.issuedById) : null,
          expectedReturnAt: checkoutForm.expectedReturnAt || null,
          notes: checkoutForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // อัปเดต local state
      const holder = users.find(u => u.id === Number(checkoutForm.holderId));
      setAssets(prev => prev.map(a => a.id === checkoutAsset!.id
        ? { ...a, status: 'IN_USE', currentHolderId: Number(checkoutForm.holderId), currentHolder: holder as any }
        : a
      ));
      setIsCheckoutModalOpen(false);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleReturn() {
    if (!activeCheckoutId) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch(`/api/asset-checkouts/${activeCheckoutId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      setAssets(prev => prev.map(a => a.id === checkoutAsset!.id
        ? { ...a, status: 'AVAILABLE', currentHolderId: null, currentHolder: null }
        : a
      ));
      setIsCheckoutModalOpen(false);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setCheckoutLoading(false);
    }
  }

  // ----------------------------------------
  // History
  // ----------------------------------------

  async function openHistory(a: Asset) {
    setHistoryAsset(a);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/assets/${a.id}`);
      const data = await res.json();
      if (data.success) setHistoryAsset(data.data);
    } finally {
      setHistoryLoading(false);
    }
  }

  // ----------------------------------------
  // Categories
  // ----------------------------------------

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    setCatLoading(true);
    try {
      const res = await fetch('/api/asset-categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName }),
      });
      const data = await res.json();
      if (data.success) { setCategories(prev => [...prev, data.data]); setNewCatName(''); }
    } finally { setCatLoading(false); }
  }

  async function handleDeleteCategory(id: number) {
    await fetch(`/api/asset-categories?id=${id}`, { method: 'DELETE' });
    setCategories(prev => prev.filter(c => c.id !== id));
  }

  // ----------------------------------------
  // Export
  // ----------------------------------------

  function handleExport() {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const a = document.createElement('a');
    a.href = `/api/assets/export${params}`;
    a.download = '';
    a.click();
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
          <h1 className="text-2xl font-bold text-slate-800">ครุภัณฑ์</h1>
          <p className="text-slate-500 mt-1 text-sm">ติดตามและจัดการครุภัณฑ์ของหน่วยงาน</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button onClick={() => setIsCatModalOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm transition-colors">
              <Settings size={16} /> หมวดหมู่
            </button>
          )}
          {canManage && (
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm transition-colors">
              <Download size={16} /> Export
            </button>
          )}
          {canManage && (
            <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm transition-colors shadow-sm">
              <Plus size={16} /> เพิ่มครุภัณฑ์
            </button>
          )}
        </div>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{error}</div>}

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_CONFIG).map(([st, cfg]) => {
          const count = assets.filter(a => a.status === st).length;
          return count > 0 ? (
            <button key={st} onClick={() => setStatusFilter(statusFilter === st ? '' : st as AssetStatus)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all border',
                statusFilter === st ? `${cfg.bg} ${cfg.text} border-current` : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50')}>
              {cfg.label} ({count})
            </button>
          ) : null;
        })}
        {statusFilter && (
          <button onClick={() => setStatusFilter('')} className="px-3 py-1 rounded-full text-xs text-slate-500 border border-slate-200 hover:bg-slate-50">
            ล้างตัวกรอง ×
          </button>
        )}
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
          <input type="text" placeholder="ค้นหาชื่อ, รหัส, serial, รุ่น..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchDropdownOpen(true)}
            onBlur={() => { setTimeout(() => setSearchDropdownOpen(false), 150); commitSearch(searchQuery); }}
            onKeyDown={e => { if (e.key === 'Enter') { commitSearch(searchQuery); setSearchDropdownOpen(false); } }}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="off" />
          {searchDropdownOpen && (() => {
            const q = searchQuery.trim().toLowerCase();
            const opts = recentSearches.filter(v => !q || v.toLowerCase().includes(q));
            return opts.length > 0 ? (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                <div className="px-3 py-1.5 text-xs font-medium text-slate-400 border-b border-slate-100">ค้นหาล่าสุด</div>
                <div className="max-h-48 overflow-y-auto">
                  {opts.map(v => (
                    <button key={v} type="button" onMouseDown={() => { setSearchQuery(v); setSearchDropdownOpen(false); }}
                      className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
                      <History size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{v}</span>
                    </button>
                  ))}
                </div>
                <button type="button" onMouseDown={clearRecentSearches}
                  className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:text-rose-600 hover:bg-slate-50 border-t border-slate-100 transition-colors">
                  ล้างประวัติการค้นหา
                </button>
              </div>
            ) : null;
          })()}
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">ทุกหมวดหมู่</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {categoryFilter && (
          <button onClick={() => setCategoryFilter('')} className="px-3 py-1 rounded-full text-xs text-slate-500 border border-slate-200 hover:bg-slate-50">
            ล้างหมวดหมู่ ×
          </button>
        )}
        <span className="text-sm text-slate-500">{filteredAssets.length} รายการ</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="py-3 px-4 font-semibold text-slate-600">รูปภาพ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">รหัสครุภัณฑ์</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">ชื่อครุภัณฑ์</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">รุ่น</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">หมวดหมู่</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">สถานะ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">ผู้ครอบครอง</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">สถานที่</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-600">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Monitor className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    ไม่มีข้อมูลครุภัณฑ์
                  </td>
                </tr>
              ) : filteredAssets.map(a => {
                const statusCfg = STATUS_CONFIG[a.status];
                return (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      {a.imageUrl
                        ? <Image src={a.imageUrl} alt={a.name} width={40} height={40} className="w-10 h-10 rounded object-cover border border-slate-200" />
                        : <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center"><ImageIcon size={16} className="text-slate-300" /></div>
                      }
                    </td>
                    <td className="py-3 px-4 text-indigo-600 font-mono text-sm">{a.assetTag || '-'}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{a.name}</div>
                      {a.brand && <div className="text-xs text-slate-400">{a.brand}</div>}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{a.model || '-'}</td>
                    <td className="py-3 px-4 text-slate-600">{(a as any).category?.name || '-'}</td>
                    <td className="py-3 px-4">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', statusCfg.bg, statusCfg.text)}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{holderName((a as any).currentHolder)}</td>
                    <td className="py-3 px-4 text-slate-600">{(a as any).location || '-'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openHistory(a)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="ประวัติ">
                          <History size={15} />
                        </button>
                        {canManage && (a.status === 'AVAILABLE' || a.status === 'IN_USE') && (
                          <button onClick={() => openCheckoutModal(a)}
                            className={cn('px-2 py-1 rounded text-xs font-medium transition-colors',
                              a.status === 'AVAILABLE' ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')}>
                            {a.status === 'AVAILABLE' ? 'ยืม' : 'คืน'}
                          </button>
                        )}
                        {canManage && (
                          <button onClick={() => openInspectionModal(a)} className="p-1.5 rounded hover:bg-teal-50 text-slate-500 hover:text-teal-700 text-xs" title="ตรวจสภาพ">
                            ตรวจสภาพ
                          </button>
                        )}
                        {canManage && (
                          <button onClick={() => openEditModal(a)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 text-xs" title="แก้ไข">
                            แก้ไข
                          </button>
                        )}
                        {canManage && (
                          <button onClick={() => handleDeleteAsset(a.id)} className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 text-xs" title="ลบ">
                            ลบ
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Create/Edit Asset Modal ===== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editingAsset ? 'แก้ไขครุภัณฑ์' : 'เพิ่มครุภัณฑ์ใหม่'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitAsset} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{formError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">รหัสครุภัณฑ์ (Asset Tag)</label>
                  <input value={formData.assetTag} onChange={e => setFormData(p => ({ ...p, assetTag: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เช่น 7440-001-0003" />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อครุภัณฑ์ *</label>
                  <input required value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ระบุชื่อครุภัณฑ์" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">หมายเลขซีเรียลสินค้า</label>
                  <input value={formData.serialNumber} onChange={e => setFormData(p => ({ ...p, serialNumber: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เช่น SN-0987-654-321" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ยี่ห้อ</label>
                  <div className="relative">
                    <input value={formData.brand} onChange={e => { setFormData(p => ({ ...p, brand: e.target.value })); setBrandDropdownOpen(true); }}
                      onFocus={() => setBrandDropdownOpen(true)} onBlur={() => setTimeout(() => setBrandDropdownOpen(false), 150)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เช่น Raspberry Pi Foundation" autoComplete="off" />
                    {brandDropdownOpen && (() => { const q = formData.brand.toLowerCase(); const opts = [...new Set(assets.filter(a => a.brand && a.id !== editingAsset?.id).map(a => a.brand as string))].filter(v => !q || v.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b, 'th')); return opts.length > 0 ? (<div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-36 overflow-y-auto">{opts.map(v => (<button key={v} type="button" onMouseDown={() => { setFormData(p => ({ ...p, brand: v })); setBrandDropdownOpen(false); }} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors', formData.brand === v && 'bg-indigo-50 text-indigo-700 font-medium')}>{v}</button>))}</div>) : null; })()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">รุ่น (Model)</label>
                  <div className="relative">
                    <input value={formData.model} onChange={e => { setFormData(p => ({ ...p, model: e.target.value })); setModelDropdownOpen(true); }}
                      onFocus={() => setModelDropdownOpen(true)} onBlur={() => setTimeout(() => setModelDropdownOpen(false), 150)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เช่น Raspberry Pi" autoComplete="off" />
                    {modelDropdownOpen && (() => { const q = formData.model.toLowerCase(); const opts = [...new Set(assets.filter(a => a.model && a.id !== editingAsset?.id).map(a => a.model as string))].filter(v => !q || v.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b, 'th')); return opts.length > 0 ? (<div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-36 overflow-y-auto">{opts.map(v => (<button key={v} type="button" onMouseDown={() => { setFormData(p => ({ ...p, model: v })); setModelDropdownOpen(false); }} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors', formData.model === v && 'bg-indigo-50 text-indigo-700 font-medium')}>{v}</button>))}</div>) : null; })()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">หมวดหมู่</label>
                  <select value={formData.categoryId} onChange={e => setFormData(p => ({ ...p, categoryId: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- ไม่ระบุ --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">สถานะ</label>
                  <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value as AssetStatus }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">สภาพ</label>
                  <select value={formData.condition} onChange={e => setFormData(p => ({ ...p, condition: e.target.value as AssetCondition }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">วันที่จัดซื้อ</label>
                  <input type="date" value={formData.acquisitionDate} onChange={e => setFormData(p => ({ ...p, acquisitionDate: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ผู้รับ-บันทึก</label>
                  <select value={formData.receiverName} onChange={e => setFormData(p => ({ ...p, receiverName: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- ไม่ระบุ --</option>
                    {users.filter(u => u.isActive).map(u => { const n = `${u.prefix || ''}${u.name}`; return <option key={u.id} value={n}>{n}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}</option>; })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่เอกสารรับ</label>
                  <input value={formData.documentNumber} onChange={e => setFormData(p => ({ ...p, documentNumber: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เลขที่หนังสือ" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">แผนก</label>
                  <div className="relative">
                    <input value={formData.department} onChange={e => { setFormData(p => ({ ...p, department: e.target.value })); setDepartmentDropdownOpen(true); }}
                      onFocus={() => setDepartmentDropdownOpen(true)} onBlur={() => setTimeout(() => setDepartmentDropdownOpen(false), 150)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="หน่วยงาน" autoComplete="off" />
                    {departmentDropdownOpen && (() => { const q = formData.department.toLowerCase(); const opts = [...new Set(assets.filter(a => a.department && a.id !== editingAsset?.id).map(a => a.department as string))].filter(v => !q || v.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b, 'th')); return opts.length > 0 ? (<div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-36 overflow-y-auto">{opts.map(v => (<button key={v} type="button" onMouseDown={() => { setFormData(p => ({ ...p, department: v })); setDepartmentDropdownOpen(false); }} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors', formData.department === v && 'bg-indigo-50 text-indigo-700 font-medium')}>{v}</button>))}</div>) : null; })()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">สถานที่</label>
                  <div className="relative">
                    <input value={formData.location} onChange={e => { setFormData(p => ({ ...p, location: e.target.value })); setLocationDropdownOpen(true); }}
                      onFocus={() => setLocationDropdownOpen(true)} onBlur={() => setTimeout(() => setLocationDropdownOpen(false), 150)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ห้อง/อาคาร" autoComplete="off" />
                    {locationDropdownOpen && (() => { const q = formData.location.toLowerCase(); const opts = [...new Set(assets.filter(a => a.location && a.id !== editingAsset?.id).map(a => a.location as string))].filter(v => !q || v.toLowerCase().includes(q)).sort((a, b) => a.localeCompare(b, 'th')); return opts.length > 0 ? (<div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-36 overflow-y-auto">{opts.map(v => (<button key={v} type="button" onMouseDown={() => { setFormData(p => ({ ...p, location: v })); setLocationDropdownOpen(false); }} className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors', formData.location === v && 'bg-indigo-50 text-indigo-700 font-medium')}>{v}</button>))}</div>) : null; })()}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">รูปภาพครุภัณฑ์</label>
                  <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                  {formData.imageUrl && !imageFile && (
                    <Image src={formData.imageUrl} width={64} height={64} className="mt-1 w-16 h-16 object-cover rounded border border-slate-200" alt="preview" />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ไฟล์เอกสาร (PDF)</label>
                  <input type="file" accept=".pdf,image/*" onChange={e => setDocFile(e.target.files?.[0] || null)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                  {formData.documentUrl && !docFile && (
                    <a href={formData.documentUrl} target="_blank" rel="noopener" className="text-xs text-indigo-600 hover:underline mt-1 flex items-center gap-1">
                      <FileText size={12} /> ดูเอกสารเดิม
                    </a>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                  <textarea rows={2} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>

                {(editingAsset as any)?.currentHolder && (
                  <div className="col-span-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                    <p className="text-xs font-semibold text-blue-700 mb-1">ผู้ครอบครองปัจจุบัน</p>
                    <p className="text-sm text-blue-800 font-medium">{holderName((editingAsset as any).currentHolder)}</p>
                  </div>
                )}

              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                <button type="submit" disabled={formLoading} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400 flex items-center justify-center gap-2">
                  {formLoading && <Loader2 size={14} className="animate-spin" />}
                  {editingAsset ? 'บันทึก' : 'สร้างครุภัณฑ์'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Checkout / Return Modal ===== */}
      {isCheckoutModalOpen && checkoutAsset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">
                  {checkoutAsset.status === 'AVAILABLE' ? 'ยืมครุภัณฑ์' : 'คืนครุภัณฑ์'}
                </h2>
                <p className="text-sm text-slate-500">{checkoutAsset.name}</p>
              </div>
              <button onClick={() => setIsCheckoutModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>

            {checkoutAsset.status === 'AVAILABLE' ? (
              <form onSubmit={handleCheckout} className="p-5 space-y-4">
                {checkoutError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{checkoutError}</div>}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ผู้เบิก (ผู้ยืม) *</label>
                  <select required value={checkoutForm.holderId} onChange={e => setCheckoutForm(p => ({ ...p, holderId: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- เลือกผู้เบิก --</option>
                    {users.filter(u => u.isActive).map(u => (
                      <option key={u.id} value={u.id}>{(u.prefix || '') + u.name} {u.department ? `(${u.department})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ผู้จ่ายสินค้า/อนุมัติ</label>
                  <select value={checkoutForm.issuedById} onChange={e => setCheckoutForm(p => ({ ...p, issuedById: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- บันทึกจากผู้ล็อกอิน (อัตโนมัติ) --</option>
                    {users.filter(u => u.isActive).map(u => { const n = `${u.prefix || ''}${u.name}`; return <option key={u.id} value={u.id}>{n}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}</option>; })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">วันที่คาดว่าจะคืน</label>
                  <input type="date" value={checkoutForm.expectedReturnAt} onChange={e => setCheckoutForm(p => ({ ...p, expectedReturnAt: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                  <textarea rows={2} value={checkoutForm.notes} onChange={e => setCheckoutForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setIsCheckoutModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                  <button type="submit" disabled={checkoutLoading} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400 flex items-center justify-center gap-2">
                    {checkoutLoading && <Loader2 size={14} className="animate-spin" />} ยืมครุภัณฑ์
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-5 space-y-4">
                {checkoutError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{checkoutError}</div>}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-700">
                    ครุภัณฑ์นี้กำลังถูกยืมโดย <strong>{holderName((checkoutAsset as any).currentHolder)}</strong>
                  </p>
                  <p className="text-xs text-amber-600 mt-1">กดยืนยันเพื่อรับคืนครุภัณฑ์</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setIsCheckoutModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                  <button onClick={handleReturn} disabled={checkoutLoading} className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm disabled:bg-emerald-400 flex items-center justify-center gap-2">
                    {checkoutLoading && <Loader2 size={14} className="animate-spin" />} ยืนยันคืน
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== History Modal ===== */}
      {isHistoryOpen && historyAsset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">ประวัติยืม-คืน — {historyAsset.name}</h2>
                {historyAsset.assetTag && <p className="text-sm text-slate-500">รหัส: {historyAsset.assetTag}</p>}
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Asset summary info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 rounded-lg p-3">
                <div><span className="text-slate-500">วันที่นำเข้า:</span> <span className="font-medium">{formatDate((historyAsset as any).acquisitionDate)}</span></div>
                <div><span className="text-slate-500">สภาพปัจจุบัน:</span> <span className="font-medium">{CONDITION_LABELS[(historyAsset as any).condition as AssetCondition] || '-'}</span></div>
                <div><span className="text-slate-500">ผู้ครอบครอง:</span> <span className="font-medium">{holderName((historyAsset as any).currentHolder)}</span></div>
                {(historyAsset as any).lastInspectionDate && (
                  <div><span className="text-slate-500">ตรวจล่าสุด:</span> <span className="font-medium">{formatDate((historyAsset as any).lastInspectionDate)} — {CONDITION_LABELS[(historyAsset as any).lastInspectionCondition as AssetCondition] || ''}</span></div>
                )}
                {(historyAsset as any).receiverName && (
                  <div><span className="text-slate-500">ผู้รับ-บันทึก:</span> <span className="font-medium">{(historyAsset as any).receiverName}</span></div>
                )}
              </div>

              {historyLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600 w-6 h-6" /></div>
              ) : !(historyAsset as any).checkouts?.length ? (
                <p className="text-center text-slate-400 py-8">ยังไม่มีประวัติการเบิก-คืน</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">ผู้เบิก</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">วันที่เบิก</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">วันที่คืน</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">ระยะเวลา</th>
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">ผู้จ่าย/อนุมัติ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(historyAsset as any).checkouts.map((co: AssetCheckout) => {
                      const start = new Date(co.checkedOutAt);
                      const end = co.returnedAt ? new Date(co.returnedAt) : new Date();
                      const days = Math.ceil((end.getTime() - start.getTime()) / 86400000);
                      return (
                        <tr key={co.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-medium text-slate-700">{holderName((co as any).holder)}</td>
                          <td className="py-2 px-3 text-slate-500">{formatDate(co.checkedOutAt)}</td>
                          <td className="py-2 px-3">
                            {co.returnedAt
                              ? <span className="text-emerald-600">{formatDate(co.returnedAt)}</span>
                              : <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">ยังไม่คืน</span>
                            }
                          </td>
                          <td className="py-2 px-3 text-slate-500 text-xs">{days} วัน{!co.returnedAt ? ' (ณ ปัจจุบัน)' : ''}</td>
                          <td className="py-2 px-3 text-slate-500">{(co as any).issuedBy ? holderName((co as any).issuedBy) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== Inspection Modal ===== */}
      {isInspectionOpen && inspectionAsset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">ตรวจสภาพครุภัณฑ์</h2>
                <p className="text-sm text-slate-500">{inspectionAsset.name}</p>
              </div>
              <button onClick={() => setIsInspectionOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitInspection} className="p-5 space-y-4">
              {inspectionError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{inspectionError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วันที่ตรวจ</label>
                <input type="date" value={inspectionForm.date} onChange={e => setInspectionForm(p => ({ ...p, date: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">สภาพเมื่อตรวจ</label>
                <select value={inspectionForm.condition} onChange={e => setInspectionForm(p => ({ ...p, condition: e.target.value as AssetCondition | '' }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- ไม่ระบุ --</option>
                  {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ผู้ตรวจ</label>
                <select value={inspectionForm.inspector} onChange={e => setInspectionForm(p => ({ ...p, inspector: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- ไม่ระบุ --</option>
                  {users.filter(u => u.isActive).map(u => { const n = `${u.prefix || ''}${u.name}`; return <option key={u.id} value={n}>{n}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}</option>; })}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsInspectionOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                <button type="submit" disabled={inspectionLoading} className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm disabled:bg-teal-400 flex items-center justify-center gap-2">
                  {inspectionLoading && <Loader2 size={14} className="animate-spin" />}
                  บันทึกผลตรวจ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Category Modal ===== */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">จัดการหมวดหมู่ครุภัณฑ์</h2>
              <button onClick={() => setIsCatModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input required value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="ชื่อหมวดหมู่ใหม่"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button type="submit" disabled={catLoading} className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400">
                  {catLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
                </button>
              </form>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {categories.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50">
                    <span className="text-sm text-slate-700">{c.name}</span>
                    <button onClick={() => handleDeleteCategory(c.id)} className="text-xs text-slate-400 hover:text-rose-600">ลบ</button>
                  </div>
                ))}
                {categories.length === 0 && <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีหมวดหมู่</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
