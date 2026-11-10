/**
 * ==================================================
 * Employees Page - หน้ารายชื่อพนักงาน (อัปเดตเวอร์ชันใหม่)
 * ==================================================
 * เพิ่มฟีเจอร์:
 * - Import รายชื่อพนักงานจาก CSV
 */

'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrg } from '@/contexts/OrgContext';
import { unitSelectionOf } from '@/lib/org-settings';
import Image from 'next/image';
import {
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Search,
  X,
  Users,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  Edit3,
  Save,
  Camera,
  Building2,
  Briefcase,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { User, UserRole, Department, Position, PositionSecond } from '@/types';
import SignatureUploader from '@/components/profile/SignatureUploader';
import { useCurrentUser } from '@/contexts/UserContext';
import { roleConfig } from '@/lib/role-badge';

/**
 * คำนำหน้าชื่อ
 */
const prefixOptions = [
  // พลเรือน
  { group: 'พลเรือน', items: ['นาย', 'นาง', 'นางสาว', 'น.ส.', 'เด็กชาย', 'เด็กหญิง'] },
  // ทหารบก
  { group: 'ทหารบก', items: [
    'พล.อ.', 'พล.ท.', 'พล.ต.', 'พ.อ.', 'พ.ท.', 'พ.ต.',
    'ร.อ.', 'ร.ท.', 'ร.ต.', 'ว่าที่ ร.ต.',
    'จ.ส.อ.', 'จ.ส.ท.', 'จ.ส.ต.', 'ส.อ.', 'ส.ท.', 'ส.ต.',
    'พลทหาร',
  ]},
  // ทหารเรือ
  { group: 'ทหารเรือ', items: [
    'พล.ร.อ.', 'พล.ร.ท.', 'พล.ร.ต.', 'น.อ.', 'น.ท.', 'น.ต.',
    'ร.อ.', 'ร.ท.', 'ร.ต.', 'ว่าที่ ร.ต.',
    'พ.จ.อ.', 'พ.จ.ท.', 'พ.จ.ต.', 'จ.อ.', 'จ.ท.', 'จ.ต.',
    'พลทหาร',
  ]},
  // ทหารอากาศ
  { group: 'ทหารอากาศ', items: [
    'พล.อ.อ.', 'พล.อ.ท.', 'พล.อ.ต.', 'น.อ.', 'น.ท.', 'น.ต.',
    'ร.อ.', 'ร.ท.', 'ร.ต.', 'ว่าที่ ร.ต.',
    'พ.อ.อ.', 'พ.อ.ท.', 'พ.อ.ต.', 'จ.อ.', 'จ.ท.', 'จ.ต.',
    'พลทหาร',
  ]},
  // ตำรวจ
  { group: 'ตำรวจ', items: [
    'พล.ต.อ.', 'พล.ต.ท.', 'พล.ต.ต.', 'พ.ต.อ.', 'พ.ต.ท.', 'พ.ต.ต.',
    'ร.ต.อ.', 'ร.ต.ท.', 'ร.ต.ต.',
    'ด.ต.', 'จ.ส.ต.', 'ส.ต.อ.', 'ส.ต.ท.', 'ส.ต.ต.',
    'พลตำรวจ',
  ]},
  // ราชทินนาม / อื่นๆ
  { group: 'อื่นๆ', items: ['คุณหญิง', 'ท่านผู้หญิง', 'หม่อมหลวง', 'หม่อมราชวงศ์', 'หม่อมเจ้า', 'ดร.', 'ศ.', 'รศ.', 'ผศ.'] },
];

/**
 * หน้ารายชื่อพนักงาน
 */
/**
 * ช่อง กอง/สังกัด ของพนักงาน: เลือก "หน่วยงานหลัก" (ชื่อจากหน้าตั้งค่า — เปลี่ยนชื่อที่เดียวแล้วตามให้เอง)
 * หรือ "อื่นๆ (ช่วยราชการ)" แล้วกรอกชื่อของหน่วยที่มาช่วยราชการเอง
 */
function UnitField({
  label,
  value,
  orgValue,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  orgValue: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [mode, setMode] = useState<'main' | 'other'>(() => unitSelectionOf(value, orgValue));
  return (
    <div className="col-span-2">
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <select
        className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
        value={mode}
        onChange={(e) => {
          const next = e.target.value as 'main' | 'other';
          setMode(next);
          onChange(next === 'main' ? orgValue : '');
        }}
      >
        <option value="main">{orgValue} (หน่วยงานหลัก)</option>
        <option value="other">อื่นๆ (ช่วยราชการ)</option>
      </select>
      {mode === 'other' && (
        <input
          type="text"
          className="w-full border border-slate-300 rounded-lg p-2.5 outline-none mt-2"
          placeholder={placeholder}
          maxLength={label === 'กอง' ? 100 : 200}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export default function EmployeesPageClient() {
  const org = useOrg();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { role: userRole } = useCurrentUser();

  // State สำหรับเก็บรายชื่อพนักงาน
  const [users, setUsers] = useState<User[]>([]);
  
  // State สำหรับสถานะการโหลด
  const [isLoading, setIsLoading] = useState(true);
  
  // State สำหรับข้อผิดพลาด
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  
  // State สำหรับเปิด/ปิด Modal สร้างพนักงาน
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // State สำหรับเปิด/ปิด Modal Import
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // State สำหรับค้นหา
  const [searchQuery, setSearchQuery] = useState('');
  
  // State สำหรับ Import
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // State สำหรับข้อมูลพนักงานใหม่
  const [newUser, setNewUser] = useState({
    prefix: '',
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'EMPLOYEE' as UserRole,
    department: '',
    supervisorId: '',
  });

  // State สำหรับ Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    prefix: '',
    name: '',
    email: '',
    role: 'EMPLOYEE' as UserRole,
    department: '',
    section: '',
    division: '',
    position: '',
    positionSecond: '',
    positionLevel: '',
    phone: '',
    birthday: '',
    address: '',
    isActive: true,
    supervisorId: '',
  });
  const [isUploading, setIsUploading] = useState(false);
  const profileInputRef = useRef<HTMLInputElement>(null);

  // State สำหรับ Department/Position Management
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [positionSeconds, setPositionSeconds] = useState<PositionSecond[]>([]);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<'departments' | 'positions' | 'positionSeconds'>('departments');
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newPosSecondHasLevel, setNewPosSecondHasLevel] = useState(false);
  const [newPosSecondMaxLevel, setNewPosSecondMaxLevel] = useState('');

  /**
   * ดึงข้อมูลพนักงานจาก API
   */
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // ผู้ใช้/แผนก/ตำแหน่ง/ตำแหน่งรอง ไม่ขึ้นต่อกัน ยิงพร้อมกันได้
        const [response, deptRes, posRes, posSecRes] = await Promise.all([
          fetch('/api/users'),
          fetch('/api/departments'),
          fetch('/api/positions'),
          fetch('/api/position-seconds'),
        ]);
        const [data, deptData, posData, posSecData] = await Promise.all([
          response.json(),
          deptRes.json(),
          posRes.json(),
          posSecRes.json(),
        ]);

        if (!response.ok) {
          throw new Error(data.message || 'ไม่สามารถดึงข้อมูลพนักงานได้');
        }

        if (data.success) {
          setUsers(data.data);
        }

        if (deptData.success) setDepartments(deptData.data);
        if (posData.success) setPositions(posData.data);
        if (posSecData.success) setPositionSeconds(posSecData.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  /**
   * ฟังก์ชันสร้างพนักงานใหม่
   */
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.username.trim() || !newUser.password.trim()) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newUser,
          supervisorId: newUser.supervisorId ? parseInt(newUser.supervisorId) : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'ไม่สามารถสร้างพนักงานได้');
      }

      if (data.success) {
        setUsers([...users, data.data]);
        setIsModalOpen(false);
        setNewUser({
          prefix: '',
          name: '',
          email: '',
          username: '',
          password: '',
          role: 'EMPLOYEE',
          department: '',
          supervisorId: '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันลบพนักงาน
   */
  const handleDeleteUser = async (userId: number) => {
    if (!confirm('ต้องการลบพนักงานรายนี้ใช่หรือไม่?')) return;
    
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถลบพนักงานได้');
      }
      
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันเลือกไฟล์
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setError('รองรับเฉพาะไฟล์ CSV เท่านั้น');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  /**
   * ฟังก์ชัน Import พนักงาน
   */
  const handleImport = async () => {
    if (!selectedFile) {
      setError('กรุณาเลือกไฟล์ CSV');
      return;
    }

    try {
      setIsImporting(true);
      setImportResult(null);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/users/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'ไม่สามารถ import ข้อมูลได้');
      }

      setImportResult(data.data);

      // รีโหลดข้อมูลพนักงาน
      const usersResponse = await fetch('/api/users');
      const usersData = await usersResponse.json();
      if (usersData.success) {
        setUsers(usersData.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsImporting(false);
    }
  };

  /**
   * ดาวน์โหลดตัวอย่างไฟล์ CSV
   */
  const downloadTemplate = () => {
    const headers = ['name', 'email', 'username', 'role', 'department'];
    const example = [
      'สมชาย ใจดี,somchai@example.com,somchai,EMPLOYEE,Development',
      'สมหญิง รักงาน,somying@example.com,somying,HR,HR',
      'วิชัย เก่งกาจ,wichai@example.com,wichai,MANAGER,Management',
    ];
    
    const csv = '\uFEFF' + [headers.join(','), ...example].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'employees_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /**
   * เปิด Edit Modal
   */
  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditForm({
      prefix: user.prefix || '',
      name: user.name,
      email: user.email || '',
      role: user.role,
      department: user.department || '',
      section: user.section || '',
      division: user.division || '',
      position: user.position || '',
      positionSecond: user.positionSecond || '',
      positionLevel: user.positionLevel ? String(user.positionLevel) : '',
      phone: (user as any).phone || '',
      birthday: (user as any).birthday ? new Date((user as any).birthday).toISOString().split('T')[0] : '',
      address: (user as any).address || '',
      isActive: user.isActive,
      supervisorId: user.supervisorId ? String(user.supervisorId) : '',
    });
    setEditError(null);
    setIsEditModalOpen(true);
  };

  /**
   * บันทึกการแก้ไขพนักงาน
   */
  const handleSaveEdit = async () => {
    if (!editingUser || !editForm.name.trim()) return;
    setEditError(null);

    try {
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: editForm.prefix || null,
          name: editForm.name,
          email: editForm.email.trim() || null,
          role: editForm.role,
          department: editForm.department || null,
          section: editForm.section.trim() || null,
          division: editForm.division || null,
          position: editForm.position || null,
          positionSecond: editForm.positionSecond || null,
          positionLevel: editForm.positionLevel ? parseInt(editForm.positionLevel) : null,
          phone: editForm.phone || null,
          birthday: editForm.birthday || null,
          address: editForm.address || null,
          isActive: editForm.isActive,
          supervisorId: editForm.supervisorId ? parseInt(editForm.supervisorId) : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setEditError(data.message || data.details ? JSON.stringify(data.details) : 'ไม่สามารถอัปเดตได้');
        return;
      }

      if (data.success) {
        setUsers(users.map(u => u.id === editingUser.id ? data.data : u));
        setEditingUser(data.data);
        setIsEditModalOpen(false);
        setEditingUser(null);
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  };

  /**
   * อัปโหลดรูปโปรไฟล์
   */
  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingUser) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('รองรับเฉพาะไฟล์ JPG, PNG, WEBP');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('ขนาดไฟล์ต้องไม่เกิน 5MB');
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', String(editingUser.id));

      const response = await fetch('/api/users/upload-profile', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'อัปโหลดไม่สำเร็จ');

      if (data.success) {
        setUsers(users.map(u => u.id === editingUser.id ? data.data : u));
        setEditingUser(data.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * เพิ่มแผนก/ตำแหน่งใหม่
   */
  const handleAddItem = async () => {
    if (!newItemName.trim()) return;

    try {
      let url = '';
      const body: any = { name: newItemName, description: newItemDesc || null };

      if (manageTab === 'departments') {
        url = '/api/departments';
      } else if (manageTab === 'positions') {
        url = '/api/positions';
      } else {
        url = '/api/position-seconds';
        body.hasLevel = newPosSecondHasLevel;
        body.maxLevel = newPosSecondMaxLevel ? parseInt(newPosSecondMaxLevel) : null;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'ไม่สามารถเพิ่มได้');

      if (data.success) {
        if (manageTab === 'departments') {
          setDepartments([...departments, data.data]);
        } else if (manageTab === 'positions') {
          setPositions([...positions, data.data]);
        } else {
          setPositionSeconds([...positionSeconds, data.data]);
        }
        setNewItemName('');
        setNewItemDesc('');
        setNewPosSecondHasLevel(false);
        setNewPosSecondMaxLevel('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ลบแผนก/ตำแหน่ง
   */
  const handleDeleteItem = async (id: number) => {
    if (!confirm('ต้องการลบรายการนี้ใช่หรือไม่?')) return;

    try {
      let url = '';
      if (manageTab === 'departments') {
        url = `/api/departments?id=${id}`;
      } else if (manageTab === 'positions') {
        url = `/api/positions?id=${id}`;
      } else {
        url = `/api/position-seconds?id=${id}`;
      }

      const response = await fetch(url, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถลบได้');
      }

      if (manageTab === 'departments') {
        setDepartments(departments.filter(d => d.id !== id));
      } else if (manageTab === 'positions') {
        setPositions(positions.filter(p => p.id !== id));
      } else {
        setPositionSeconds(positionSeconds.filter(p => p.id !== id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    }
  };

  /**
   * ฟังก์ชันกรองผู้ใช้ตามคำค้นหา
   */
  const filteredUsers = useMemo(() => users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.department?.toLowerCase().includes(searchQuery.toLowerCase())
  ), [users, searchQuery]);

  // ตรวจสอบสิทธิ์
  const canManageUsers = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);

  // แสดง loading ขณะโหลดข้อมูล
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* หัวข้อหน้า */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">รายชื่อพนักงาน</h1>
          <p className="text-slate-500 mt-1">
            สมาชิกทั้งหมด {users.length} คน
          </p>
        </div>
        {canManageUsers && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setIsManageOpen(!isManageOpen)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
                isManageOpen
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              <Building2 size={18} />
              <span>จัดการแผนก/ตำแหน่ง</span>
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className={cn(
                "flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg",
                "hover:bg-emerald-200 transition-colors"
              )}
            >
              <Upload size={18} />
              <span>Import CSV</span>
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className={cn(
                "flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg",
                "hover:bg-indigo-700 transition-colors shadow-sm"
              )}
            >
              <Plus size={18} />
              <span>เพิ่มพนักงานใหม่</span>
            </button>
          </div>
        )}
      </div>

      {/* แสดงข้อผิดพลาด */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-500" />
          <p className="text-rose-600">{error}</p>
        </div>
      )}

      {/* ช่องค้นหา */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="ค้นหาพนักงาน..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      </div>

      {/* Department/Position Management Panel */}
      {isManageOpen && canManageUsers && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-200 p-6">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Building2 size={18} className="text-amber-600" />
            จัดการแผนก/ตำแหน่ง
          </h3>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1">
            {[
              { key: 'departments' as const, label: 'แผนก/กอง' },
              { key: 'positions' as const, label: 'ตำแหน่งหลัก' },
              { key: 'positionSeconds' as const, label: 'ตำแหน่งรอง' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setManageTab(tab.key); setNewItemName(''); setNewItemDesc(''); }}
                className={cn(
                  "flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors",
                  manageTab === tab.key
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
            {manageTab === 'departments' && departments.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{item.name}</span>
                <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50 transition-colors"><Trash2 size={14} /></button>
              </div>
            ))}
            {manageTab === 'positions' && positions.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{item.name}</span>
                <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50 transition-colors"><Trash2 size={14} /></button>
              </div>
            ))}
            {manageTab === 'positionSeconds' && positionSeconds.map((item) => (
              <div key={item.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-slate-700">{item.name}</span>
                  {item.hasLevel && (
                    <span className="text-xs text-slate-400 ml-2">(มีระดับ 1-{item.maxLevel || 11})</span>
                  )}
                </div>
                <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-rose-500 p-1 rounded hover:bg-rose-50 transition-colors"><Trash2 size={14} /></button>
              </div>
            ))}
            {(manageTab === 'departments' ? departments : manageTab === 'positions' ? positions : positionSeconds).length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">ยังไม่มีรายการ</p>
            )}
          </div>

          {/* Add new */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder={manageTab === 'departments' ? 'ชื่อแผนก...' : manageTab === 'positions' ? 'ชื่อตำแหน่ง...' : 'ชื่อตำแหน่งรอง...'}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {manageTab === 'positionSeconds' && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={newPosSecondHasLevel}
                  onChange={(e) => setNewPosSecondHasLevel(e.target.checked)}
                  className="rounded"
                />
                มีระดับ
              </label>
            )}
            <button
              onClick={handleAddItem}
              disabled={!newItemName.trim()}
              className={cn(
                "bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors flex items-center gap-1",
                !newItemName.trim() && "opacity-50 cursor-not-allowed"
              )}
            >
              <Plus size={16} />
              เพิ่ม
            </button>
          </div>
        </div>
      )}

      {/* ตารางพนักงาน */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="py-4 px-6 font-semibold text-sm text-slate-600">พนักงาน</th>
                <th className="py-4 px-6 font-semibold text-sm text-slate-600">ตำแหน่ง/แผนก</th>
                <th className="py-4 px-6 font-semibold text-sm text-slate-600">สถานะ</th>
                {canManageUsers && (
                  <th className="py-4 px-6 font-semibold text-sm text-slate-600 text-right">จัดการ</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={canManageUsers ? 4 : 3} className="py-12 text-center text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>ไม่พบข้อมูลพนักงาน</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                    onClick={() => openEditModal(user)}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {user.profileImage ? (
                          <Image
                            src={user.profileImage}
                            unoptimized // เปิดผ่าน /api/files (ต้องมี cookie) — ตัว optimizer ของ Next เรียกแบบไม่มี cookie จะได้ 401
                            alt={user.name}
                            width={36}
                            height={36}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 border border-indigo-200">
                            {user.avatar || user.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-slate-700 block">{user.prefix ? `${user.prefix}${user.name}` : user.name}</span>
                          <span className="text-xs text-slate-400">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                          roleConfig[user.role].bg,
                          roleConfig[user.role].text
                        )}
                      >
                        {roleConfig[user.role].label}
                      </span>
                      {user.department && (
                        <p className="text-xs text-slate-500 mt-1">{user.department}</p>
                      )}
                      {user.position && (
                        <p className="text-xs text-slate-400 mt-0.5">{user.position}</p>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                          user.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManageUsers && (
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(user); }}
                            className="text-slate-400 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-lg opacity-0 group-hover:opacity-100"
                            title="แก้ไข"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteUser(user.id); }}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100"
                            title="ลบ"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal เพิ่มพนักงาน */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 sticky top-0">
              <h3 className="font-bold text-slate-800">เพิ่มพนักงานใหม่</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  คำนำหน้า / ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    className="w-32 border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    value={newUser.prefix}
                    onChange={(e) => setNewUser({ ...newUser, prefix: e.target.value })}
                  >
                    <option value="">ไม่ระบุ</option>
                    {prefixOptions.map((group) => (
                      <optgroup key={group.group} label={group.group}>
                        {group.items.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    className="flex-1 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="สมชาย ใจดี"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  อีเมล <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="email@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ชื่อผู้ใช้ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  รหัสผ่าน <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="w-full border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="รหัสผ่านอย่างน้อย 8 ตัวอักษร"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ตำแหน่ง
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="HR">HR</option>
                  <option value="MANAGER">Manager</option>
                  <option value="DIRECTOR">Director</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  แผนก
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newUser.department}
                  onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                >
                  <option value="">เลือกแผนก...</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Development">Development</option>
                  <option value="HR">HR</option>
                  <option value="Management">Management</option>
                  <option value="Sales">Sales</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  หัวหน้างาน (ผู้บังคับบัญชา)
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                  value={newUser.supervisorId}
                  onChange={(e) => setNewUser({ ...newUser, supervisorId: e.target.value })}
                >
                  <option value="">ไม่ระบุ</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
              >
                บันทึก
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Import */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-600" />
                Import พนักงานจาก CSV
              </h3>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setSelectedFile(null);
                  setImportResult(null);
                  setError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* ดาวน์โหลดตัวอย่าง */}
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-slate-700 mb-2">รูปแบบไฟล์ CSV</p>
                <p className="text-xs text-slate-500 mb-3">
                  คอลัมน์ที่จำเป็น: name, email, username<br/>
                  คอลัมน์เพิ่มเติม: role, department
                </p>
                <button
                  onClick={downloadTemplate}
                  className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Download size={14} />
                  ดาวน์โหลดไฟล์ตัวอย่าง
                </button>
              </div>

              {/* อัปโหลดไฟล์ */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  เลือกไฟล์ CSV
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                    selectedFile 
                      ? "border-emerald-300 bg-emerald-50" 
                      : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-700">
                      <FileSpreadsheet size={24} />
                      <span className="font-medium">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-slate-500">
                      <Upload className="w-8 h-8 mx-auto mb-2" />
                      <p>คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวาง</p>
                      <p className="text-xs mt-1">รองรับเฉพาะไฟล์ CSV</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ผลลัพธ์ Import */}
              {importResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-emerald-700 mb-2">
                    <CheckCircle size={20} />
                    <span className="font-medium">Import สำเร็จ</span>
                  </div>
                  <div className="text-sm text-emerald-600 space-y-1">
                    <p>นำเข้าสำเร็จ: {importResult.imported} รายการ</p>
                    <p>ข้าม (ซ้ำ): {importResult.skipped} รายการ</p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="font-medium">ข้อผิดพลาด:</p>
                        <ul className="list-disc list-inside text-xs mt-1">
                          {importResult.errors.slice(0, 5).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {importResult.errors.length > 5 && (
                            <li>...และอีก {importResult.errors.length - 5} รายการ</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={handleImport}
                disabled={!selectedFile || isImporting}
                className={cn(
                  "w-full bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 font-medium transition-colors",
                  "flex items-center justify-center gap-2",
                  (!selectedFile || isImporting) && "opacity-70 cursor-not-allowed"
                )}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>กำลัง Import...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    <span>Import พนักงาน</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Edit3 size={18} />
                แก้ไขข้อมูลพนักงาน
              </h3>
              <button
                onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Profile Image */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  {editingUser.profileImage ? (
                    <Image
                      src={editingUser.profileImage}
                      unoptimized
                      alt={editingUser.name}
                      width={80}
                      height={80}
                      className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600 border-2 border-indigo-200">
                      {editingUser.avatar || editingUser.name.charAt(0)}
                    </div>
                  )}
                  <button
                    onClick={() => profileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute -bottom-1 -right-1 bg-indigo-600 text-white p-1.5 rounded-full hover:bg-indigo-700 transition-colors shadow-md"
                  >
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  </button>
                  <input
                    ref={profileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleProfileUpload}
                    className="hidden"
                  />
                </div>
                <div>
                  <p className="font-medium text-slate-800">{editingUser.name}</p>
                  <p className="text-xs text-slate-400">{editingUser.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">คลิกไอคอนกล้องเพื่อเปลี่ยนรูป</p>
                </div>
              </div>

              {/* ลายเซ็น (ใช้วางบนแบบฟอร์มลา) */}
              <SignatureUploader
                key={editingUser.id}
                userId={editingUser.id}
                signatureFileId={editingUser.signatureFileId}
                onChange={(id) => {
                  setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, signatureFileId: id } : u)));
                  setEditingUser((u) => (u ? { ...u, signatureFileId: id } : u));
                }}
              />

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">คำนำหน้า / ชื่อ-นามสกุล</label>
                  <div className="flex gap-2">
                    <select
                      className="w-32 border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      value={editForm.prefix}
                      onChange={(e) => setEditForm({ ...editForm, prefix: e.target.value })}
                    >
                      <option value="">ไม่ระบุ</option>
                      {prefixOptions.map((group) => (
                        <optgroup key={group.group} label={group.group}>
                          {group.items.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="flex-1 border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="ชื่อ-นามสกุล"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">อีเมล</label>
                  <input
                    type="email"
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">บทบาท</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="HR">HR</option>
                    <option value="MANAGER">Manager</option>
                    <option value="DIRECTOR">Director</option>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">สถานะ</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                    value={editForm.isActive ? 'true' : 'false'}
                    onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'true' })}
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">แผนก</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                    value={editForm.department}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  >
                    <option value="">ไม่ระบุ</option>
                    {departments.filter(d => d.isActive).map((dept) => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">แผนกย่อย (ส่วนงาน — ใช้เติมในใบขอรถยนต์)</label>
                  <input
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                    value={editForm.section}
                    maxLength={100}
                    placeholder="เช่น ตรวจสอบปฏิบัติการ"
                    onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">หัวหน้างาน (ผู้บังคับบัญชา)</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                    value={editForm.supervisorId}
                    onChange={(e) => setEditForm({ ...editForm, supervisorId: e.target.value })}
                  >
                    <option value="">ไม่ระบุ</option>
                    {users.filter(u => u.id !== editingUser?.id).map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <UnitField
                  label="กอง"
                  value={editForm.department}
                  orgValue={org.departmentName}
                  placeholder="ชื่อกองที่มาช่วยราชการ"
                  onChange={(v) => setEditForm({ ...editForm, department: v })}
                />
                <UnitField
                  label="สังกัด"
                  value={editForm.division}
                  orgValue={org.divisionName}
                  placeholder="ชื่อสังกัดที่มาช่วยราชการ"
                  onChange={(v) => setEditForm({ ...editForm, division: v })}
                />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ตำแหน่งหลัก</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                    value={editForm.position}
                    onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                  >
                    <option value="">ไม่ระบุ</option>
                    {positions.filter(p => p.isActive).map((pos) => (
                      <option key={pos.id} value={pos.name}>{pos.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ตำแหน่งรอง</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                    value={editForm.positionSecond}
                    onChange={(e) => {
                      const selected = positionSeconds.find(p => p.name === e.target.value);
                      setEditForm({
                        ...editForm,
                        positionSecond: e.target.value,
                        positionLevel: selected?.hasLevel ? editForm.positionLevel : '',
                      });
                    }}
                  >
                    <option value="">ไม่ระบุ</option>
                    {positionSeconds.filter(p => p.isActive).map((pos) => (
                      <option key={pos.id} value={pos.name}>{pos.name}</option>
                    ))}
                  </select>
                </div>
                {/* Show level selector if positionSecond has levels */}
                {editForm.positionSecond && positionSeconds.find(p => p.name === editForm.positionSecond)?.hasLevel && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">ระดับ</label>
                    <select
                      className="w-full border border-slate-300 rounded-lg p-2.5 outline-none"
                      value={editForm.positionLevel}
                      onChange={(e) => setEditForm({ ...editForm, positionLevel: e.target.value })}
                    >
                      <option value="">ไม่ระบุ</option>
                      {Array.from({ length: positionSeconds.find(p => p.name === editForm.positionSecond)?.maxLevel || 11 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>ระดับ {i + 1}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* เบอร์โทรศัพท์ */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  placeholder="เช่น 081-234-5678"
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>

              {/* วันเกิด */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">วันเกิด</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={editForm.birthday}
                  onChange={(e) => setEditForm({ ...editForm, birthday: e.target.value })}
                />
              </div>

              {/* ที่อยู่ */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ที่อยู่</label>
                <textarea
                  rows={2}
                  placeholder="ที่อยู่สำหรับติดต่อ"
                  className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
            </div>

            {/* Error ในการบันทึก */}
            {editError && (
              <div className="mx-6 mb-2 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <p className="text-sm text-rose-600">{editError}</p>
              </div>
            )}

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors"
              >
                <Save size={16} /> บันทึก
              </button>
              <button
                onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 font-medium transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
