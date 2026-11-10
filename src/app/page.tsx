/**
 * ==================================================
 * Login Page - หน้าเข้าสู่ระบบ
 * ==================================================
 * ขั้นตอน: กรอก username/password → ยืนยัน 2FA (TOTP) หรือ ลงทะเบียน 2FA ครั้งแรก
 * รองรับเข้าสู่ระบบด้วย passkey (ข้ามขั้น 2FA)
 */

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase, Eye, EyeOff, Loader2, Fingerprint, ShieldCheck, Copy, Check } from 'lucide-react';
import { startAuthentication, WebAuthnError } from '@simplewebauthn/browser';
import { cn } from '@/lib/utils';

type Step = 'CREDENTIALS' | 'VERIFY' | 'ENROLL' | 'BACKUP';

export default function LoginPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // สถานะของ flow 2FA
  const [step, setStep] = useState<Step>('CREDENTIALS');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [is2faLoading, setIs2faLoading] = useState(false);
  const [enroll, setEnroll] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  /** ขั้นที่ 1: ตรวจ username/password → เข้าสู่ขั้น 2FA */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) {
        switch (data.error) {
          case 'TOO_MANY_ATTEMPTS':
            throw new Error(data.message || 'คุณพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่ในอีก 30 นาที');
          case 'INVALID_CREDENTIALS':
            throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
          case 'ACCOUNT_DISABLED':
            throw new Error('บัญชีของคุณถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
          default:
            throw new Error(data.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        }
      }

      if (data.data?.requires2FA) {
        setCode('');
        if (data.data.mode === 'ENROLL') {
          await beginEnroll();
          setStep('ENROLL');
        } else {
          setStep('VERIFY');
        }
        return;
      }

      // เผื่อกรณีไม่ต้องใช้ 2FA
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setIsLoading(false);
    }
  };

  /** ขอ QR + secret สำหรับการลงทะเบียน 2FA ครั้งแรก */
  const beginEnroll = async () => {
    const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'ไม่สามารถเริ่มลงทะเบียน 2FA ได้');
    }
    setEnroll({ qrDataUrl: data.data.qrDataUrl, secret: data.data.secret });
  };

  /** ขั้น VERIFY: ยืนยันด้วย TOTP หรือ backup code */
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIs2faLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'รหัสไม่ถูกต้อง');
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setIs2faLoading(false);
    }
  };

  /** ขั้น ENROLL: ยืนยันรหัสจากแอปเพื่อเปิดใช้งาน 2FA */
  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setIs2faLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'รหัสไม่ถูกต้อง');
      }
      setBackupCodes(data.data.backupCodes || []);
      setStep('BACKUP');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปิดใช้งาน 2FA ไม่สำเร็จ');
    } finally {
      setIs2faLoading(false);
    }
  };

  const copyBackupCodes = async () => {
    await navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** เข้าสู่ระบบด้วย passkey (ข้าม 2FA) */
  const handlePasskeyLogin = async () => {
    if (!formData.username.trim()) {
      setError('กรุณากรอกชื่อผู้ใช้ก่อนเข้าสู่ระบบด้วย passkey');
      return;
    }
    setIsPasskeyLoading(true);
    setError(null);
    try {
      const optRes = await fetch('/api/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: formData.username }),
      });
      const optData = await optRes.json();
      if (!optRes.ok || !optData.success) {
        throw new Error(optData.message || 'ไม่พบ passkey สำหรับผู้ใช้นี้');
      }
      const authResp = await startAuthentication({ optionsJSON: optData.data });
      const verifyRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResp }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.message || 'ไม่สามารถยืนยัน passkey ได้');
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof WebAuthnError && err.code === 'ERROR_CEREMONY_ABORTED') {
        setError('การเข้าสู่ระบบด้วย passkey ถูกยกเลิก');
      } else {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย passkey');
      }
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  const inputCls = cn(
    'w-full px-4 py-3 rounded-lg border outline-none transition-all',
    'focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
    'disabled:bg-slate-100 disabled:cursor-not-allowed',
    error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500' : 'border-slate-300'
  );
  const primaryBtn = cn(
    'w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg',
    'hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
    'transition-all duration-200 shadow-lg shadow-indigo-200',
    'disabled:bg-indigo-400 disabled:cursor-not-allowed disabled:shadow-none',
    'flex items-center justify-center gap-2'
  );

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-indigo-600 p-8 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <Briefcase className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">EMS Admin</h1>
            <p className="text-indigo-200 text-sm mt-2">ระบบบันทึกและจัดการพนักงาน</p>
          </div>

          <div className="p-8">
            {/* ข้อผิดพลาดร่วม */}
            {error && (
              <div className="mb-6 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                <p className="text-sm text-rose-600 text-center">{error}</p>
              </div>
            )}

            {/* ===== ขั้นที่ 1: username/password ===== */}
            {step === 'CREDENTIALS' && (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                    ชื่อผู้ใช้
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={inputCls}
                    placeholder="กรอกชื่อผู้ใช้"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                    รหัสผ่าน
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      disabled={isLoading}
                      className={cn(inputCls, 'pr-12')}
                      placeholder="กรอกรหัสผ่าน"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className={primaryBtn}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>กำลังเข้าสู่ระบบ...</span>
                    </>
                  ) : (
                    <span>เข้าสู่ระบบ</span>
                  )}
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">หรือ</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={isPasskeyLoading || isLoading}
                  className={cn(
                    'w-full bg-white text-indigo-600 font-semibold py-3 rounded-lg border border-indigo-200',
                    'hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
                    'transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed',
                    'flex items-center justify-center gap-2'
                  )}
                >
                  {isPasskeyLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Fingerprint className="w-5 h-5" />
                  )}
                  <span>เข้าสู่ระบบด้วย passkey</span>
                </button>
              </form>
            )}

            {/* ===== ขั้นยืนยัน 2FA (ผู้ที่เปิดใช้งานแล้ว) ===== */}
            {step === 'VERIFY' && (
              <form onSubmit={handleVerify} className="space-y-6">
                <div className="text-center">
                  <ShieldCheck className="w-10 h-10 text-indigo-600 mx-auto mb-2" />
                  <h2 className="font-semibold text-slate-800">ยืนยันตัวตน (2FA)</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {useBackup
                      ? 'กรอกรหัสสำรอง 1 ชุด'
                      : 'กรอกรหัส 6 หลักจากแอป authenticator ของคุณ'}
                  </p>
                </div>
                <input
                  type="text"
                  inputMode={useBackup ? 'text' : 'numeric'}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={is2faLoading}
                  className={cn(inputCls, 'text-center tracking-widest text-lg')}
                  placeholder={useBackup ? 'XXXXX-XXXXX' : '••••••'}
                  autoFocus
                />
                <button type="submit" disabled={is2faLoading || !code.trim()} className={primaryBtn}>
                  {is2faLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>ยืนยัน</span>}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseBackup(!useBackup);
                    setCode('');
                    setError(null);
                  }}
                  className="w-full text-sm text-indigo-600 hover:underline"
                >
                  {useBackup ? 'ใช้รหัสจากแอป authenticator' : 'ใช้รหัสสำรองแทน'}
                </button>
              </form>
            )}

            {/* ===== ขั้นลงทะเบียน 2FA ครั้งแรก ===== */}
            {step === 'ENROLL' && (
              <form onSubmit={handleEnable} className="space-y-5">
                <div className="text-center">
                  <ShieldCheck className="w-10 h-10 text-indigo-600 mx-auto mb-2" />
                  <h2 className="font-semibold text-slate-800">ตั้งค่า 2FA (จำเป็น)</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    สแกน QR ด้วยแอป authenticator (Google/Microsoft Authenticator, Authy) แล้วกรอกรหัส 6 หลัก
                  </p>
                </div>
                {enroll ? (
                  <>
                    <div className="flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={enroll.qrDataUrl} alt="2FA QR code" className="w-44 h-44 border rounded-lg" />
                    </div>
                    <p className="text-center text-xs text-slate-400 break-all">
                      หรือกรอกรหัสนี้ด้วยตนเอง: <span className="font-mono text-slate-600">{enroll.secret}</span>
                    </p>
                  </>
                ) : (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  </div>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={is2faLoading}
                  className={cn(inputCls, 'text-center tracking-widest text-lg')}
                  placeholder="••••••"
                />
                <button type="submit" disabled={is2faLoading || !code.trim()} className={primaryBtn}>
                  {is2faLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>เปิดใช้งานและเข้าสู่ระบบ</span>}
                </button>
              </form>
            )}

            {/* ===== ขั้นแสดง backup codes (ครั้งเดียว) ===== */}
            {step === 'BACKUP' && (
              <div className="space-y-5">
                <div className="text-center">
                  <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <h2 className="font-semibold text-slate-800">บันทึกรหัสสำรอง</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    เก็บรหัสเหล่านี้ไว้ในที่ปลอดภัย ใช้เข้าสู่ระบบได้เมื่อไม่มีอุปกรณ์ — แสดงเพียงครั้งเดียว
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-4 font-mono text-sm text-slate-700">
                  {backupCodes.map((c) => (
                    <span key={c} className="text-center">{c}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={copyBackupCodes}
                  className="w-full flex items-center justify-center gap-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg py-2.5 hover:bg-indigo-50 transition-colors"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'คัดลอกแล้ว' : 'คัดลอกรหัสทั้งหมด'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    router.push('/dashboard');
                    router.refresh();
                  }}
                  className={primaryBtn}
                >
                  ฉันบันทึกแล้ว เข้าสู่ระบบ
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} EMS Admin. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
