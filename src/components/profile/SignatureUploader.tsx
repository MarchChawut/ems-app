/**
 * ==================================================
 * SignatureUploader - อัปโหลด/ลบรูปลายเซ็นของพนักงาน
 * ==================================================
 * ใช้ในหน้าโปรไฟล์ (เจ้าของบัญชี) และหน้าจัดการพนักงาน (Admin)
 * รูปลายเซ็นไปปรากฏบนแบบฟอร์มเมื่อผู้ลาเปิดแบบฟอร์มแล้วกด "วางลายเซ็น"
 * แนะนำไฟล์ PNG พื้นหลังโปร่งใส เพื่อให้ลายเซ็นทับเส้นจุดไข่ปลาได้สวย
 */

"use client";

import React, { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";

interface SignatureUploaderProps {
  userId: number;
  signatureFileId: string | null | undefined;
  /** แจ้งผู้เรียกเมื่อลายเซ็นเปลี่ยน (id ใหม่ หรือ null เมื่อลบ) */
  onChange?: (signatureFileId: string | null) => void;
}

export default function SignatureUploader({ userId, signatureFileId, onChange }: SignatureUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileId, setFileId] = useState<string | null>(signatureFileId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (next: string | null) => {
    setFileId(next);
    onChange?.(next);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    setError("");

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("รองรับเฉพาะไฟล์ PNG, JPG, WEBP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("ขนาดไฟล์ต้องไม่เกิน 2MB");
      return;
    }

    try {
      setBusy(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", String(userId));
      const res = await fetch("/api/users/upload-signature", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "อัปโหลดไม่สำเร็จ");
      update(data.data.signatureFileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setError("");
    try {
      setBusy(true);
      const res = await fetch(`/api/users/upload-signature?userId=${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "ลบไม่สำเร็จ");
      update(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="text-sm font-medium text-slate-700 mb-1">ลายเซ็น</div>
      <div className="flex items-center gap-4">
        <div className="w-40 h-20 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center overflow-hidden">
          {fileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/files/${fileId}`}
              alt="ลายเซ็น"
              width={160}
              height={80}
              loading="lazy"
              decoding="async"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span className="text-xs text-slate-400">ยังไม่มีลายเซ็น</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {fileId ? "เปลี่ยนลายเซ็น" : "อัปโหลดลายเซ็น"}
          </button>
          {fileId && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              ลบลายเซ็น
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="hidden" />
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-1">แนะนำ PNG พื้นหลังโปร่งใส ไม่เกิน 2MB</p>
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
