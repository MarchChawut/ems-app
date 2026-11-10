/**
 * ==================================================
 * Signature - ลายเซ็นผู้ลา/ผู้ขอบนแบบฟอร์ม (วาง/ลาก/ย่อขยายเอง)
 * ==================================================
 * - useSignatureControl: state + บันทึกตำแหน่ง (PATCH /api/leaves/[id]/signature)
 * - SignatureMark: รูปลายเซ็นที่วางทับเส้น "ลงชื่อ" (ลากเพื่อย้ายได้ขณะอยู่โหมดจัดวาง)
 * - SignatureToolbar: ปุ่มควบคุม วางไว้นอกพื้นที่พิมพ์ (header ของ modal)
 * - fetchSignatureImage / signaturePdfStyle: สำหรับ react-pdf
 *
 * หน่วยตำแหน่งเป็น mm เทียบกับจุดกึ่งกลางเส้นลงชื่อ (SignaturePlacement ใน src/types)
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SignaturePlacement } from "@/types";

export const DEFAULT_SIGNATURE_PLACEMENT: SignaturePlacement = { x: 0, y: -2, width: 30 };

const PX_PER_MM = 96 / 25.4;
const PT_PER_MM = 72 / 25.4;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * แปลงรูปลายเซ็น (RGBA) ให้เป็น "สีหมึกปากกา" สีเดียว: ความเข้มของพิกเซล (ยิ่งมืดยิ่งทึบ) กลายเป็น alpha
 * พื้นขาวจึงโปร่งใส เส้นลายเซ็นกลายเป็นสี ink — ใช้ได้กับทั้งรูปสแกนพื้นขาวและ PNG โปร่งใส (แก้ buffer ตรงๆ)
 */
export function tintPixelsToInk(rgba: Uint8ClampedArray, ink: readonly [number, number, number]): void {
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const luminance = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    rgba[i + 3] = Math.round((255 - luminance) * (rgba[i + 3] / 255));
    rgba[i] = ink[0];
    rgba[i + 1] = ink[1];
    rgba[i + 2] = ink[2];
  }
}

