'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import {
  Plus, Search, Download, Loader2, X, Package,
  AlertTriangle, ChevronDown, FileText, History, Tag, Settings
} from 'lucide-react';
import { cn, safeGetGregorianYear } from '@/lib/utils';
import { Supply, SupplyCategory, SupplyTransaction, SupplyType, TransactionType, User } from '@/types';
import { useCurrentUser } from '@/contexts/UserContext';

// ============================================
// Config
// ============================================

const SUPPLY_TYPE_LABELS: Record<SupplyType, string> = {
  STOCK: 'คงคลัง',
  NON_STOCK: 'ไม่คงคลัง',
};

const TX_TYPE_LABELS: Record<TransactionType, { label: string; color: string }> = {
  RECEIVE: { label: 'รับเข้า', color: 'text-emerald-600' },
  ISSUE:   { label: 'เบิกจ่าย', color: 'text-rose-600' },
  RETURN:  { label: 'คืน', color: 'text-blue-600' },
  ADJUST:  { label: 'ปรับยอด', color: 'text-amber-600' },
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
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

function qtyColor(current: number, min: number, redPct = 20, yellowPct = 50): string {
  if (min <= 0) return 'text-slate-700 bg-slate-50 border-slate-200';
  if (current > min) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  const ratio = (current / min) * 100;
  if (ratio < redPct) return 'text-red-600 bg-red-50 border-red-200';
  return 'text-amber-600 bg-amber-50 border-amber-200';
}

// ============================================
// Document upload helper
// ============================================

async function uploadDocument(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/uploads/document', { method: 'POST', body: fd });
  const data = await res.json();
  return data.success ? data.data.url : null;
}

// ============================================
// Main Page
// ============================================

export default function SuppliesPageClient() {
  const { role: userRole } = useCurrentUser();
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [categories, setCategories] = useState<SupplyCategory[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SupplyType>('STOCK');
  const [isLowStockExpanded, setIsLowStockExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit supply modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null);
  const [formData, setFormData] = useState(defaultSupplyForm());
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);

  // Transaction modal
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [txForm, setTxForm] = useState(defaultTxForm());
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txDocFile, setTxDocFile] = useState<File | null>(null);

  // Merge duplicates modal
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeLoading, setMergeLoading] = useState<string | null>(null); // key of group being merged

  // ขอเบิกวัสดุ modal
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueSupply, setIssueSupply] = useState<Supply | null>(null);
  const [issueForm, setIssueForm] = useState({ requesterName: '', quantity: 1, issueDate: '', supplierName: '', documentNumber: '', notes: '' });
  const [issueSubmitLoading, setIssueSubmitLoading] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Name combobox dropdown
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);
  const [supplyCodeDropdownOpen, setSupplyCodeDropdownOpen] = useState(false);
  const [documentNumberDropdownOpen, setDocumentNumberDropdownOpen] = useState(false);

  // Settings modal (per-item thresholds)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSupply, setSettingsSupply] = useState<Supply | null>(null);
  const [settingsForm, setSettingsForm] = useState({ minimumQuantity: 0, maximumQuantity: 0, thresholdRed: 20, thresholdYellow: 50 });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // History modal
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySupply, setHistorySupply] = useState<(Supply & { transactions?: SupplyTransaction[] }) | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historySortAsc, setHistorySortAsc] = useState(false);

  // Category modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catLoading, setCatLoading] = useState(false);

  // Export modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState<'week' | 'month' | 'custom'>('month');
  const [exportType, setExportType] = useState<'STOCK' | 'NON_STOCK' | 'all'>('all');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const canManage = ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);

  // ----------------------------------------
  // Fetch
  // ----------------------------------------

  const fetchAll = useCallback(async () => {
    try {
      const [suppliesRes, catsRes, usersRes] = await Promise.all([
        fetch('/api/supplies'),
        fetch('/api/supply-categories'),
        fetch('/api/users'),
      ]);
      const suppliesData = await suppliesRes.json();
      const catsData = await catsRes.json();
      const usersData = await usersRes.json();

      if (suppliesData.success) setSupplies(suppliesData.data);
      if (catsData.success) setCategories(catsData.data);
      if (usersData.success) {
        const roleOrder: Record<string, number> = { SUPER_ADMIN: 0, ADMIN: 1, MANAGER: 2, DIRECTOR: 3, HR: 4, EMPLOYEE: 5 };
        const sorted = [...usersData.data].sort((a: User, b: User) =>
          (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5) || a.name.localeCompare(b.name, 'th')
        );
        setMembers(sorted);
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

  const RECENT_KEY = 'supplies_recent_searches';

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
  // Filtered list
  // ----------------------------------------

  // Detect duplicate names within same type
  const allDuplicateGroups = useMemo(() => Object.entries(
    supplies.filter(s => s.isActive).reduce((acc, s) => {
      const key = `${s.name.trim().toLowerCase()}__${s.type}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
      return acc;
    }, {} as Record<string, Supply[]>)
  )
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, group: group.sort((a, b) => a.id - b.id) })), [supplies]);

  const filteredSupplies = useMemo(() => supplies.filter(s => {
    if (s.type !== activeTab) return false;
    if (categoryFilter && s.categoryId !== Number(categoryFilter)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) ||
        (s.supplier || '').toLowerCase().includes(q) ||
        (s.documentNumber || '').toLowerCase().includes(q);
    }
    return true;
  }), [supplies, activeTab, categoryFilter, searchQuery]);

  // ----------------------------------------
  // Supply CRUD
  // ----------------------------------------

  function defaultSupplyForm() {
    return {
      name: '', type: 'STOCK' as SupplyType, categoryId: '' as string | number,
      supplyCode: '', unit: '', minimumQuantity: 0, maximumQuantity: 0, currentQuantity: 0,
      thresholdRed: 20, thresholdYellow: 50,
      issueDate: '', recorderName: '',
      unitPrice: '' as string | number,
      documentNumber: '', documentUrl: '', imageUrl: '', notes: '',
    };
  }

  function openCreateModal() {
    setEditingSupply(null);
    setFormData({ ...defaultSupplyForm(), type: activeTab });
    setDocFile(null);
    setImgFile(null);
    setImgPreview(null);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(s: Supply) {
    setEditingSupply(s);
    setFormData({
      name: s.name, type: s.type, categoryId: s.categoryId ?? '',
      supplyCode: s.supplyCode ?? '', unit: s.unit ?? '', minimumQuantity: s.minimumQuantity,
      maximumQuantity: s.maximumQuantity, currentQuantity: s.currentQuantity,
      thresholdRed: s.thresholdRed, thresholdYellow: s.thresholdYellow,
      issueDate: s.issueDate ? new Date(s.issueDate as string).toISOString().split('T')[0] : '',
      recorderName: s.recorderName ?? '',
      unitPrice: s.unitPrice ?? '',
      documentNumber: s.documentNumber ?? '', documentUrl: s.documentUrl ?? '',
      imageUrl: s.imageUrl ?? '', notes: s.notes ?? '',
    });
    setDocFile(null);
    setImgFile(null);
    setImgPreview(s.imageUrl ?? null);
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmitSupply(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);
    try {
      // ป้องกันสร้างรายการซ้ำ
      if (!editingSupply) {
        const existing = supplies.find(s =>
          s.name.trim().toLowerCase() === formData.name.trim().toLowerCase() &&
          s.type === formData.type && s.isActive
        );
        if (existing) {
          const qty = Number(formData.currentQuantity) || 0;
          const confirmed = confirm(
            `"${formData.name}" มีอยู่แล้ว (รหัส ${existing.id}, คงเหลือ ${existing.currentQuantity} ${existing.unit || ''})\n\n` +
            (qty > 0 ? `ต้องการเพิ่มจำนวน ${qty} ${existing.unit || ''} เข้ารายการเดิมหรือไม่?` : 'ไม่สามารถสร้างรายการซ้ำได้')
          );
          if (confirmed && qty > 0) {
            const res = await fetch('/api/supply-transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                supplyId: existing.id,
                type: 'RECEIVE',
                quantity: qty,
                documentNumber: formData.documentNumber || null,
                recipientName: formData.recorderName || null,
                notes: [formData.notes, 'เพิ่มจากฟอร์มสร้างวัสดุ'].filter(Boolean).join(' — ') || null,
              }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            if (data.data?.supply) {
              setSupplies(prev => prev.map(s =>
                s.id === existing.id ? { ...s, currentQuantity: data.data.supply.currentQuantity } : s
              ));
            }
            setIsModalOpen(false);
            return;
          }
          setFormLoading(false);
          return;
        }
      }

      let docUrl = formData.documentUrl || null;
      if (docFile) {
        docUrl = await uploadDocument(docFile);
        if (!docUrl) throw new Error('อัปโหลดเอกสารไม่สำเร็จ');
      }

      let imageUrl = formData.imageUrl || null;
      if (imgFile) {
        imageUrl = await uploadDocument(imgFile);
        if (!imageUrl) throw new Error('อัปโหลดรูปภาพไม่สำเร็จ');
      }

      const payload: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        categoryId: formData.categoryId ? Number(formData.categoryId) : null,
        supplyCode: formData.supplyCode || null,
        unit: formData.unit || null,
        minimumQuantity: Number(formData.minimumQuantity) || 0,
        unitPrice: formData.unitPrice !== '' ? Number(formData.unitPrice) : null,
        documentNumber: formData.documentNumber || null,
        documentUrl: docUrl,
        imageUrl: imageUrl,
        issueDate: formData.issueDate || null,
        recorderName: formData.recorderName || null,
        notes: formData.notes || null,
      };
      payload.currentQuantity = Number(formData.currentQuantity) || 0;
      if (formData.type === 'STOCK') {
        payload.maximumQuantity = Number(formData.maximumQuantity) || 0;
        payload.thresholdRed = Number(formData.thresholdRed) || 20;
        payload.thresholdYellow = Number(formData.thresholdYellow) || 50;
      }

      const url = editingSupply ? `/api/supplies/${editingSupply.id}` : '/api/supplies';
      const method = editingSupply ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      if (editingSupply) {
        setSupplies(prev => prev.map(s => s.id === editingSupply.id ? data.data : s));
      } else {
        setSupplies(prev => [...prev, data.data]);
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteSupply(id: number) {
    if (!confirm('ยืนยันการลบวัสดุนี้?')) return;
    const res = await fetch(`/api/supplies/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) setSupplies(prev => prev.filter(s => s.id !== id));
  }

  async function handleMerge(primaryId: number, secondaryId: number, groupKey: string) {
    setMergeLoading(groupKey);
    try {
      const res = await fetch('/api/supplies/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId, secondaryId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      // Update state: replace primary with merged, remove secondary
      setSupplies(prev => prev
        .filter(s => s.id !== secondaryId)
        .map(s => s.id === primaryId ? { ...s, ...data.data } : s)
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setMergeLoading(null);
    }
  }

  function openSettingsModal(s: Supply) {
    setSettingsSupply(s);
    setSettingsForm({
      minimumQuantity: s.minimumQuantity,
      maximumQuantity: s.maximumQuantity,
      thresholdRed: s.thresholdRed,
      thresholdYellow: s.thresholdYellow,
    });
    setSettingsError(null);
    setIsSettingsOpen(true);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (settingsForm.thresholdRed >= settingsForm.thresholdYellow) {
      setSettingsError('เกณฑ์สีแดงต้องน้อยกว่าเกณฑ์สีเหลือง');
      return;
    }
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const res = await fetch(`/api/supplies/${settingsSupply!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSupplies(prev => prev.map(s => s.id === settingsSupply!.id ? { ...s, ...settingsForm } : s));
      setIsSettingsOpen(false);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSettingsLoading(false);
    }
  }

  function openIssueModal(s: Supply) {
    setIssueSupply(s);
    setIssueForm({ requesterName: '', quantity: 1, issueDate: new Date().toISOString().split('T')[0], supplierName: '', documentNumber: '', notes: '' });
    setIssueError(null);
    setIsIssueModalOpen(true);
  }

  async function handleSubmitIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!issueSupply) return;
    if (issueForm.quantity < 1 || issueForm.quantity > issueSupply.currentQuantity) {
      setIssueError(`จำนวนต้องอยู่ระหว่าง 1 – ${issueSupply.currentQuantity} ${issueSupply.unit || ''}`);
      return;
    }
    setIssueSubmitLoading(true);
    setIssueError(null);
    try {
      const res = await fetch('/api/supply-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplyId: issueSupply.id,
          type: 'ISSUE',
          quantity: issueForm.quantity,
          recipientName: issueForm.requesterName || null,
          documentNumber: issueForm.documentNumber || null,
          notes: [
            issueForm.supplierName ? `ผู้จำหน่าย: ${issueForm.supplierName}` : '',
            issueForm.notes,
          ].filter(Boolean).join('\n') || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      if (data.data?.supply) {
        setSupplies(prev => prev.map(s =>
          s.id === issueSupply.id ? { ...s, currentQuantity: data.data.supply.currentQuantity } : s
        ));
      }
      setIsIssueModalOpen(false);
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIssueSubmitLoading(false);
    }
  }

  // ----------------------------------------
  // Transaction
  // ----------------------------------------

  function defaultTxForm() {
    return { type: 'RECEIVE' as TransactionType, quantity: 1, recipientName: '', returnerName: '', returnReceiverName: '', adjusterName: '', documentNumber: '', documentUrl: '', notes: '' };
  }

  function openTxModal(s: Supply) {
    setSelectedSupply(s);
    setTxForm(defaultTxForm());
    setTxDocFile(null);
    setTxError(null);
    setIsTxModalOpen(true);
  }

  async function handleSubmitTx(e: React.FormEvent) {
    e.preventDefault();
    setTxLoading(true);
    setTxError(null);
    try {
      let docUrl = txForm.documentUrl || null;
      if (txDocFile) {
        docUrl = await uploadDocument(txDocFile);
        if (!docUrl) throw new Error('อัปโหลดเอกสารไม่สำเร็จ');
      }

      const res = await fetch('/api/supply-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplyId: selectedSupply!.id,
          type: txForm.type,
          quantity: Number(txForm.quantity),
          recipientName: txForm.recipientName || null,
          returnerName: txForm.returnerName || null,
          returnReceiverName: txForm.returnReceiverName || null,
          adjusterName: txForm.adjusterName || null,
          documentNumber: txForm.documentNumber || null,
          documentUrl: docUrl,
          notes: txForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // อัปเดต currentQuantity ใน local state
      if (data.data?.supply) {
        setSupplies(prev => prev.map(s =>
          s.id === selectedSupply!.id ? { ...s, currentQuantity: data.data.supply.currentQuantity } : s
        ));
      }
      setIsTxModalOpen(false);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setTxLoading(false);
    }
  }

  // ----------------------------------------
  // History
  // ----------------------------------------

  async function openHistory(s: Supply) {
    setHistorySupply(s);
    setIsHistoryOpen(true);
    setHistoryLoading(true);
    setHistorySearch('');
    setHistorySortAsc(false);
    try {
      const res = await fetch(`/api/supplies/${s.id}`);
      const data = await res.json();
      if (data.success) setHistorySupply(data.data);
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
      const res = await fetch('/api/supply-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName }),
      });
      const data = await res.json();
      if (data.success) {
        setCategories(prev => [...prev, data.data]);
        setNewCatName('');
      }
    } finally {
      setCatLoading(false);
    }
  }

  async function handleDeleteCategory(id: number) {
    await fetch(`/api/supply-categories?id=${id}`, { method: 'DELETE' });
    setCategories(prev => prev.filter(c => c.id !== id));
  }

  // ----------------------------------------
  // Export
  // ----------------------------------------

  async function handleExport() {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (exportType !== 'all') params.set('type', exportType);
      params.set('period', exportPeriod);
      if (exportPeriod === 'custom') {
        if (exportStartDate) params.set('startDate', exportStartDate);
        if (exportEndDate) params.set('endDate', exportEndDate);
      }

      const res = await fetch(`/api/supplies/export?${params.toString()}`);
      if (!res.ok) throw new Error('Export ล้มเหลว');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
      a.download = match ? decodeURIComponent(match[1]) : 'supplies_export.xlsx';
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
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const lowStockItems = supplies.filter(s => s.type === 'STOCK' && s.currentQuantity <= s.minimumQuantity);
  const lowStockCount = lowStockItems.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">วัสดุ</h1>
          <p className="text-slate-500 mt-1 text-sm">จัดการวัสดุคงคลังและไม่คงคลัง</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button onClick={() => setIsCatModalOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm transition-colors">
              <Settings size={16} /> หมวดหมู่
            </button>
          )}
          {canManage && (
            <button onClick={() => setIsExportModalOpen(true)} className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm transition-colors">
              <Download size={16} /> Export
            </button>
          )}
          {canManage && (
            <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm transition-colors shadow-sm">
              <Plus size={16} /> เพิ่มวัสดุ
            </button>
          )}
        </div>
      </div>

      {/* Low stock alert */}
      {lowStockCount > 0 && activeTab === 'STOCK' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setIsLowStockExpanded(v => !v)}
            className="w-full flex items-center gap-3 p-3 text-left"
          >
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700 flex-1">มี <strong>{lowStockCount}</strong> รายการที่มีจำนวนต่ำกว่าขั้นต่ำ</p>
            <ChevronDown size={16} className={cn('text-amber-600 transition-transform shrink-0', isLowStockExpanded && 'rotate-180')} />
          </button>
          {isLowStockExpanded && (
            <div className="border-t border-amber-200 divide-y divide-amber-100 bg-white/50">
              {lowStockItems.map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-slate-700">{s.name}</span>
                  <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-semibold border', qtyColor(s.currentQuantity, s.minimumQuantity, s.thresholdRed, s.thresholdYellow))}>
                    {s.currentQuantity} / {s.minimumQuantity} {s.unit || ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{error}</div>
      )}

      {/* Duplicate alert */}
      {allDuplicateGroups.length > 0 && canManage && (
        <div className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
          <AlertTriangle size={16} className="text-rose-500 shrink-0" />
          <p className="text-sm text-rose-700 flex-1">
            พบ <strong>{allDuplicateGroups.length}</strong> รายการที่มีชื่อซ้ำ — ควรรวมเป็นรายการเดียว
          </p>
          <button
            onClick={() => setIsMergeOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors whitespace-nowrap"
          >
            รวมรายการซ้ำ
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {(['STOCK', 'NON_STOCK'] as SupplyType[]).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              'px-6 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {SUPPLY_TYPE_LABELS[t]}
            <span className={cn('ml-2 px-2 py-0.5 rounded-full text-xs', activeTab === t ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500')}>
              {supplies.filter(s => s.type === t).length}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
          <input
            type="text" placeholder="ค้นหาชื่อ, รหัสวัสดุ, เลขที่เอกสาร..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchDropdownOpen(true)}
            onBlur={() => { setTimeout(() => setSearchDropdownOpen(false), 150); commitSearch(searchQuery); }}
            onKeyDown={e => { if (e.key === 'Enter') { commitSearch(searchQuery); setSearchDropdownOpen(false); } }}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoComplete="off"
          />
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
        <span className="text-sm text-slate-500">{filteredSupplies.length} รายการ</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 font-semibold text-slate-600">รูปภาพ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">รหัสวัสดุ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">รายการ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">หมวดหมู่</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-600">คงเหลือ</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600">หน่วยนับ</th>
                <th className="text-center py-3 px-4 font-semibold text-slate-600">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSupplies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    ไม่มีข้อมูลวัสดุ
                  </td>
                </tr>
              ) : filteredSupplies.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 px-4">
                    {s.imageUrl ? (
                      <a href={s.imageUrl} target="_blank" rel="noopener noreferrer">
                        <Image src={s.imageUrl} alt={s.name} width={40} height={40}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 hover:opacity-75 transition-opacity" />
                      </a>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                        <Package size={18} className="text-slate-300" />
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {s.supplyCode
                      ? <span className="font-mono text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{s.supplyCode}</span>
                      : <span className="text-slate-400">-</span>
                    }
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-800">{s.name}</div>
                  </td>
                  <td className="py-3 px-4">
                    {(s as any).category?.name
                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{(s as any).category.name}</span>
                      : <span className="text-slate-400">-</span>
                    }
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={cn('inline-flex px-2 py-0.5 rounded text-sm font-semibold border', qtyColor(s.currentQuantity, s.minimumQuantity, s.thresholdRed, s.thresholdYellow))}>
                      {s.currentQuantity}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{s.unit || '-'}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {canManage && s.currentQuantity > 0 && (
                        <button
                          onClick={() => openIssueModal(s)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap shadow-sm"
                        >
                          <Package size={12} /> ขอเบิก
                        </button>
                      )}
                      <button onClick={() => openHistory(s)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="ประวัติ">
                        <History size={15} />
                      </button>
                      {canManage && (
                        <button onClick={() => openTxModal(s)} className="p-1.5 rounded hover:bg-indigo-50 text-indigo-600 hover:text-indigo-700 text-xs font-medium" title="ทำรายการ (รับ/คืน/ปรับยอด)">
                          <Tag size={15} />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => openSettingsModal(s)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title="ตั้งค่าเกณฑ์">
                          <Settings size={15} />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => openEditModal(s)} className="px-2 py-1 rounded hover:bg-slate-100 text-slate-600 hover:text-slate-800 text-xs font-medium border border-slate-200 hover:border-slate-300" title="แก้ไข">
                          แก้ไข
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => handleDeleteSupply(s.id)} className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 text-xs" title="ลบ">
                          ลบ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Create/Edit Supply Modal ===== */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <h2 className="font-bold text-slate-800 text-base">
                    {editingSupply ? 'แก้ไขวัสดุ' : 'เพิ่มวัสดุใหม่'}
                  </h2>
                </div>
                <span className={cn(
                  'px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                  formData.type === 'STOCK'
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-violet-50 border-violet-200 text-violet-700'
                )}>
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle', formData.type === 'STOCK' ? 'bg-indigo-500' : 'bg-violet-500')} />
                  {formData.type === 'STOCK' ? 'คงคลัง' : 'ไม่คงคลัง'}
                </span>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitSupply} className="flex-1 overflow-y-auto">
              <div className="px-6 py-4 space-y-5">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{formError}</div>
                )}

                {/* Section: ข้อมูลวัสดุ */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ข้อมูลวัสดุ</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="space-y-3">
                    {/* ชื่อวัสดุ combobox */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อวัสดุ <span className="text-rose-500">*</span></label>
                      <input
                        required
                        value={formData.name}
                        onChange={e => { setFormData(p => ({ ...p, name: e.target.value })); setNameDropdownOpen(true); }}
                        onFocus={() => setNameDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setNameDropdownOpen(false), 150)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="เลือกจากรายการหรือพิมพ์ชื่อใหม่"
                        autoComplete="off"
                      />
                      {nameDropdownOpen && (() => {
                        const q = formData.name.toLowerCase();
                        const opts = [...new Set(
                          supplies
                            .filter(s => s.type === formData.type && s.isActive && s.id !== editingSupply?.id)
                            .map(s => s.name)
                        )]
                          .filter(name => !q || name.toLowerCase().includes(q))
                          .sort((a, b) => a.localeCompare(b, 'th'));
                        return opts.length > 0 ? (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                            {opts.map(name => (
                              <button key={name} type="button"
                                onMouseDown={() => { setFormData(p => ({ ...p, name })); setNameDropdownOpen(false); }}
                                className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors', formData.name === name && 'bg-indigo-50 text-indigo-700 font-medium')}>
                                {name}
                              </button>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">รหัสวัสดุ</label>
                      <div className="relative">
                        <input value={formData.supplyCode}
                          onChange={e => { setFormData(p => ({ ...p, supplyCode: e.target.value })); setSupplyCodeDropdownOpen(true); }}
                          onFocus={() => setSupplyCodeDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setSupplyCodeDropdownOpen(false), 150)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="เช่น SUP-001, P-2026-001"
                          autoComplete="off" />
                        {supplyCodeDropdownOpen && (() => {
                          const q = formData.supplyCode.toLowerCase();
                          const opts = [...new Set(
                            supplies
                              .filter(s => s.supplyCode && s.isActive && s.id !== editingSupply?.id)
                              .map(s => s.supplyCode as string)
                          )]
                            .filter(code => !q || code.toLowerCase().includes(q))
                            .sort((a, b) => a.localeCompare(b, 'th'));
                          return opts.length > 0 ? (
                            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                              {opts.map(code => (
                                <button key={code} type="button"
                                  onMouseDown={() => { setFormData(p => ({ ...p, supplyCode: code })); setSupplyCodeDropdownOpen(false); }}
                                  className={cn('w-full text-left px-3 py-2 text-sm font-mono hover:bg-indigo-50 hover:text-indigo-700 transition-colors', formData.supplyCode === code && 'bg-indigo-50 text-indigo-700 font-medium')}>
                                  {code}
                                </button>
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">หมวดหมู่</label>
                        <select value={formData.categoryId} onChange={e => setFormData(p => ({ ...p, categoryId: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">-- ไม่ระบุ --</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">หน่วยนับ</label>
                        <input list="unit-presets" value={formData.unit}
                          onChange={e => setFormData(p => ({ ...p, unit: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="เช่น ชิ้น, กล่อง" />
                        <datalist id="unit-presets">
                          {['ชิ้น','อัน','แท่ง','กล่อง','แพ็ค','ชุด','โหล','ม้วน','ใบ','แผ่น','ถุง','ขวด','กระป๋อง','ฝา','กิโลกรัม','กรัม','ลิตร','มิลลิลิตร','เมตร'].map(u => (
                            <option key={u} value={u} />
                          ))}
                        </datalist>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">จำนวน</label>
                        <input type="number" min="0" value={formData.currentQuantity}
                          onChange={e => setFormData(p => ({ ...p, currentQuantity: Number(e.target.value) || 0 }))}
                          className={cn(
                            'w-full border rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500',
                            formData.type === 'STOCK'
                              ? qtyColor(formData.currentQuantity, formData.minimumQuantity, formData.thresholdRed, formData.thresholdYellow).includes('red')
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : qtyColor(formData.currentQuantity, formData.minimumQuantity, formData.thresholdRed, formData.thresholdYellow).includes('amber')
                                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                                  : formData.minimumQuantity > 0 ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300'
                              : 'border-slate-300'
                          )} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: สต็อก (STOCK เท่านั้น) */}
                {/* {formData.type === 'STOCK' && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">สต็อก</span>
                      <div className="flex-1 h-px bg-slate-100" />
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนขั้นต่ำ</label>
                          <input type="number" min="0" value={formData.minimumQuantity}
                            onChange={e => setFormData(p => ({ ...p, minimumQuantity: Number(e.target.value) }))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนสูงสุด</label>
                          <input type="number" min="0" value={formData.maximumQuantity}
                            onChange={e => setFormData(p => ({ ...p, maximumQuantity: Number(e.target.value) || 0 }))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                        <p className="text-xs font-semibold text-slate-500">เกณฑ์สีสถานะ (%)</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 mb-1">
                              <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" /> แดง — ต่ำกว่า
                            </label>
                            <input type="number" min="1" max="98" value={formData.thresholdRed}
                              onChange={e => setFormData(p => ({ ...p, thresholdRed: Number(e.target.value) || 20 }))}
                              className="w-full border border-red-300 bg-red-50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                          </div>
                          <div>
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 mb-1">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" /> เหลือง — ไม่เกิน
                            </label>
                            <input type="number" min="2" max="99" value={formData.thresholdYellow}
                              onChange={e => setFormData(p => ({ ...p, thresholdYellow: Number(e.target.value) || 50 }))}
                              className="w-full border border-amber-300 bg-amber-50 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-xs text-slate-400">ตัวอย่าง:</span>
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold border text-red-600 bg-red-50 border-red-200">&lt;{formData.thresholdRed}%</span>
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold border text-amber-600 bg-amber-50 border-amber-200">{formData.thresholdRed}–{formData.thresholdYellow}%</span>
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-semibold border text-emerald-600 bg-emerald-50 border-emerald-200">&gt;{formData.thresholdYellow}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )} */}

                {/* Section: เอกสาร */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">เอกสาร</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="space-y-3">
                    {/* รูปภาพวัสดุ */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">รูปภาพวัสดุ</label>
                      <div className="flex items-start gap-3">
                        <div className="shrink-0">
                          {(imgPreview || formData.imageUrl) && !imgFile ? (
                            <img src={imgPreview || formData.imageUrl as string} alt="preview"
                              className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                          ) : imgFile && imgPreview ? (
                            <img src={imgPreview} alt="preview"
                              className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                              <Package size={24} className="text-slate-300" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <input type="file" accept="image/*"
                            onChange={e => {
                              const file = e.target.files?.[0] || null;
                              setImgFile(file);
                              if (file) setImgPreview(URL.createObjectURL(file));
                              else setImgPreview(formData.imageUrl || null);
                            }}
                            className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                          <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP ขนาดไม่เกิน 5MB</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">วันที่เบิกของ</label>
                        <input type="date" value={formData.issueDate as string}
                          onChange={e => setFormData(p => ({ ...p, issueDate: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้ลงข้อมูล</label>
                        <select value={formData.recorderName}
                          onChange={e => setFormData(p => ({ ...p, recorderName: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">-- ไม่ระบุ --</option>
                          {members.map(u => {
                            const fullName = `${u.prefix || ''}${u.name}`;
                            return (
                              <option key={u.id} value={fullName}>
                                {fullName}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่เอกสารรับ</label>
                        <div className="relative">
                          <input value={formData.documentNumber}
                            onChange={e => { setFormData(p => ({ ...p, documentNumber: e.target.value })); setDocumentNumberDropdownOpen(true); }}
                            onFocus={() => setDocumentNumberDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setDocumentNumberDropdownOpen(false), 150)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="เลขที่เอกสาร"
                            autoComplete="off" />
                          {documentNumberDropdownOpen && (() => {
                            const q = formData.documentNumber.toLowerCase();
                            const opts = [...new Set(
                              supplies
                                .filter(s => s.documentNumber && s.isActive && s.id !== editingSupply?.id)
                                .map(s => s.documentNumber as string)
                            )]
                              .filter(doc => !q || doc.toLowerCase().includes(q))
                              .sort((a, b) => a.localeCompare(b, 'th'));
                            return opts.length > 0 ? (
                              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                                {opts.map(doc => (
                                  <button key={doc} type="button"
                                    onMouseDown={() => { setFormData(p => ({ ...p, documentNumber: doc })); setDocumentNumberDropdownOpen(false); }}
                                    className={cn('w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors', formData.documentNumber === doc && 'bg-indigo-50 text-indigo-700 font-medium')}>
                                    {doc}
                                  </button>
                                ))}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">ไฟล์เอกสาร (PDF/รูป)</label>
                        <input type="file" accept=".pdf,image/*" onChange={e => setDocFile(e.target.files?.[0] || null)}
                          className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none" />
                        {formData.documentUrl && !docFile && (
                          <a href={formData.documentUrl} target="_blank" rel="noopener" className="text-xs text-indigo-600 hover:underline mt-1 flex items-center gap-1">
                            <FileText size={12} /> ดูเอกสารเดิม
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: หมายเหตุ */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">หมายเหตุ</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                  <textarea rows={2} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder="หมายเหตุเพิ่มเติม..." />
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-white text-sm font-medium transition-colors">
                  ยกเลิก
                </button>
                <button type="submit" disabled={formLoading}
                  className={cn(
                    'flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors',
                    formData.type === 'STOCK'
                      ? 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400'
                      : 'bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400'
                  )}>
                  {formLoading && <Loader2 size={14} className="animate-spin" />}
                  {editingSupply ? 'บันทึกการแก้ไข' : (formData.type === 'STOCK' ? '+ เพิ่มวัสดุคงคลัง' : '+ เพิ่มวัสดุไม่คงคลัง')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== ขอเบิกวัสดุ Modal ===== */}
      {isIssueModalOpen && issueSupply && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">

            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-bold text-slate-800 flex items-center gap-2">
                    <Package size={18} className="text-indigo-600" /> ขอเบิกวัสดุ
                  </h2>
                  <p className="text-sm text-slate-600 mt-0.5 font-medium">{issueSupply.name}</p>
                </div>
                <button onClick={() => setIsIssueModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                  <X size={18} />
                </button>
              </div>

              {/* Stock level bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>คงเหลือในคลัง</span>
                  <span className={cn('font-semibold', qtyColor(issueSupply.currentQuantity, issueSupply.minimumQuantity, issueSupply.thresholdRed, issueSupply.thresholdYellow).split(' ')[0])}>
                    {issueSupply.currentQuantity} {issueSupply.unit || ''}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all',
                      issueSupply.minimumQuantity > 0 && issueSupply.currentQuantity / issueSupply.minimumQuantity < issueSupply.thresholdRed / 100
                        ? 'bg-red-400' : issueSupply.minimumQuantity > 0 && issueSupply.currentQuantity / issueSupply.minimumQuantity <= issueSupply.thresholdYellow / 100
                        ? 'bg-amber-400' : 'bg-emerald-400'
                    )}
                    style={{ width: `${issueSupply.maximumQuantity > 0 ? Math.min(100, (issueSupply.currentQuantity / issueSupply.maximumQuantity) * 100) : issueSupply.minimumQuantity > 0 ? Math.min(100, (issueSupply.currentQuantity / issueSupply.minimumQuantity) * 100) : 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitIssue} className="p-6 space-y-4">
              {issueError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{issueError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้ขอเบิก <span className="text-rose-500">*</span></label>
                <select required value={issueForm.requesterName}
                  onChange={e => setIssueForm(p => ({ ...p, requesterName: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- เลือกผู้ขอเบิก --</option>
                  {members.map(u => {
                    const fullName = `${u.prefix || ''}${u.name}`;
                    return (
                      <option key={u.id} value={fullName}>
                        {fullName}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนที่ขอเบิก <span className="text-rose-500">*</span></label>
                <div className="flex items-center gap-2">
                  <input
                    required type="number" min="1" max={issueSupply.currentQuantity}
                    value={issueForm.quantity}
                    onChange={e => setIssueForm(p => ({ ...p, quantity: Number(e.target.value) || 1 }))}
                    className="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-500">{issueSupply.unit || ''}</span>
                  <span className="text-xs text-slate-400">/ {issueSupply.currentQuantity} {issueSupply.unit || ''}</span>
                  {issueForm.quantity > 0 && issueForm.quantity <= issueSupply.currentQuantity && (
                    <span className="text-xs text-slate-400 ml-auto">คงเหลือ: {issueSupply.currentQuantity - issueForm.quantity}</span>
                  )}
                </div>
                {issueForm.quantity > 0 && issueSupply.currentQuantity > 0 && (
                  <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (issueForm.quantity / issueSupply.currentQuantity) * 100)}%` }} />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ผู้จำหน่าย</label>
                <select value={issueForm.supplierName}
                  onChange={e => setIssueForm(p => ({ ...p, supplierName: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- ไม่ระบุ --</option>
                  {members.map(u => {
                    const fullName = `${u.prefix || ''}${u.name}`;
                    return (
                      <option key={u.id} value={fullName}>
                        {fullName}{u.role === 'SUPER_ADMIN' ? ' ★' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">วันที่เบิก</label>
                  <input type="date" value={issueForm.issueDate}
                    onChange={e => setIssueForm(p => ({ ...p, issueDate: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่เอกสาร</label>
                  <input value={issueForm.documentNumber}
                    onChange={e => setIssueForm(p => ({ ...p, documentNumber: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="เลขที่เอกสาร" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <textarea rows={2} value={issueForm.notes}
                  onChange={e => setIssueForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="หมายเหตุเพิ่มเติม..." />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setIsIssueModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium">
                  ยกเลิก
                </button>
                <button type="submit" disabled={issueSubmitLoading}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center justify-center gap-2 disabled:bg-indigo-400">
                  {issueSubmitLoading ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                  ยืนยันการเบิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Merge Duplicates Modal ===== */}
      {isMergeOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="font-bold text-slate-800">รวมรายการซ้ำ</h2>
                <p className="text-sm text-slate-500 mt-0.5">รายการที่มีชื่อเหมือนกันจะถูกรวมเป็นหนึ่งรายการ</p>
              </div>
              <button onClick={() => setIsMergeOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {allDuplicateGroups.length === 0 ? (
                <p className="text-center text-slate-400 py-8">ไม่มีรายการซ้ำแล้ว</p>
              ) : allDuplicateGroups.map(({ key, group }) => {
                const primary = group[0];
                const totalQty = group.reduce((sum, s) => sum + s.currentQuantity, 0);
                const isGroupMerging = mergeLoading === key;
                return (
                  <div key={key} className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{primary.name}</p>
                        <p className="text-xs text-slate-400">{SUPPLY_TYPE_LABELS[primary.type]} — {group.length} รายการ</p>
                      </div>
                      <span className="text-sm text-slate-500">
                        รวม: <strong className="text-indigo-600">{totalQty} {primary.unit || ''}</strong>
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.map((s, i) => (
                        <div key={s.id} className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
                          i === 0 ? 'bg-indigo-50 border border-indigo-200' : 'bg-slate-50 border border-slate-200'
                        )}>
                          <span className="font-mono text-xs text-slate-400 w-8">#{s.id}</span>
                          <span className="flex-1 text-slate-700">คงเหลือ {s.currentQuantity} {s.unit || ''}</span>
                          {i === 0 && (
                            <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">หลัก</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        // Merge all into primary sequentially
                        for (let i = 1; i < group.length; i++) {
                          await handleMerge(group[0].id, group[i].id, key);
                        }
                      }}
                      disabled={isGroupMerging}
                      className="w-full py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700 disabled:bg-rose-400 flex items-center justify-center gap-2 transition-colors"
                    >
                      {isGroupMerging ? <Loader2 size={14} className="animate-spin" /> : null}
                      รวมเป็นรายการเดียว (รหัส #{primary.id})
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 shrink-0">
              <button onClick={() => setIsMergeOpen(false)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium">
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Transaction Modal ===== */}
      {isTxModalOpen && selectedSupply && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">ทำรายการวัสดุ</h2>
                <p className="text-sm text-slate-500">{selectedSupply.name} — คงเหลือ <strong>{selectedSupply.currentQuantity}</strong> {selectedSupply.unit || ''}</p>
              </div>
              <button onClick={() => setIsTxModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitTx} className="p-5 space-y-4">
              {txError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{txError}</div>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ประเภทรายการ *</label>
                <select value={txForm.type} onChange={e => setTxForm(p => ({ ...p, type: e.target.value as TransactionType }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="RECEIVE">รับเข้า</option>
                  <option value="RETURN">คืน</option>
                  <option value="ADJUST">ปรับยอด (ตั้งค่าสมบูรณ์)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {txForm.type === 'ADJUST' ? 'จำนวนใหม่' : 'จำนวน'} *
                </label>
                <input required type="number" min="1" value={txForm.quantity} onChange={e => setTxForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              {txForm.type === 'RECEIVE' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้รับ-บันทึกรายการ</label>
                  <select value={txForm.recipientName} onChange={e => setTxForm(p => ({ ...p, recipientName: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- ไม่ระบุ --</option>
                    {members.map(u => { const n = `${u.prefix || ''}${u.name}`; return <option key={u.id} value={n}>{n}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}</option>; })}
                  </select>
                </div>
              )}

              {txForm.type === 'RETURN' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้คืน</label>
                    <select value={txForm.returnerName} onChange={e => setTxForm(p => ({ ...p, returnerName: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">-- ไม่ระบุ --</option>
                      {members.map(u => { const n = `${u.prefix || ''}${u.name}`; return <option key={u.id} value={n}>{n}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}</option>; })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ผู้รับคืน</label>
                    <select value={txForm.returnReceiverName} onChange={e => setTxForm(p => ({ ...p, returnReceiverName: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">-- ไม่ระบุ --</option>
                      {members.map(u => { const n = `${u.prefix || ''}${u.name}`; return <option key={u.id} value={n}>{n}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}</option>; })}
                    </select>
                  </div>
                </div>
              )}

              {txForm.type === 'ADJUST' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อผู้ปรับยอด</label>
                  <select value={txForm.adjusterName} onChange={e => setTxForm(p => ({ ...p, adjusterName: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">-- ไม่ระบุ --</option>
                    {members.map(u => { const n = `${u.prefix || ''}${u.name}`; return <option key={u.id} value={n}>{n}{(u.role === 'SUPER_ADMIN' || u.role === 'ADMIN') ? ' ★' : ''}</option>; })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่เอกสาร</label>
                  <input value={txForm.documentNumber} onChange={e => setTxForm(p => ({ ...p, documentNumber: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เลขที่" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ไฟล์แนบ (PDF)</label>
                  <input type="file" accept=".pdf,image/*" onChange={e => setTxDocFile(e.target.files?.[0] || null)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <textarea rows={2} value={txForm.notes} onChange={e => setTxForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsTxModalOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                <button type="submit" disabled={txLoading} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400 flex items-center justify-center gap-2">
                  {txLoading && <Loader2 size={14} className="animate-spin" />}
                  บันทึกรายการ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== History Modal ===== */}
      {isHistoryOpen && historySupply && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">ประวัติ — {historySupply.name}</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                  {historySupply.type === 'STOCK' && (
                    <p className="text-sm text-slate-500">คงเหลือ: <strong>{historySupply.currentQuantity}</strong> {historySupply.unit || ''}</p>
                  )}
                  {historySupply.issueDate && (
                    <p className="text-sm text-slate-500">วันที่เบิก: <strong>{new Date(historySupply.issueDate as string).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}</strong></p>
                  )}
                  {historySupply.recorderName && (
                    <p className="text-sm text-slate-500">ผู้ลงข้อมูล: <strong>{historySupply.recorderName}</strong></p>
                  )}
                </div>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            {/* Search + Sort toolbar */}
            {!historyLoading && (historySupply as any).transactions?.length > 0 && (
              <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ค้นหา ประเภท, ชื่อผู้รับ, เลขที่เอกสาร, หมายเหตุ..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  onClick={() => setHistorySortAsc(p => !p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 whitespace-nowrap"
                  title={historySortAsc ? 'เรียงเก่า→ใหม่' : 'เรียงใหม่→เก่า'}
                >
                  <ChevronDown size={13} className={cn('transition-transform', historySortAsc && 'rotate-180')} />
                  {historySortAsc ? 'เก่า→ใหม่' : 'ใหม่→เก่า'}
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-5">
              {historyLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600 w-6 h-6" /></div>
              ) : !(historySupply as any).transactions?.length ? (
                <p className="text-center text-slate-400 py-8">ยังไม่มีประวัติการเคลื่อนไหว</p>
              ) : (() => {
                  const q = historySearch.toLowerCase();
                  const filtered = (historySupply as any).transactions.filter((tx: SupplyTransaction) =>
                    !q ||
                    TX_TYPE_LABELS[tx.type]?.label.includes(q) ||
                    (tx.recipientName || '').toLowerCase().includes(q) ||
                    ((tx.performedBy as any)?.name || '').toLowerCase().includes(q) ||
                    (tx.documentNumber || '').toLowerCase().includes(q) ||
                    (tx.notes || '').toLowerCase().includes(q)
                  );
                  const sorted = [...filtered].sort((a: SupplyTransaction, b: SupplyTransaction) => {
                    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    return historySortAsc ? diff : -diff;
                  });
                  return sorted.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">ไม่พบรายการที่ค้นหา</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">วันที่</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">ประเภท</th>
                          <th className="text-center py-2 px-3 font-semibold text-slate-600">จำนวน</th>
                          <th className="text-center py-2 px-3 font-semibold text-slate-600">ก่อน→หลัง</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">ผู้รับ/ผู้ทำรายการ</th>
                          <th className="text-left py-2 px-3 font-semibold text-slate-600">เอกสาร</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sorted.map((tx: SupplyTransaction) => (
                          <tr key={tx.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                            <td className="py-2 px-3">
                              <span className={cn('font-medium text-sm', TX_TYPE_LABELS[tx.type]?.color)}>
                                {TX_TYPE_LABELS[tx.type]?.label}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center font-semibold">{tx.quantity}</td>
                            <td className="py-2 px-3 text-center text-slate-500">{tx.quantityBefore} → {tx.quantityAfter}</td>
                            <td className="py-2 px-3 text-slate-600">
                              {tx.recipientName && <div className="text-xs">{tx.recipientName}</div>}
                              <div className="text-xs text-slate-400">{(tx.performedBy as any)?.name}</div>
                              {tx.notes && <div className="text-xs text-slate-400 italic">{tx.notes}</div>}
                            </td>
                            <td className="py-2 px-3">
                              {tx.documentNumber && <div className="text-xs text-slate-600">{tx.documentNumber}</div>}
                              {tx.documentUrl && <a href={tx.documentUrl} target="_blank" rel="noopener" className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><FileText size={12} /> เปิดไฟล์</a>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()
              }
            </div>
          </div>
        </div>
      )}

      {/* ===== Settings Modal (per-item thresholds) ===== */}
      {isSettingsOpen && settingsSupply && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-800">ตั้งค่าเกณฑ์สต็อก</h2>
                <p className="text-sm text-slate-500 truncate max-w-[220px]">{settingsSupply.name}</p>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveSettings} className="p-5 space-y-4">
              {settingsError && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{settingsError}</div>}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนขั้นต่ำ</label>
                  <input type="number" min="0" value={settingsForm.minimumQuantity}
                    onChange={e => setSettingsForm(p => ({ ...p, minimumQuantity: Number(e.target.value) || 0 }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">จำนวนสูงสุด</label>
                  <input type="number" min="0" value={settingsForm.maximumQuantity}
                    onChange={e => setSettingsForm(p => ({ ...p, maximumQuantity: Number(e.target.value) || 0 }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">เกณฑ์สีคงเหลือ (% ของขั้นต่ำ)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-1 align-middle"></span>
                      แดง — ต่ำกว่า (%)
                    </label>
                    <input type="number" min="1" max="98" value={settingsForm.thresholdRed}
                      onChange={e => setSettingsForm(p => ({ ...p, thresholdRed: Number(e.target.value) || 20 }))}
                      className="w-full border border-red-300 bg-red-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      <span className="inline-block w-3 h-3 rounded-full bg-amber-400 mr-1 align-middle"></span>
                      เหลือง — ไม่เกิน (%)
                    </label>
                    <input type="number" min="2" max="99" value={settingsForm.thresholdYellow}
                      onChange={e => setSettingsForm(p => ({ ...p, thresholdYellow: Number(e.target.value) || 50 }))}
                      className="w-full border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>
                </div>

                {/* Preview */}
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <span className="text-xs text-slate-500">ตัวอย่าง:</span>
                  <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-semibold border', 'text-red-600 bg-red-50 border-red-200')}>
                    &lt;{settingsForm.thresholdRed}%
                  </span>
                  <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-semibold border', 'text-amber-600 bg-amber-50 border-amber-200')}>
                    {settingsForm.thresholdRed}–{settingsForm.thresholdYellow}%
                  </span>
                  <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-semibold border', 'text-emerald-600 bg-emerald-50 border-emerald-200')}>
                    &gt;{settingsForm.thresholdYellow}%
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsSettingsOpen(false)} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">ยกเลิก</button>
                <button type="submit" disabled={settingsLoading} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:bg-indigo-400 flex items-center justify-center gap-2">
                  {settingsLoading && <Loader2 size={14} className="animate-spin" />}
                  บันทึก
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
              <h2 className="font-bold text-slate-800">จัดการหมวดหมู่วัสดุ</h2>
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

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Download size={18} className="text-indigo-600" />
                <h2 className="font-bold text-slate-800">Export รายงานวัสดุ</h2>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Period selector */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ช่วงเวลา</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([['week', 'สัปดาห์นี้'], ['month', 'เดือนนี้'], ['custom', 'กำหนดเอง']] as const).map(([val, label]) => (
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

              {/* Custom date range */}
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

              {/* Type selector */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ประเภทวัสดุ</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {([['all', 'ทั้งหมด'], ['STOCK', 'คงคลัง'], ['NON_STOCK', 'ไม่คงคลัง']] as const).map(([val, label]) => (
                    <button key={val} onClick={() => setExportType(val)}
                      className={cn('py-2 rounded-lg border text-sm font-medium transition-colors',
                        exportType === val
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      )}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info box */}
              <div className="p-3 bg-indigo-50 rounded-lg text-xs text-indigo-700 space-y-1">
                {exportType === 'all' ? (
                  <>
                    <p className="font-semibold">ไฟล์ Excel จะประกอบด้วย 4 Sheet:</p>
                    <p>1. คงคลัง (STOCK) — รายการวัสดุคงคลัง ณ ปัจจุบัน</p>
                    <p>2. ไม่คงคลัง (NON_STOCK) — รายการวัสดุไม่คงคลัง ณ ปัจจุบัน</p>
                    <p>3. ประวัติการเบิก-รับ — ตามช่วงเวลาที่เลือก</p>
                    <p>4. สินค้าใกล้หมด — วัสดุที่ต่ำกว่าขั้นต่ำ (STOCK)</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">ไฟล์ Excel จะประกอบด้วย 3 Sheet:</p>
                    <p>1. สรุปวัสดุ — รายการวัสดุทั้งหมด ณ ปัจจุบัน</p>
                    <p>2. ประวัติการเบิก-รับ — ตามช่วงเวลาที่เลือก</p>
                    <p>3. สินค้าใกล้หมด — วัสดุที่ต่ำกว่าขั้นต่ำ (STOCK)</p>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
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
