/**
 * หน้า "ฟีเจอร์ของระบบ" — การ์ดต่อฟีเจอร์ แบ่งตามหมวด: เปิด/ปิดการใช้งาน ตัวเลือกย่อย และค่าเริ่มต้น
 * ปิดฟีเจอร์ = ซ่อนเมนู + เข้าหน้าไม่ได้ + API ตอบ 403 (ข้อมูลเดิมไม่ถูกลบ เปิดกลับมาใช้ต่อได้)
 */

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Bell, Calendar, CalendarDays, CheckCircle, FileSignature, Inbox, Layout, Loader2, Lock, Monitor,
  Package, Settings, ShieldCheck, UserCircle, Users, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFeatures } from '@/contexts/FeaturesContext';
import { CORE_FEATURES, FEATURES, FEATURE_CATEGORIES, TIME_REGEX, type FeatureDef } from '@/lib/features';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Bell, Calendar, CalendarDays, CheckCircle, FileSignature, Inbox, Layout, Monitor, Package, Settings, ShieldCheck, UserCircle, Users,
};

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      )}
    >
      <span className={cn('inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

function FeatureCard({ def }: { def: FeatureDef }) {
  const router = useRouter();
  const { map } = useFeatures();
  const saved = map[def.id];
  const [enabled, setEnabled] = useState(saved.enabled);
  const [options, setOptions] = useState<Record<string, boolean>>(saved.options);
  const [config, setConfig] = useState<Record<string, string | number>>(saved.config);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  const Icon = ICONS[def.icon] ?? Settings;
  const hasDetails = (def.options?.length ?? 0) > 0 || (def.config?.length ?? 0) > 0;
  const dirty =
    enabled !== saved.enabled ||
    JSON.stringify(options) !== JSON.stringify(saved.options) ||
    JSON.stringify(config) !== JSON.stringify(saved.config);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/feature-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureKey: def.id, enabled, options, config }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'บันทึกไม่สำเร็จ');
      setMessage({ type: 'success', text: 'บันทึกแล้ว' });
      router.refresh(); // ให้เมนู/หน้าอื่นโหลดสถานะใหม่
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setSaving(false);
    }
  }

  const timeInvalid = (def.config ?? []).some((c) => c.type === 'time' && !TIME_REGEX.test(String(config[c.key] ?? '')));

  return (
    <div className={cn('bg-white rounded-2xl shadow-sm border overflow-hidden transition-colors', enabled ? 'border-slate-200' : 'border-slate-200 bg-slate-50')}>
      <div className="p-5 flex items-start gap-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center shrink-0', enabled ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500')}>
          <Icon size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-slate-800">{def.label}</h3>
            <span className={cn('text-xs px-2 py-0.5 rounded-full', enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600')}>
              {enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{def.description}</p>
          {!enabled && def.dependents.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mt-2">
              เมื่อปิด จะกระทบ: {def.dependents.join(' • ')}
            </p>
          )}
          {enabled && def.dependents.length > 0 && (
            <p className="text-xs text-slate-400 mt-1.5">ถ้าปิด จะกระทบ: {def.dependents.join(' • ')}</p>
          )}
        </div>
        <Toggle checked={enabled} onChange={setEnabled} disabled={saving} label={`เปิด/ปิด ${def.label}`} />
      </div>

      {hasDetails && (
        <div className="border-t border-slate-100">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            <span>ตัวเลือกและค่าเริ่มต้น</span>
            <ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} />
          </button>
          {open && (
            <div className="px-5 pb-4 space-y-4">
              {(def.options ?? []).map((o) => (
                <div key={o.key} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{o.label}</p>
                    {o.description && <p className="text-xs text-slate-400">{o.description}</p>}
                  </div>
                  <Toggle checked={!!options[o.key]} onChange={(v) => setOptions((p) => ({ ...p, [o.key]: v }))} disabled={saving || !enabled} label={o.label} />
                </div>
              ))}
              {(def.config ?? []).map((c) => (
                <div key={c.key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{c.label}</label>
                  {c.type === 'time' ? (
                    <input
                      type="time"
                      value={String(config[c.key] ?? c.default)}
                      onChange={(e) => setConfig((p) => ({ ...p, [c.key]: e.target.value }))}
                      disabled={saving}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <input
                      type="number"
                      min={c.min}
                      max={c.max}
                      value={Number(config[c.key] ?? c.default)}
                      onChange={(e) => setConfig((p) => ({ ...p, [c.key]: Number(e.target.value) }))}
                      disabled={saving}
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                  {c.description && <p className="text-xs text-slate-400 mt-1">{c.description} (ค่าเริ่มต้นของระบบ: {String(c.default)})</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty || timeInvalid}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          บันทึก
        </button>
        {def.settingsHref && (
          <Link href={def.settingsHref} className="text-sm text-indigo-600 hover:underline">
            ตั้งค่าเพิ่มเติม
          </Link>
        )}
        {message && (
          <span className={cn('text-sm', message.type === 'success' ? 'text-emerald-600' : 'text-rose-600')}>{message.text}</span>
        )}
      </div>
    </div>
  );
}

export default function FeaturesSettingsClient() {
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 mb-3">
          <ArrowLeft size={16} /> กลับไปหน้าตั้งค่า
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">ฟีเจอร์ของระบบ</h1>
        <p className="text-slate-500 mt-1">
          เฉพาะ Super Admin — เปิด/ปิดแต่ละฟีเจอร์และตั้งค่าเริ่มต้นให้เหมาะกับหน่วยงานของคุณ — ปิดแล้วเมนูจะหาย เข้าหน้านั้นไม่ได้ และระบบไม่รับคำขอของฟีเจอร์นั้น
          (ข้อมูลเดิมไม่ถูกลบ เปิดกลับมาใช้ต่อได้)
        </p>
      </div>

      {FEATURE_CATEGORIES.map((cat) => {
        const defs = FEATURES.filter((f) => f.category === cat.id);
        if (defs.length === 0) return null;
        return (
          <section key={cat.id}>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-800">{cat.label}</h2>
              <p className="text-sm text-slate-500">{cat.description}</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {defs.map((def) => (
                <FeatureCard key={def.id} def={def} />
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-800">ฟีเจอร์หลัก</h2>
          <p className="text-sm text-slate-500">เป็นแกนกลางที่ทุกฟีเจอร์ใช้ร่วมกัน จึงปิดไม่ได้</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CORE_FEATURES.map((c) => {
            const Icon = ICONS[c.icon] ?? Settings;
            return (
              <div key={c.label} className="bg-slate-50 rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center shrink-0">
                  <Icon size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-700">{c.label}</h3>
                  <p className="text-sm text-slate-500 mt-1">{c.description}</p>
                </div>
                <Lock size={16} className="text-slate-400 shrink-0 mt-1" />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
