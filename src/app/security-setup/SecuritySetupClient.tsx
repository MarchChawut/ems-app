'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Fingerprint, KeyRound, Loader2, ShieldCheck, Check } from 'lucide-react';
import { startRegistration, WebAuthnError } from '@simplewebauthn/browser';

interface SetupStatus {
  mustChangePassword: boolean;
  forcePasskeySetup: boolean;
  passkeyAvailable: boolean;
  passkeyCount: number;
  twoFactorEnabled: boolean;
}

export default function SecuritySetupClient({ name }: { name: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/auth/setup-status');
    if (res.status === 401) {
      router.replace('/');
      return;
    }
    const data = await res.json();
    if (data.success) {
      setStatus(data.data);
      if (!data.data.mustChangePassword && !data.data.forcePasskeySetup) {
        router.replace('/dashboard');
        router.refresh();
      }
    }
  }, [router]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirmPassword) {
      setError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const detail = data.details?.newPassword?.[0];
        throw new Error(detail || data.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      }
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setBusy(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setError(null);
    setBusy(true);
    try {
      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
      const optData = await optRes.json();
      if (!optRes.ok || !optData.success) throw new Error(optData.message || 'ไม่สามารถเริ่มลงทะเบียนได้');
      const attResp = await startRegistration({ optionsJSON: optData.data });
      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attResp, name: 'อุปกรณ์แรก' }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) throw new Error(verifyData.message || 'ไม่สามารถยืนยัน passkey ได้');
      await loadStatus();
    } catch (err) {
      if (err instanceof WebAuthnError && err.code === 'ERROR_CEREMONY_ABORTED') {
        setError('การลงทะเบียนถูกยกเลิก');
      } else {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียน');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  };

  const inputCls =
    'w-full px-4 py-3 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-indigo-600 p-6 text-white text-center">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Briefcase size={28} />
          </div>
          <h1 className="text-xl font-bold">ตั้งค่าความปลอดภัยของบัญชี</h1>
          <p className="text-indigo-100 text-sm mt-1">สวัสดี {name} — ทำให้ครบก่อนเริ่มใช้งานระบบ</p>
        </div>

        <div className="p-6 space-y-6">
          {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-600">{error}</div>}

          {!status ? (
            <div className="flex justify-center py-6 text-slate-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <>
              {/* ขั้นที่ 1: เปลี่ยนรหัสผ่าน */}
              <section>
                <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-2">
                  {status.mustChangePassword ? <KeyRound size={18} className="text-indigo-600" /> : <Check size={18} className="text-emerald-600" />}
                  1. เปลี่ยนรหัสผ่านของคุณเอง
                </h2>
                {status.mustChangePassword ? (
                  <form onSubmit={handleChangePassword} className="space-y-3">
                    <input
                      type="password"
                      className={inputCls}
                      placeholder="รหัสผ่านเดิม (ที่ผู้ดูแลระบบให้มา)"
                      value={form.currentPassword}
                      onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                      autoComplete="current-password"
                      required
                    />
                    <input
                      type="password"
                      className={inputCls}
                      placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว มีพิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข)"
                      value={form.newPassword}
                      onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                      autoComplete="new-password"
                      required
                    />
                    <input
                      type="password"
                      className={inputCls}
                      placeholder="ยืนยันรหัสผ่านใหม่"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {busy && <Loader2 size={16} className="animate-spin" />}
                      เปลี่ยนรหัสผ่าน
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-emerald-700">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>
                )}
              </section>

              {/* ขั้นที่ 2: passkey (2FA ยืนยันตอนล็อกอินแล้ว) */}
              <section className={status.mustChangePassword ? 'opacity-50' : ''}>
                <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-2">
                  {status.forcePasskeySetup ? <Fingerprint size={18} className="text-indigo-600" /> : <Check size={18} className="text-emerald-600" />}
                  2. ลงทะเบียน passkey
                </h2>
                {status.forcePasskeySetup ? (
                  <>
                    <p className="text-sm text-slate-500 mb-3">
                      ใช้ลายนิ้วมือ/ใบหน้า/PIN ของอุปกรณ์นี้ยืนยันตัวตนแทนรหัสผ่าน (การยืนยัน 2 ขั้นตอนด้วยแอป Authenticator ตั้งไว้แล้วตอนเข้าสู่ระบบ)
                    </p>
                    <button
                      type="button"
                      onClick={handleRegisterPasskey}
                      disabled={busy || status.mustChangePassword}
                      className="w-full py-3 border border-indigo-300 text-indigo-700 rounded-lg font-medium hover:bg-indigo-50 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                      ลงทะเบียน passkey
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-emerald-700">
                    {status.passkeyCount > 0 ? 'ลงทะเบียน passkey เรียบร้อยแล้ว' : 'ระบบนี้ยังไม่รองรับ passkey (ต้องใช้ผ่านโดเมน HTTPS) — ข้ามขั้นนี้'}
                  </p>
                )}
              </section>
            </>
          )}

          <button type="button" onClick={handleLogout} className="w-full text-sm text-slate-400 hover:text-slate-600">
            ออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