/** "#rrggbb" → [r, g, b] (ไม่ถูกต้อง = null) */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** โหลดรูปลง canvas แล้วแปลงเป็นสีหมึก คืน data URL (PNG); ล้มเหลว = null */
export async function tintSignatureImage(src: string, inkHex: string): Promise<string | null> {
  const ink = hexToRgb(inkHex);
  if (!ink || typeof document === "undefined") return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    tintPixelsToInk(data.data, ink);
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

interface UseSignatureControlOptions {
  /** ใบลาที่จะบันทึกตำแหน่งลงฐานข้อมูล (ไม่ระบุ = จัดวางชั่วคราวในหน้านี้เท่านั้น) */
  leaveId?: number;
  /** UploadedFile.id ของลายเซ็นเจ้าของใบลา */
  signatureFileId?: string | null;
  initialPlacement?: SignaturePlacement | null;
  /** วาง/ย้าย/ย่อขยายลายเซ็น — เฉพาะเจ้าของใบลา (ลายเซ็นคือการรับรองด้วยตนเอง) */
  canPlace: boolean;
  /** ซ่อนลายเซ็น — เจ้าของ หรือ MANAGER ขึ้นไป (ซ่อนได้แต่วางแทนไม่ได้) */
  canHide: boolean;
  /** แปลงลายเซ็นเป็นสีหมึกนี้ (เช่น "#1a3fa8") ทั้งตัวอย่างและ PDF — ไม่ระบุ = ใช้สีตามไฟล์ที่อัปโหลด */
  inkColor?: string;
  onSaved?: (placement: SignaturePlacement | null) => void;
}

export function useSignatureControl({
  leaveId,
  signatureFileId,
  initialPlacement,
  canPlace,
  canHide,
  inkColor,
  onSaved,
}: UseSignatureControlOptions) {
  const [placement, setPlacement] = useState<SignaturePlacement | null>(initialPlacement ?? null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const baseSrc = signatureFileId ? `/api/files/${signatureFileId}` : null;

  // แปลงสีหมึก (ถ้าระบุ inkColor): รอแปลงเสร็จก่อนแสดง ไม่ให้รูปสีเดิมวาบ; แปลงไม่ได้ → ใช้รูปต้นฉบับ
  const [tinted, setTinted] = useState<{ base: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!inkColor || !baseSrc) return;
    let cancelled = false;
    tintSignatureImage(baseSrc, inkColor).then((url) => {
      if (!cancelled) setTinted({ base: baseSrc, url });
    });
    return () => {
      cancelled = true;
    };
  }, [inkColor, baseSrc]);
  const tintReady = tinted !== null && tinted.base === baseSrc;
  const src = !inkColor ? baseSrc : tintReady ? (tinted.url ?? baseSrc) : null;

  const persist = useCallback(
    async (next: SignaturePlacement | null) => {
      if (!leaveId) {
        onSaved?.(next);
        return true;
      }
      setSaving(true);
      setError("");
      try {
        const res = await fetch(`/api/leaves/${leaveId}/signature`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placement: next }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "บันทึกไม่สำเร็จ");
        onSaved?.(next);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [leaveId, onSaved]
  );

  return {
    src,
    hasSignature: !!baseSrc,
    canPlace,
    canHide,
    /** มีปุ่มควบคุมอะไรให้ใช้บ้าง (ใช้ตัดสินใจว่าจะแสดงแถบเครื่องมือหรือไม่) */
    canControl: canPlace || canHide,
    placement,
    setPlacement,
    editing,
    setEditing,
    saving,
    error,
    /** เริ่มวางลายเซ็นด้วยตำแหน่งเริ่มต้น แล้วเข้าโหมดจัดวาง */
    place: () => {
      setPlacement((p) => p ?? DEFAULT_SIGNATURE_PLACEMENT);
      setEditing(true);
    },
    /** บันทึกตำแหน่งปัจจุบันแล้วออกจากโหมดจัดวาง */
    save: async () => {
      if (await persist(placement)) setEditing(false);
    },
    /** ซ่อนลายเซ็น (ลบตำแหน่ง) */
    hide: async () => {
      setEditing(false);
      setPlacement(null);
      await persist(null);
    },
    reset: () => setPlacement(DEFAULT_SIGNATURE_PLACEMENT),
  };
}

export type SignatureControl = ReturnType<typeof useSignatureControl>;

/**
 * รูปลายเซ็นที่วางทับเส้นลงชื่อ — ต้องอยู่ใน element ที่ position: relative
 * anchorLeft = ตำแหน่งแนวนอนของกึ่งกลางเส้นลงชื่อ (ค่าเริ่มต้น 50% เหมาะกับบล็อกที่จัดกึ่งกลาง)
 * anchorTop  = ตำแหน่งแนวตั้งของเส้นลงชื่อนับจากขอบบนคอนเทนเนอร์
 */
export function SignatureMark({
  ctl,
  anchorLeft = "50%",
  anchorTop = "4mm",
}: {
  ctl: SignatureControl;
  anchorLeft?: string;
  /** ระยะจากขอบบนของคอนเทนเนอร์ถึงเส้นลงชื่อ (ค่าเริ่มต้น ~ บรรทัดแรก) */
  anchorTop?: string;
}) {
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const { src, placement, editing } = ctl;
  if (!src || !placement) return null;

  const box: React.CSSProperties = {
    position: "absolute",
    left: `calc(${anchorLeft} + ${placement.x}mm)`,
    top: `calc(${anchorTop} + ${placement.y}mm)`,
    width: `${placement.width}mm`,
    transform: "translate(-50%, -50%)",
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="ลายเซ็น"
        draggable={false}
        style={{
          ...box,
          height: "auto",
          zIndex: 5,
          cursor: editing ? "move" : "default",
          touchAction: "none",
          userSelect: "none",
          pointerEvents: editing ? "auto" : "none",
        }}
        onPointerDown={(e) => {
          if (!editing) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { px: e.clientX, py: e.clientY, x: placement.x, y: placement.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          ctl.setPlacement({
            ...placement,
            x: clamp(d.x + (e.clientX - d.px) / PX_PER_MM, -80, 80),
            y: clamp(d.y + (e.clientY - d.py) / PX_PER_MM, -60, 60),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
      {editing && (
        <span
          data-no-print
          style={{ ...box, aspectRatio: "3 / 1", border: "1px dashed #4f46e5", pointerEvents: "none", zIndex: 6 }}
        />
      )}
    </>
  );
}

/** ปุ่มควบคุมการวางลายเซ็น (วางนอก printRef เช่นใน header ของ modal) */
export function SignatureToolbar({ ctl }: { ctl: SignatureControl }) {
  if (!ctl.canControl) return null;

  const btn = "px-3 py-1.5 rounded-lg text-sm border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50";

  // ผู้ที่ซ่อนได้อย่างเดียว (เช่น admin/ผู้จัดการ): ซ่อนลายเซ็นที่เจ้าของวางไว้ได้ แต่วาง/ย้ายแทนไม่ได้
  if (!ctl.canPlace) {
    if (!ctl.placement) return null;
    return (
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={ctl.hide} disabled={ctl.saving}>
          ซ่อนลายเซ็น
        </button>
        {ctl.error && <span className="text-xs text-rose-600">{ctl.error}</span>}
      </div>
    );
  }

  if (!ctl.hasSignature) {
    return (
      <span className="text-xs text-gray-500">
        ยังไม่มีลายเซ็น — เพิ่มได้ที่หน้าโปรไฟล์/จัดการพนักงาน
      </span>
    );
  }

  if (!ctl.placement) {
    return (
      <button type="button" className={btn} onClick={ctl.place}>
        ✍️ วางลายเซ็น
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ctl.editing ? (
        <>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            ขนาด
            <input
              type="range"
              min={10}
              max={80}
              step={1}
              value={ctl.placement.width}
              onChange={(e) => ctl.setPlacement({ ...ctl.placement!, width: Number(e.target.value) })}
            />
            <span className="w-12 tabular-nums">{ctl.placement.width} mm</span>
          </label>
          <button type="button" className={btn} onClick={ctl.reset}>
            รีเซ็ต
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={ctl.save}
            disabled={ctl.saving}
          >
            {ctl.saving ? "กำลังบันทึก..." : "บันทึกตำแหน่ง"}
          </button>
        </>
      ) : (
        <button type="button" className={btn} onClick={() => ctl.setEditing(true)}>
          ✍️ ปรับตำแหน่ง/ขนาดลายเซ็น
        </button>
      )}
      <button type="button" className={btn} onClick={ctl.hide} disabled={ctl.saving}>
        ซ่อนลายเซ็น
      </button>
      {ctl.editing && <span className="text-xs text-gray-500">ลากลายเซ็นบนแบบฟอร์มเพื่อเลื่อนให้ตรงเส้น</span>}
      {ctl.error && <span className="text-xs text-rose-600">{ctl.error}</span>}
    </div>
  );
}

/** ข้อมูลรูปลายเซ็นสำหรับ react-pdf (ต้องเป็น data URL เพราะ react-pdf ส่ง cookie ล็อกอินไม่ได้) */
export interface PdfSignatureImage {
  dataUrl: string;
  /** height / width ของรูปจริง */
  aspect: number;
}

export async function fetchSignatureImage(src: string | null): Promise<PdfSignatureImage | null> {
  if (!src) return null;
  try {
    const res = await fetch(src, { credentials: "same-origin" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const aspect = await new Promise<number>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.33);
      img.onerror = () => resolve(0.33);
      img.src = dataUrl;
    });
    return { dataUrl, aspect };
  } catch {
    return null;
  }
}

/**
 * สไตล์ตำแหน่ง absolute ของรูปลายเซ็นใน react-pdf (หน่วย pt)
 * คอนเทนเนอร์ต้อง position: relative และจัดให้ left 50% เป็นกึ่งกลางเส้นลงชื่อ
 * lineCenterTop = ระยะจากขอบบนคอนเทนเนอร์ถึงเส้นลงชื่อ (pt)
 */
export function signaturePdfStyle(
  placement: SignaturePlacement,
  aspect: number,
  lineCenterTop = 8
) {
  const width = placement.width * PT_PER_MM;
  const height = width * aspect;
  return {
    position: "absolute" as const,
    left: "50%",
    marginLeft: placement.x * PT_PER_MM - width / 2,
    top: lineCenterTop + placement.y * PT_PER_MM - height / 2,
    width,
    height,
  };
}
