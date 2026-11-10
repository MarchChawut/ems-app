/**
 * ==================================================
 * Form Request Print Modal - preview / พิมพ์ / ดาวน์โหลด PDF ของแบบฟอร์มขอเอกสารภายใน
 * ==================================================
 * ใช้โครง "บันทึกข้อความ" ราชการแบบเดียวสำหรับทุกแบบฟอร์ม (มาจาก formRequest.template ที่ admin สร้างเองผ่าน form builder)
 * ต่างกันแค่ชื่อเรื่องกับ field เนื้อหา
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { Printer, X, FileDown, Loader2 } from "lucide-react";
import { FormRequest } from "@/types";
import { formatSignatureName } from "@/lib/utils";
import { formatThaiDate, openPrintWindow } from "./formPrintShared";
import { getPageMargins, cssPadding } from "./pageMargins";
import { useOrg } from "@/contexts/OrgContext";
import { directorTitle } from "@/lib/org-settings";
import { INK_BLUE, INK_BLACK, getPrintableHtml, formatSignDate } from "./formPrintShared";
import SignDateCells from "./SignDateCells";
import VehicleRequestPrint from "./VehicleRequestPrint";
import { buildVehicleLayout, canPlaceSubmitterSignature, VEHICLE_REQUEST_SYSTEM_KEY } from "@/lib/vehicle-request";
import { useSignatureControl, SignatureMark, SignatureToolbar, fetchSignatureImage } from "./signature";
import { useCurrentUser } from "@/contexts/UserContext";

interface FormRequestPrintModalProps {
  formRequest: FormRequest;
  onClose: () => void;
}


function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

const dotted: React.CSSProperties = {
  borderBottom: "0.5pt dotted black", color: INK_BLUE,
  display: "inline-block",
  textAlign: "center",
};

export default function FormRequestPrintModal({ formRequest, onClose }: FormRequestPrintModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const org = useOrg();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const { id: currentUserId } = useCurrentUser();
  // เฉพาะผู้ขอเองที่วาง/ซ่อนลายเซ็นของตนได้ (ลายเซ็นคือการรับรองด้วยตนเอง) — แบบฟอร์มขอเอกสารภายในยังไม่มีที่เก็บตำแหน่งถาวร
  // จึงจัดวางได้เฉพาะตอนเปิดดู/พิมพ์ครั้งนี้
  // ใบขอรถยนต์: ไม่วางลายเซ็นผู้ขอ (พิมพ์/ส่ง PDF ให้เจ้าของชื่อเซ็นด้วยมือ) — ลายเซ็นมีเฉพาะบล็อก "ผู้จัดทำเอกสาร"
  // และเฉพาะเมื่อชื่อผู้จัดทำในใบเป็นผู้ใช้ที่ล็อกอินอยู่เอง (ใช้ลายเซ็นของตนเอง วาง/ซ่อนได้ตอนเปิดดู/พิมพ์)
  const template = formRequest.template;
  const isVehicleForm = template?.systemKey === VEHICLE_REQUEST_SYSTEM_KEY;
  // ระยะขอบของฟอร์มนี้ (แก้ที่ pageMargins.ts) — ใช้ทั้งตัวอย่างและหน้าต่างพิมพ์จริง
  const pageMargins = getPageMargins(template?.systemKey);
  const formData = (formRequest.data ?? {}) as unknown as Record<string, unknown>;
  const isSubmitterSelf = isVehicleForm && canPlaceSubmitterSignature(formData, currentUserId);
  const [ownSignatureFileId, setOwnSignatureFileId] = useState<string | null>(null);
  useEffect(() => {
    if (!isSubmitterSelf) return;
    let cancelled = false;
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled && res?.success) setOwnSignatureFileId(res.data?.signatureFileId ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSubmitterSelf]);
  const isRequester = formRequest.requestedById === currentUserId && !isVehicleForm;
  const sigCtl = useSignatureControl({
    signatureFileId: isVehicleForm ? ownSignatureFileId : formRequest.requestedBy?.signatureFileId,
    canPlace: isVehicleForm ? isSubmitterSelf : isRequester,
    canHide: isVehicleForm ? isSubmitterSelf : isRequester,
    // ใบขอรถยนต์: ลายเซ็นเป็นสีหมึกปากกาน้ำเงิน (ข้อความพิมพ์ใต้ลายเซ็นเป็นสีดำ)
    inkColor: isVehicleForm ? INK_BLUE : undefined,
  });
  const requester = formRequest.requestedBy;
  const requestDate = formatThaiDate(formRequest.requestDate);
  const documentDate = formatThaiDate(formRequest.createdAt);
  const sig = formatSignatureName(requester?.prefix, requester?.name);
  // วันที่ลงนามของผู้บังคับบัญชา = วันที่คำขอได้รับการพิจารณา (ยังไม่พิจารณา = ว่าง)
  const approvalDate = formatSignDate(formRequest.approvedAt);
  const data = (formRequest.data ?? {}) as unknown as Record<string, unknown>;
  const isVehicle = isVehicleForm;
  const vehicleBlocks = isVehicle
    ? buildVehicleLayout({
        data,
        requestDate,
        requesterName: requester ? `${requester.prefix ?? ""}${requester.name}` : "",
        requesterPosition: requester?.position ?? "",
        thaiDate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatThaiDate(`${v}T00:00:00`) : null),
      })
    : null;

  if (!template) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full text-center">
          <p className="text-sm text-rose-600 mb-4">ไม่พบแบบฟอร์มต้นแบบของรายการนี้ (อาจถูกลบไปแล้ว)</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm">ปิด</button>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    openPrintWindow(template.documentTitle, getPrintableHtml(printContent), pageMargins.print);
  };

  const handleExportPDF = async () => {
    try {
      setIsGeneratingPDF(true);
      // ./FormRequestPDF import "@/lib/pdf-fonts" (ฟอนต์ local) เป็น side effect ของตัวมันเองอยู่แล้ว
      const { generateFormRequestPDF } = await import("./FormRequestPDF");
      const sigImage = sigCtl.placement ? await fetchSignatureImage(sigCtl.src) : null;
      const signature = sigImage && sigCtl.placement ? { image: sigImage, placement: sigCtl.placement } : null;
      const blob = await generateFormRequestPDF(formRequest, signature, org);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `form_request_${formRequest.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("เกิดข้อผิดพลาดในการสร้าง PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">{template.menuTitle} (พิมพ์/Export PDF)</h2>
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              disabled={isGeneratingPDF}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {isGeneratingPDF ? "กำลังสร้าง PDF..." : "Export PDF"}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
              พิมพ์
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              <X className="w-4 h-4" />
              ปิด
            </button>
          </div>
        </div>

        {sigCtl.canControl && (
          <div className="px-4 py-2 border-b bg-white">
            <SignatureToolbar ctl={sigCtl} />
          </div>
        )}

        {/* Form Content */}
        <div className="overflow-auto p-6 bg-gray-100">
          <div
            ref={printRef}
            className="bg-white shadow-sm mx-auto"
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: cssPadding(pageMargins.print),
              boxSizing: "border-box",
              fontFamily: "THSarabun",
              fontSize: "16pt",
              lineHeight: 1.2,
            }}
          >
            {vehicleBlocks ? (
              <VehicleRequestPrint
                blocks={vehicleBlocks}
                signatureSlot={<SignatureMark ctl={sigCtl} anchorLeft="50%" anchorTop="4mm" />}
              />
            ) : (
            <>
            {/* ส่วนหัว */}
            <div style={{ textAlign: "center", marginBottom: "3mm" }}>
              <div style={{ fontSize: "18pt", fontWeight: "bold" }}>{template.documentTitle}</div>
            </div>

            {/* วันที่ */}
            <div style={{ textAlign: "right", marginBottom: "2mm" }}>
              วันที่
              <span style={{ ...dotted, minWidth: "10mm" }}>{documentDate.day}</span>
              เดือน
              <span style={{ ...dotted, minWidth: "25mm" }}>{documentDate.month}</span>
              พ.ศ.
              <span style={{ ...dotted, minWidth: "15mm" }}>{documentDate.year}</span>
            </div>

            {/* เรื่อง + เรียน */}
            <div style={{ display: "flex", marginBottom: "1mm" }}>
              <span style={{ whiteSpace: "nowrap" }}>เรื่อง</span>
              <span style={{ ...dotted, flex: 1, marginLeft: "2mm", paddingLeft: "1mm" }}>
                {template.documentTitle}
              </span>
            </div>
            <div style={{ display: "flex", marginBottom: "2mm" }}>
              <span style={{ whiteSpace: "nowrap" }}>เรียน</span>
              <span style={{ ...dotted, flex: 1, marginLeft: "2mm", paddingLeft: "1mm" }}>{directorTitle(org)}</span>
            </div>

            {/* ข้าพเจ้า + ตำแหน่ง */}
            <div style={{ display: "flex", paddingLeft: "10mm", marginBottom: "1mm" }}>
              <span style={{ whiteSpace: "nowrap" }}>ข้าพเจ้า</span>
              <span style={{ ...dotted, flex: 1, marginLeft: "1mm" }}>
                {requester ? `${requester.prefix ?? ""}${requester.name}` : ""}
              </span>
              <span style={{ whiteSpace: "nowrap", marginLeft: "1mm" }}>ตำแหน่ง</span>
              <span style={{ ...dotted, flex: 1, marginLeft: "1mm" }}>{requester?.position ?? ""}</span>
            </div>
            <div style={{ marginBottom: "2mm" }}>
              <span>กอง</span>
              <span style={{ ...dotted, minWidth: "60mm" }}>{requester?.department ?? ""}</span>
              <span style={{ marginLeft: "5mm" }}>สังกัด</span>
              <span style={{ ...dotted, minWidth: "70mm" }}>{requester?.division ?? ""}</span>
            </div>

            {/* เนื้อหา */}
            <div style={{ marginBottom: "2mm" }}>
              มีความประสงค์จะ{template.documentTitle} โดยมีรายละเอียดดังนี้
            </div>
            {template.fields.map((field) => (
              <div key={field.key} style={{ display: "flex", marginBottom: "1.5mm", paddingLeft: "10mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>{field.label}</span>
                <span style={{ ...dotted, flex: 1, marginLeft: "2mm", paddingLeft: "1mm" }}>
                  {formatFieldValue(data[field.key])}
                </span>
              </div>
            ))}

            <div style={{ marginBottom: "1mm" }}>
              ในวันที่
              <span style={{ ...dotted, minWidth: "10mm" }}>{requestDate.day}</span>
              เดือน
              <span style={{ ...dotted, minWidth: "25mm" }}>{requestDate.month}</span>
              พ.ศ.
              <span style={{ ...dotted, minWidth: "15mm" }}>{requestDate.year}</span>
            </div>
            {formRequest.documentNumber ? (
              <div style={{ display: "flex", marginBottom: "2mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>เลขที่หนังสือ</span>
                <span style={{ ...dotted, flex: 1, marginLeft: "2mm", paddingLeft: "1mm" }}>
                  {formRequest.documentNumber}
                </span>
              </div>
            ) : null}

            {/* ลงชื่อผู้ขอ */}
            <div style={{ position: "relative", textAlign: "center", margin: "8mm 0" }}>
              <SignatureMark ctl={sigCtl} anchorLeft="50%" anchorTop="4mm" />
              <div style={{ marginBottom: "1mm" }}>
                ลงชื่อ{sig.linePrefix ? ` ${sig.linePrefix}` : ""}{" "}
                <span style={{ ...dotted, minWidth: "55mm", textAlign: "left" }}> </span>
              </div>
              <div>
                {"("}{" "}
                <span style={{ ...dotted, color: INK_BLACK, minWidth: "50mm" }}>{sig.parenName}</span>{" "}
                {")"}
              </div>
              <div style={{ marginTop: "1mm" }}>ผู้ขอ</div>
            </div>

            {/* ความเห็นผู้บังคับบัญชา - บล็อกลงชื่อเปล่าไว้เซ็นจริง */}
            <div style={{ width: "60%", marginLeft: "auto", marginTop: "8mm" }}>
              <div style={{ fontWeight: "bold", textDecoration: "underline", marginBottom: "3mm" }}>
                ความเห็นผู้บังคับบัญชา
              </div>
              <div style={{ borderBottom: "0.5pt dotted black", color: INK_BLUE, height: "6mm", marginBottom: "3mm" }} />
              <div style={{ borderBottom: "0.5pt dotted black", color: INK_BLUE, height: "6mm", marginBottom: "5mm" }} />
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "1mm" }}>
                ลงชื่อ
                <span style={{ ...dotted, minWidth: "60mm", marginLeft: "2mm" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "3mm" }}>
                {"("}
                <span style={{ ...dotted, minWidth: "60mm" }} />
                {")"}
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "3mm" }}>
                ตำแหน่ง
                <span style={{ ...dotted, minWidth: "60mm", marginLeft: "2mm" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                วันที่
                <SignDateCells date={approvalDate} widths={[10, 12, 16]} firstMarginLeft="2mm" />
              </div>
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
