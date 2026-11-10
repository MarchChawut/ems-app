/**
 * ==================================================
 * Settings Page - หน้าตั้งค่า
 * ==================================================
 * จัดการ passkey (กุญแจผ่าน) สำหรับเข้าสู่ระบบแบบไม่ใช้รหัสผ่าน
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser';
import { Fingerprint, Plus, Trash2, Loader2, ShieldCheck, KeyRound, Copy, Check, Lock, Users, Calculator, FileSignature, ChevronRight, Search, X, FolderOpen, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';
import { useCurrentUser } from '@/contexts/UserContext';
import { roleConfig } from '@/lib/role-badge';
import { PERMISSIONS, hasPermission } from '@/lib/permissions';
import OrgSettingsCard from './OrgSettingsCard';
import { canManageFeatures } from '@/lib/features';
import { useFeatures } from '@/contexts/FeaturesContext';

/** ข้อมูล passkey ที่แสดงในรายการ */
interface Passkey {
  id: number;
  name: string | null;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** ข้อมูลพนักงานแบบย่อสำหรับส่วนจัดการบัญชี (super admin) */
interface EmployeeAccount {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  avatar: string | null;
  /** ยังตั้งค่าความปลอดภัยครั้งแรกไม่เสร็จ (ต้องเปลี่ยนรหัสผ่าน/ลงทะเบียน passkey) — แอดมินเห็นเพื่อติดตาม */
  mustChangePassword?: boolean;
}

/** กฎการคำนวณวันลา (ผูกกับปีงบประมาณได้) */
interface LeaveRule {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  fullDayHours: number;
  halfDayHours: number;
  maxConsecutiveDays: number;
  hourThreshold: number;
  halfDayFraction: number;
  fiscalYear: number | null;
  isActive: boolean;
}

export default function SettingsPageClient() {
  // ผู้ใช้ปัจจุบัน (ใช้กำหนดว่าจะแสดงส่วนเฉพาะ super admin หรือไม่)
  const currentUser = useCurrentUser();
  const { isEnabled: isFeatureEnabled } = useFeatures();
  const { id: currentUserId, role: currentUserRole } = currentUser;

  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // สถานะ 2FA
  const [twoFA, setTwoFA] = useState<{ enabled: boolean; backupCodesRemaining: number } | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // เปลี่ยนรหัสผ่านด้วยตนเอง
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // จัดการบัญชีผู้ใช้ (super admin เท่านั้น) - ระงับ/เปิดใช้งานการเข้าสู่ระบบของพนักงาน
  const [employees, setEmployees] = useState<EmployeeAccount[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);
  const [accountsMessage, setAccountsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');

  // รีเซ็ตรหัสผ่านให้พนักงาน (super admin เท่านั้น)
  const [resetPasswordTarget, setResetPasswordTarget] = useState<EmployeeAccount | null>(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

  // สิทธิ์สร้างแฟ้มงานเก็บถาวร (super admin เท่านั้น) - ให้/ตัดสิทธิ์เฉพาะราย ผ่าน UserPermission override
  const [folderPermTarget, setFolderPermTarget] = useState<EmployeeAccount | null>(null);
  const [folderPermChoice, setFolderPermChoice] = useState<'GRANT' | 'REVOKE'>('REVOKE');
  const [loadingFolderPerm, setLoadingFolderPerm] = useState(false);
  const [savingFolderPerm, setSavingFolderPerm] = useState(false);
  const [folderPermError, setFolderPermError] = useState<string | null>(null);

  // สูตรคำนวณวันลา (Manager ขึ้นไป) - กฎแยกตามปีงบประมาณ
  const [leaveRules, setLeaveRules] = useState<LeaveRule[]>([]);
  const [loadingLeaveRules, setLoadingLeaveRules] = useState(false);
  const [savingRuleId, setSavingRuleId] = useState<number | null>(null);
  const [creatingRule, setCreatingRule] = useState(false);
  const [leaveRuleMessage, setLeaveRuleMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newRuleFiscalYear, setNewRuleFiscalYear] = useState('');

  /** โหลดรายการ passkey */
  const loadPasskeys = async () => {
    try {
      const res = await fetch('/api/auth/passkey');
      const data = await res.json();
      if (res.ok && data.success) {
        setPasskeys(data.data);
      }
    } catch {
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดรายการ passkey ได้' });
    } finally {
      setIsLoading(false);
    }
  };

  /** โหลดสถานะ 2FA */
  const load2FA = async () => {
    try {
      const res = await fetch('/api/auth/2fa');
      const data = await res.json();
      if (res.ok && data.success) setTwoFA(data.data);
    } catch {
      /* เงียบไว้ ไม่บล็อกหน้า */
    }
  };

  /** โหลดรายชื่อพนักงานทั้งหมด (เฉพาะ super admin) */
  const loadEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok && data.success) setEmployees(data.data);
    } catch {
      setAccountsMessage({ type: 'error', text: 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้' });
    } finally {
      setLoadingEmployees(false);
    }
  };

  useEffect(() => {
    loadPasskeys();
    load2FA();
  }, []);

  useEffect(() => {
    // ทั้ง ADMIN และ SUPER_ADMIN จัดการบัญชี/รีเซ็ตรหัสผ่านได้ (ADMIN เฉพาะบัญชีที่ไม่ใช่ผู้ดูแลระบบ — API บังคับอีกชั้น)
    if (currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'ADMIN') {
      loadEmployees();
    }
  }, [currentUserRole]);

  // ตัวแก้กฎการลาแสดงเฉพาะเมื่อฟีเจอร์ "การลา" เปิดอยู่
  const canManageLeaveRules = ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(currentUserRole) && isFeatureEnabled('leaves');

  /** โหลดกฎการคำนวณวันลาทั้งหมด (Manager ขึ้นไป) */
  const loadLeaveRules = async () => {
    setLoadingLeaveRules(true);
    try {
      const res = await fetch('/api/leave-rules');
      const data = await res.json();
      if (res.ok && data.success) setLeaveRules(data.data);
    } catch {
      setLeaveRuleMessage({ type: 'error', text: 'ไม่สามารถโหลดกฎการคำนวณวันลาได้' });
    } finally {
      setLoadingLeaveRules(false);
    }
  };

  useEffect(() => {
    if (canManageLeaveRules) {
      loadLeaveRules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserRole]);

  /** แก้ไขค่าฟิลด์หนึ่งของกฎในหน่วยความจำ (ยังไม่บันทึก) */
  const updateRuleField = (id: number, field: keyof LeaveRule, value: number | boolean) => {
    setLeaveRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  /** บันทึกการแก้ไขกฎการลา */
  const handleSaveRule = async (rule: LeaveRule) => {
    setLeaveRuleMessage(null);
    setSavingRuleId(rule.id);
    try {
      const res = await fetch('/api/leave-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          fullDayHours: rule.fullDayHours,
          halfDayHours: rule.halfDayHours,
          maxConsecutiveDays: rule.maxConsecutiveDays,
          hourThreshold: rule.hourThreshold,
          halfDayFraction: rule.halfDayFraction,
          isActive: rule.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถบันทึกกฎการลาได้');
      }
      setLeaveRuleMessage({ type: 'success', text: 'บันทึกกฎการลาสำเร็จ' });
    } catch (err) {
      setLeaveRuleMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setSavingRuleId(null);
    }
  };

  /** เพิ่มกฎการลาสำหรับปีงบประมาณใหม่ (คัดลอกค่าเริ่มต้นจากกฎล่าสุด) */
  const handleCreateRule = async () => {
    setLeaveRuleMessage(null);
    const fiscalYear = parseInt(newRuleFiscalYear);
    if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) {
      setLeaveRuleMessage({ type: 'error', text: 'กรุณาระบุปีงบประมาณ (ค.ศ. เช่น 2026) ให้ถูกต้อง' });
      return;
    }
    setCreatingRule(true);
    try {
      const template = leaveRules[0];
      const res = await fetch('/api/leave-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `กฎการลาปีงบประมาณ ${fiscalYear}`,
          fiscalYear,
          fullDayHours: template?.fullDayHours ?? 8,
          halfDayHours: template?.halfDayHours ?? 4,
          maxConsecutiveDays: template?.maxConsecutiveDays ?? 30,
          hourThreshold: template?.hourThreshold ?? 3,
          halfDayFraction: template?.halfDayFraction ?? 0.5,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถสร้างกฎการลาได้');
      }
      setLeaveRuleMessage({ type: 'success', text: 'สร้างกฎการลาสำหรับปีงบประมาณใหม่สำเร็จ' });
      setNewRuleFiscalYear('');
      await loadLeaveRules();
    } catch (err) {
      setLeaveRuleMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setCreatingRule(false);
    }
  };

  /** ระงับ/เปิดใช้งานบัญชีของพนักงาน */
  const handleToggleActive = async (userId: number, nextActive: boolean) => {
    setAccountsMessage(null);
    setTogglingUserId(userId);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถเปลี่ยนสถานะบัญชีได้');
      }
      setEmployees((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isActive: nextActive } : u))
      );
      setAccountsMessage({
        type: 'success',
        text: nextActive ? 'เปิดใช้งานบัญชีสำเร็จ' : 'ระงับการใช้งานบัญชีสำเร็จ',
      });
    } catch (err) {
      setAccountsMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setTogglingUserId(null);
    }
  };

  /** รายชื่อพนักงานหลังกรองด้วยคำค้นหา/บทบาท/สถานะ */
  const filteredEmployees = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    return employees.filter((emp) => {
      const matchesSearch =
        !q ||
        emp.name.toLowerCase().includes(q) ||
        emp.username.toLowerCase().includes(q) ||
        roleConfig[emp.role].label.toLowerCase().includes(q);
      const matchesRole = accountRoleFilter === 'ALL' || emp.role === accountRoleFilter;
      const matchesStatus =
        accountStatusFilter === 'ALL' ||
        (accountStatusFilter === 'ACTIVE' ? emp.isActive : !emp.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [employees, accountSearch, accountRoleFilter, accountStatusFilter]);

  /** เปิดหน้าต่างรีเซ็ตรหัสผ่านให้พนักงานคนที่เลือก */
  const openResetPassword = (emp: EmployeeAccount) => {
    setAccountsMessage(null);
    setResetPasswordError(null);
    setResetPasswordForm({ password: '', confirmPassword: '' });
    setResetPasswordTarget(emp);
  };

  const closeResetPassword = () => {
    setResetPasswordTarget(null);
    setResetPasswordForm({ password: '', confirmPassword: '' });
    setResetPasswordError(null);
  };

  /** ยืนยันตั้งรหัสผ่านใหม่ให้พนักงาน (super admin เท่านั้น) */
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordTarget) return;
    setResetPasswordError(null);

    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setResetPasswordError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
      return;
    }

    setResettingPassword(true);
    try {
      const res = await fetch(`/api/users/${resetPasswordTarget.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resetPasswordForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถรีเซ็ตรหัสผ่านได้');
      }
      setAccountsMessage({
        type: 'success',
        text: `รีเซ็ตรหัสผ่านของ ${resetPasswordTarget.name} สำเร็จ — บัญชีนี้ถูกออกจากระบบในทุกอุปกรณ์แล้ว`,
      });
      closeResetPassword();
    } catch (err) {
      setResetPasswordError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setResettingPassword(false);
    }
  };

  /** เปิดหน้าต่างตั้งสิทธิ์ "สร้างแฟ้มงานเก็บถาวร" ให้พนักงานคนที่เลือก - โหลดสถานะปัจจุบันมาแสดงก่อน */
  const openFolderPermission = async (emp: EmployeeAccount) => {
    setAccountsMessage(null);
    setFolderPermError(null);
    setFolderPermChoice('REVOKE');
    setFolderPermTarget(emp);
    setLoadingFolderPerm(true);
    try {
      const res = await fetch(`/api/permissions/user/${emp.id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถโหลดข้อมูลสิทธิ์ได้');
      }
      const override = data.data.overrides.find(
        (o: { permissionKey: string; granted: boolean }) => o.permissionKey === PERMISSIONS.TASKS_MANAGE_FOLDERS
      );
      setFolderPermChoice(override?.granted ? 'GRANT' : 'REVOKE');
    } catch (err) {
      setFolderPermError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoadingFolderPerm(false);
    }
  };

  const closeFolderPermission = () => {
    setFolderPermTarget(null);
    setFolderPermChoice('REVOKE');
    setFolderPermError(null);
  };

  /** บันทึกสิทธิ์ "สร้างแฟ้มงานเก็บถาวร" ให้พนักงานคนที่เลือก (ให้สิทธิ์/ตัดสิทธิ์) */
  const handleSaveFolderPermission = async () => {
    if (!folderPermTarget) return;
    setFolderPermError(null);
    setSavingFolderPerm(true);
    try {
      const granted = folderPermChoice === 'GRANT';
      const res = await fetch(`/api/permissions/user/${folderPermTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionKey: PERMISSIONS.TASKS_MANAGE_FOLDERS, granted }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถบันทึกสิทธิ์ได้');
      }
      setAccountsMessage({
        type: 'success',
        text: `บันทึกสิทธิ์สร้างแฟ้มงานของ ${folderPermTarget.name} สำเร็จ`,
      });
      closeFolderPermission();
    } catch (err) {
      setFolderPermError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSavingFolderPerm(false);
    }
  };

  /** เปลี่ยนรหัสผ่านด้วยตนเอง (ต้องกรอกรหัสเดิมเพื่อยืนยัน) */
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน' });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้');
      }
      setPasswordMessage({ type: 'success', text: 'เปลี่ยนรหัสผ่านสำเร็จ' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  /** สร้างรหัสสำรองใหม่ (ต้องยืนยันด้วยรหัส TOTP ปัจจุบัน) */
  const handleRegenerateBackupCodes = async () => {
    const code = window.prompt('กรอกรหัส 6 หลักจากแอป authenticator เพื่อยืนยัน');
    if (!code) return;
    setMessage(null);
    setNewBackupCodes([]);
    setRegenerating(true);
    try {
      const res = await fetch('/api/auth/2fa/backup-codes/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'ไม่สำเร็จ');
      setNewBackupCodes(data.data.backupCodes || []);
      setMessage({ type: 'success', text: 'สร้างรหัสสำรองใหม่สำเร็จ (รหัสเดิมถูกยกเลิกแล้ว)' });
      await load2FA();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setRegenerating(false);
    }
  };

  const copyNewCodes = async () => {
    await navigator.clipboard.writeText(newBackupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** ลงทะเบียน passkey ใหม่ */
  const handleAddPasskey = async () => {
    setMessage(null);
    setIsRegistering(true);
    try {
      // 1) ขอ options จาก server
      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
      const optData = await optRes.json();
      if (!optRes.ok || !optData.success) {
        throw new Error(optData.message || 'ไม่สามารถเริ่มลงทะเบียนได้');
      }

      // 2) เรียก authenticator ของอุปกรณ์
      const attResp = await startRegistration({ optionsJSON: optData.data });

      // 3) ตั้งชื่อ passkey (ไม่บังคับ)
      const name = window.prompt('ตั้งชื่อ passkey นี้ (เช่น MacBook Touch ID)', '') || undefined;

      // 4) ส่งผลให้ server ตรวจสอบและบันทึก
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attResp, name }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.message || 'ไม่สามารถยืนยัน passkey ได้');
      }

      setMessage({ type: 'success', text: 'ลงทะเบียน passkey สำเร็จ' });
      await loadPasskeys();
    } catch (err) {
      // ผู้ใช้กดยกเลิกบน prompt ของอุปกรณ์
      if (err instanceof WebAuthnError && err.code === 'ERROR_CEREMONY_ABORTED') {
        setMessage({ type: 'error', text: 'การลงทะเบียนถูกยกเลิก' });
      } else {
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียน',
        });
      }
    } finally {
      setIsRegistering(false);
    }
  };

  /** ลบ passkey */
  const handleDelete = async (id: number) => {
    if (!window.confirm('ต้องการลบ passkey นี้ใช่หรือไม่?')) return;
    setMessage(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/auth/passkey/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ไม่สามารถลบ passkey ได้');
      }
      setMessage({ type: 'success', text: 'ลบ passkey สำเร็จ' });
      await loadPasskeys();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบ',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return '-';
    return new Date(value).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* เปลี่ยนรหัสผ่าน */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-start gap-4">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 shrink-0">
            <Lock size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-800">เปลี่ยนรหัสผ่าน</h2>
            <p className="text-sm text-slate-500 mt-1">
              เปลี่ยนรหัสผ่านของบัญชีตนเอง กรุณากรอกรหัสผ่านเดิมเพื่อยืนยันตัวตน
            </p>
          </div>
        </div>

        {passwordMessage && (
          <div
            className={cn(
              'mx-6 mt-4 p-3 rounded-lg text-sm',
              passwordMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border border-rose-200 text-rose-600'
            )}
          >
            {passwordMessage.text}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่านเดิม</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่านใหม่</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-400 mt-1">อย่างน้อย 8 ตัวอักษร มีตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ และตัวเลข</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={changingPassword}
            className={cn(
              'flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg',
              'hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200',
              'disabled:bg-indigo-400 disabled:cursor-not-allowed'
            )}
          >
            {changingPassword && <Loader2 size={18} className="animate-spin" />}
            <span>เปลี่ยนรหัสผ่าน</span>
          </button>
        </form>
      </div>

      {/* ส่วน 2FA */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-800">การยืนยันตัวตนสองชั้น (2FA)</h2>
            <p className="text-sm text-slate-500 mt-1">
              ระบบบังคับใช้ 2FA กับการเข้าสู่ระบบด้วยรหัสผ่านทุกบัญชี
              {twoFA && (
                <>
                  {' '}สถานะ:{' '}
                  <span className={twoFA.enabled ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                    {twoFA.enabled ? 'เปิดใช้งานแล้ว' : 'ยังไม่ได้ตั้งค่า'}
                  </span>
                  {twoFA.enabled && ` · รหัสสำรองเหลือ ${twoFA.backupCodesRemaining} ชุด`}
                </>
              )}
            </p>
          </div>
          {twoFA?.enabled && (
            <button
              onClick={handleRegenerateBackupCodes}
              disabled={regenerating}
              className={cn(
                'flex items-center gap-2 bg-white text-emerald-700 text-sm font-medium px-4 py-2.5 rounded-lg border border-emerald-200 shrink-0',
                'hover:bg-emerald-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {regenerating ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
              <span>สร้างรหัสสำรองใหม่</span>
            </button>
          )}
        </div>

        {newBackupCodes.length > 0 && (
          <div className="p-6 border-b border-slate-100">
            <p className="text-sm text-slate-500 mb-3">
              รหัสสำรองชุดใหม่ (แสดงครั้งเดียว เก็บไว้ในที่ปลอดภัย):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-sm text-slate-700">
              {newBackupCodes.map((c) => (
                <span key={c} className="text-center">{c}</span>
              ))}
            </div>
            <button
              onClick={copyNewCodes}
              className="mt-3 flex items-center justify-center gap-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg py-2 px-4 hover:bg-indigo-50 transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัสทั้งหมด'}</span>
            </button>
          </div>
        )}
      </div>

      {/* หัวข้อส่วน passkey */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-start gap-4">
          <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
            <Fingerprint size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-800">Passkey (กุญแจผ่าน)</h2>
            <p className="text-sm text-slate-500 mt-1">
              เข้าสู่ระบบด้วยลายนิ้วมือ ใบหน้า หรือ PIN ของอุปกรณ์ โดยไม่ต้องกรอกรหัสผ่าน
              คุณยังคงเข้าสู่ระบบด้วยรหัสผ่านได้ตามปกติ
            </p>
          </div>
          <button
            onClick={handleAddPasskey}
            disabled={isRegistering}
            className={cn(
              'flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg shrink-0',
              'hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200',
              'disabled:bg-indigo-400 disabled:cursor-not-allowed'
            )}
          >
            {isRegistering ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Plus size={18} />
            )}
            <span>เพิ่ม passkey</span>
          </button>
        </div>

        {/* ข้อความแจ้งผล */}
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

        {/* รายการ passkey */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : passkeys.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <ShieldCheck size={40} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">ยังไม่มี passkey กดปุ่ม &quot;เพิ่ม passkey&quot; เพื่อเริ่มต้น</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 shrink-0">
                    <Fingerprint size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {pk.name || 'Passkey'}
                    </p>
                    <p className="text-xs text-slate-400">
                      เพิ่มเมื่อ {formatDate(pk.createdAt)}
                      {pk.lastUsedAt && ` · ใช้ล่าสุด ${formatDate(pk.lastUsedAt)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(pk.id)}
                    disabled={deletingId === pk.id}
                    className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-50"
                    title="ลบ passkey"
                  >
                    {deletingId === pk.id ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* สูตรคำนวณวันลา (Manager ขึ้นไป) */}
      {canManageLeaveRules && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
              <Calculator size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-800">สูตรคำนวณวันลา</h2>
              <p className="text-sm text-slate-500 mt-1">
                กำหนดเกณฑ์การแปลงชั่วโมงลาเป็นวัน และจำนวนวันลาติดต่อกันสูงสุด แยกตามปีงบประมาณ
                เนื่องจากเกณฑ์อาจเปลี่ยนแปลงในแต่ละปี
              </p>
            </div>
          </div>

          {leaveRuleMessage && (
            <div
              className={cn(
                'mx-6 mt-4 p-3 rounded-lg text-sm',
                leaveRuleMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border border-rose-200 text-rose-600'
              )}
            >
              {leaveRuleMessage.text}
            </div>
          )}

          <div className="p-6 space-y-4">
            {loadingLeaveRules ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              <>
                {leaveRules.map((rule) => (
                  <div key={rule.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-800">
                        {rule.fiscalYear
                          ? `ปีงบประมาณ ${rule.fiscalYear} (พ.ศ. ${rule.fiscalYear + 1 + 543})`
                          : 'ค่าเริ่มต้น (ทุกปีที่ไม่มีกฎเฉพาะ)'}
                      </p>
                      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.isActive}
                          onChange={(e) => updateRuleField(rule.id, 'isActive', e.target.checked)}
                          className="rounded"
                        />
                        ใช้งานอยู่
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          ลาชั่วโมงไม่เกิน (ชม.) = ครึ่งวัน
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={rule.hourThreshold}
                          onChange={(e) => updateRuleField(rule.id, 'hourThreshold', parseFloat(e.target.value) || 0)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">สัดส่วน &quot;ครึ่งวัน&quot;</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={rule.halfDayFraction}
                          onChange={(e) => updateRuleField(rule.id, 'halfDayFraction', parseFloat(e.target.value) || 0)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">ชม. ทำงาน = 1 วัน</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={rule.fullDayHours}
                          onChange={(e) => updateRuleField(rule.id, 'fullDayHours', parseFloat(e.target.value) || 0)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">ลาติดต่อกันสูงสุด (วัน)</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={rule.maxConsecutiveDays}
                          onChange={(e) => updateRuleField(rule.id, 'maxConsecutiveDays', parseInt(e.target.value) || 0)}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleSaveRule(rule)}
                      disabled={savingRuleId === rule.id}
                      className={cn(
                        'flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg',
                        'hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed'
                      )}
                    >
                      {savingRuleId === rule.id && <Loader2 size={16} className="animate-spin" />}
                      <span>บันทึก</span>
                    </button>
                  </div>
                ))}

                {/* เพิ่มกฎสำหรับปีงบประมาณใหม่ */}
                <div className="border border-dashed border-slate-300 rounded-xl p-4 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-500 mb-1">
                      เพิ่มกฎสำหรับปีงบประมาณใหม่ (ปี ค.ศ. ที่เริ่ม 1 ต.ค. เช่น 2026)
                    </label>
                    <input
                      type="number"
                      value={newRuleFiscalYear}
                      onChange={(e) => setNewRuleFiscalYear(e.target.value)}
                      placeholder="2026"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm"
                    />
                    {newRuleFiscalYear && !isNaN(parseInt(newRuleFiscalYear)) && (
                      <p className="text-xs text-slate-400 mt-1">
                        = พ.ศ. {parseInt(newRuleFiscalYear) + 1 + 543}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleCreateRule}
                    disabled={creatingRule}
                    className={cn(
                      'flex items-center gap-2 bg-white text-amber-700 text-sm font-medium px-4 py-2 rounded-lg border border-amber-200 shrink-0',
                      'hover:bg-amber-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
                    )}
                  >
                    {creatingRule ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    <span>เพิ่ม</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* จัดการบัญชีผู้ใช้ (เฉพาะ admin / super admin) */}
      {(currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'ADMIN') && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-start gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 shrink-0">
              <Users size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-800">จัดการบัญชีผู้ใช้</h2>
              <p className="text-sm text-slate-500 mt-1">
                ระงับ/เปิดใช้งาน หรือรีเซ็ตรหัสผ่านให้พนักงาน (เฉพาะ Admin / Super Admin; Admin จัดการบัญชีผู้ดูแลระบบไม่ได้) — บัญชีที่ถูกระงับจะเข้าสู่ระบบไม่ได้ทุกวิธี
              </p>
            </div>
          </div>

          {accountsMessage && (
            <div
              className={cn(
                'mx-6 mt-4 p-3 rounded-lg text-sm',
                accountsMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border border-rose-200 text-rose-600'
              )}
            >
              {accountsMessage.text}
            </div>
          )}

          {!loadingEmployees && employees.length > 0 && (
            <div className="px-6 pt-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, username หรือบทบาท..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <select
                value={accountRoleFilter}
                onChange={(e) => setAccountRoleFilter(e.target.value as UserRole | 'ALL')}
                className="text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">ทุกบทบาท</option>
                {(Object.keys(roleConfig) as UserRole[]).map((r) => (
                  <option key={r} value={r}>{roleConfig[r].label}</option>
                ))}
              </select>
              <select
                value={accountStatusFilter}
                onChange={(e) => setAccountStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'SUSPENDED')}
                className="text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">ทุกสถานะ</option>
                <option value="ACTIVE">ใช้งานได้</option>
                <option value="SUSPENDED">ถูกระงับ</option>
              </select>
            </div>
          )}

          <div className="p-6">
            {loadingEmployees ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : filteredEmployees.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                {employees.length === 0 ? 'ไม่มีรายชื่อพนักงาน' : 'ไม่พบพนักงานที่ตรงกับเงื่อนไขค้นหา'}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredEmployees.map((emp) => {
                  const isSelf = emp.id === currentUserId;
                  const badge = roleConfig[emp.role];
                  // ADMIN จัดการ/รีเซ็ตรหัสผ่านบัญชีระดับ ADMIN/SUPER_ADMIN ไม่ได้ (เฉพาะ SUPER_ADMIN) — ตรงกับกฎที่ API บังคับ
                  const isAdminTarget = emp.role === 'ADMIN' || emp.role === 'SUPER_ADMIN';
                  const canManageThis = currentUserRole === 'SUPER_ADMIN' || !isAdminTarget;
                  return (
                    <li
                      key={emp.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
                    >
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0',
                          badge.bg,
                          badge.text
                        )}
                      >
                        {emp.avatar || emp.name.charAt(0)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800 truncate">{emp.name}</p>
                          <span className={cn('px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0', badge.bg, badge.text)}>
                            {badge.label}
                          </span>
                          {emp.mustChangePassword && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 bg-amber-100 text-amber-700"
                              title="ยังไม่ได้เปลี่ยนรหัสผ่านและตั้งค่าความปลอดภัยครั้งแรก"
                            >
                              รอตั้งค่าครั้งแรก
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">@{emp.username}</p>
                      </div>

                      {(() => {
                        const isAdminRole = emp.role === 'ADMIN' || emp.role === 'SUPER_ADMIN';
                        return (
                          <button
                            type="button"
                            onClick={() => openFolderPermission(emp)}
                            disabled={isAdminRole}
                            title={isAdminRole ? 'มีสิทธิ์นี้อยู่แล้วตามบทบาท' : 'ตั้งสิทธิ์สร้างแฟ้มงานเก็บถาวร'}
                            className={cn(
                              'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border shrink-0 transition-colors',
                              isAdminRole
                                ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                                : 'text-purple-600 border-purple-200 hover:bg-purple-50'
                            )}
                          >
                            <FolderOpen size={14} />
                            <span className="hidden sm:inline">สิทธิ์สร้างแฟ้มงาน</span>
                          </button>
                        );
                      })()}

                      <button
                        type="button"
                        onClick={() => openResetPassword(emp)}
                        disabled={isSelf || !canManageThis}
                        title={
                          isSelf
                            ? 'ไม่สามารถรีเซ็ตรหัสผ่านตัวเองได้ที่นี่'
                            : !canManageThis
                              ? 'เฉพาะ Super Admin เท่านั้นที่รีเซ็ตรหัสผ่านบัญชีผู้ดูแลระบบได้'
                              : 'รีเซ็ตรหัสผ่าน'
                        }
                        className={cn(
                          'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border shrink-0 transition-colors',
                          isSelf || !canManageThis
                            ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                            : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'
                        )}
                      >
                        <KeyRound size={14} />
                        <span className="hidden sm:inline">รีเซ็ตรหัสผ่าน</span>
                      </button>

                      {togglingUserId === emp.id ? (
                        <div className="w-24 flex justify-center shrink-0">
                          <Loader2 size={16} className="animate-spin text-slate-400" />
                        </div>
                      ) : (
                        <label
                          className={cn('flex items-center gap-2 shrink-0', isSelf ? 'cursor-not-allowed' : 'cursor-pointer')}
                          title={isSelf ? 'ไม่สามารถระงับบัญชีตัวเองได้' : undefined}
                        >
                          <span className={cn('text-xs font-medium w-16 text-right', emp.isActive ? 'text-emerald-600' : 'text-rose-500')}>
                            {emp.isActive ? 'ใช้งานได้' : 'ถูกระงับ'}
                          </span>
                          <span className="relative inline-flex items-center">
                            <input
                              type="checkbox"
                              checked={emp.isActive}
                              disabled={isSelf || !canManageThis}
                              onChange={(e) => handleToggleActive(emp.id, e.target.checked)}
                              className="peer sr-only"
                            />
                            <span className="w-9 h-5 bg-slate-200 rounded-full peer-checked:bg-emerald-500 peer-disabled:opacity-50 transition-colors" />
                            <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                          </span>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* หน้าต่างรีเซ็ตรหัสผ่านให้พนักงาน (super admin เท่านั้น) */}
      {resetPasswordTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800">รีเซ็ตรหัสผ่าน</h3>
                <p className="text-xs text-slate-500 mt-0.5">{resetPasswordTarget.name} · @{resetPasswordTarget.username}</p>
              </div>
              <button
                type="button"
                onClick={closeResetPassword}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                หลังรีเซ็ต รหัสผ่านเดิมจะใช้ไม่ได้ทันที และบัญชีนี้จะถูกออกจากระบบในทุกอุปกรณ์ — ผู้ใช้ต้องเปลี่ยนรหัสผ่านเอง
                (และลงทะเบียน passkey ถ้ายังไม่มี) ตอนเข้าสู่ระบบครั้งถัดไป ภายใน 7 วัน ไม่เช่นนั้นต้องรีเซ็ตใหม่
              </p>

              {resetPasswordError && (
                <div className="p-3 rounded-lg text-sm bg-rose-50 border border-rose-200 text-rose-600">
                  {resetPasswordError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">รหัสผ่านใหม่</label>
                <input
                  type="password"
                  value={resetPasswordForm.password}
                  onChange={(e) => setResetPasswordForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-400 mt-1">อย่างน้อย 8 ตัวอักษร มีตัวพิมพ์เล็ก ตัวพิมพ์ใหญ่ และตัวเลข</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">ยืนยันรหัสผ่านใหม่</label>
                <input
                  type="password"
                  value={resetPasswordForm.confirmPassword}
                  onChange={(e) => setResetPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeResetPassword}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className={cn(
                    'flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg',
                    'hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200',
                    'disabled:bg-indigo-400 disabled:cursor-not-allowed'
                  )}
                >
                  {resettingPassword && <Loader2 size={18} className="animate-spin" />}
                  <span>ยืนยันรีเซ็ตรหัสผ่าน</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* หน้าต่างตั้งสิทธิ์ "สร้างแฟ้มงานเก็บถาวร" ให้พนักงาน (super admin เท่านั้น) */}
      {folderPermTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-800">สิทธิ์สร้างแฟ้มงานเก็บถาวร</h3>
                <p className="text-xs text-slate-500 mt-0.5">{folderPermTarget.name} · @{folderPermTarget.username}</p>
              </div>
              <button
                type="button"
                onClick={closeFolderPermission}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                ควบคุมว่าพนักงานคนนี้สร้าง/แก้ไข/ลบแฟ้มเก็บถาวรงานในหน้า "ติดตามงาน" ได้หรือไม่
              </p>

              {folderPermError && (
                <div className="p-3 rounded-lg text-sm bg-rose-50 border border-rose-200 text-rose-600">
                  {folderPermError}
                </div>
              )}

              {loadingFolderPerm ? (
                <div className="flex justify-center py-4">
                  <Loader2 size={20} className="animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  {([
                    { value: 'GRANT', label: 'ให้สิทธิ์ (สร้างแฟ้มได้)' },
                    { value: 'REVOKE', label: 'ตัดสิทธิ์ (สร้างแฟ้มไม่ได้)' },
                  ] as const).map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50"
                    >
                      <input
                        type="radio"
                        name="folderPermChoice"
                        checked={folderPermChoice === opt.value}
                        onChange={() => setFolderPermChoice(opt.value)}
                        className="text-indigo-600"
                      />
                      <span className="text-sm text-slate-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeFolderPermission}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSaveFolderPermission}
                  disabled={savingFolderPerm || loadingFolderPerm}
                  className={cn(
                    'flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg',
                    'hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200',
                    'disabled:bg-indigo-400 disabled:cursor-not-allowed'
                  )}
                >
                  {savingFolderPerm && <Loader2 size={18} className="animate-spin" />}
                  <span>บันทึก</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ข้อมูลหน่วยงาน (ชื่อสังกัด/ชื่อกอง) — เฉพาะผู้มีสิทธิ์ org.manage (แอดมินผ่านเสมอ) */}
      {hasPermission(currentUser, PERMISSIONS.ORG_MANAGE) && <OrgSettingsCard />}

      {/* ทางลัดไปหน้าฟีเจอร์ของระบบ (เปิด/ปิดฟีเจอร์ + ค่าเริ่มต้น) — เฉพาะ Super Admin */}
      {canManageFeatures(currentUserRole) && (
        <Link
          href="/dashboard/settings/features"
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-md transition-all"
        >
          <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600 shrink-0">
            <LayoutGrid size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-800">ฟีเจอร์ของระบบ</h2>
            <p className="text-sm text-slate-500 mt-0.5">เปิด/ปิดการใช้งานแต่ละฟีเจอร์ และตั้งค่าเริ่มต้นแยกตามหมวด (เฉพาะ Super Admin)</p>
          </div>
          <ChevronRight size={18} className="text-slate-300 shrink-0" />
        </Link>
      )}

      {/* ทางลัดไปหน้าจัดการสิทธิ์ / สร้างแบบฟอร์ม (เฉพาะ admin ขึ้นไป) */}
      {['ADMIN', 'SUPER_ADMIN'].includes(currentUserRole) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/dashboard/settings/permissions"
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-800">จัดการสิทธิ์การใช้งาน</h2>
              <p className="text-sm text-slate-500 mt-0.5">กำหนดสิทธิ์เพิ่มเติมให้พนักงานเป็นรายบุคคล</p>
            </div>
            <ChevronRight size={18} className="text-slate-300 shrink-0" />
          </Link>

          {isFeatureEnabled('forms') && (
          <Link
            href="/dashboard/settings/form-builder"
            className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 hover:border-indigo-300 hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
              <FileSignature size={24} />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-800">สร้าง/แก้ไขแบบฟอร์ม</h2>
              <p className="text-sm text-slate-500 mt-0.5">จัดการแบบฟอร์มที่พนักงานเลือกกรอกได้</p>
            </div>
            <ChevronRight size={18} className="text-slate-300 shrink-0" />
          </Link>
          )}
        </div>
      )}
    </div>
  );
}
