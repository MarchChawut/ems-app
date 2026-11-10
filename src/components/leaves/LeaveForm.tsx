/**
 * ==================================================
 * Leave Form Component - แบบใบลาป่วย ลาคลอดบุตร ลากิจ
 * ==================================================
 * แสดงแบบฟอร์มการลาตามรูปแบบของหน่วยงานราชการไทย
 */

"use client";

import React, { useRef, useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { directorTitle, directorShort } from "@/lib/org-settings";
import { getPageMargins, cssPadding } from "@/components/forms/pageMargins";
import { Printer, X, FileDown, Loader2 } from "lucide-react";
import { Leave, LeaveType, User } from "@/types";
import { formatSignatureName } from "@/lib/utils";
import { getFiscalYearRange } from "@/lib/leave-calc";
import { escapeHtml } from "@/components/forms/formPrintShared";
import { INK_BLUE } from "../forms/formPrintShared";
import SignDateCells from "../forms/SignDateCells";
import { useSignatureControl, SignatureMark, SignatureToolbar, fetchSignatureImage } from "../forms/signature";
import { getPrintableHtml, printWhenReady, INK_BLACK, formatSignDate } from "../forms/formPrintShared";
import type { SignaturePlacement } from "@/types";

interface LeaveFormProps {
  leave: Leave & { user: User };
  userStats?: {
    pastCount: number;
    pastDays: number;
    currentCount: number;
    currentDays: number;
    totalCount: number;
    totalDays: number;
  };
  previousLeave?: (Leave & { user: User }) | null;
  userLeaves?: Leave[];
  /** ผู้อำนวยการกอง (role DIRECTOR) ที่ยัง active อยู่ - ใช้พิมพ์ชื่อ/ตำแหน่งล่วงหน้าในช่องลงนาม */
  director?: User | null;
  /** หัวหน้างานของเจ้าของใบลา (User.supervisorId) - ใช้พิมพ์ชื่อในช่อง "ความเห็นของผู้บังคับบัญชา" */
  supervisor?: User | null;
  /** ธุรการที่ตรวจสอบใบลา (Leave.adminReviewedBy) - ใช้พิมพ์ชื่อในช่อง "ผู้ตรวจสอบ" */
  reviewer?: User | null;
  onClose: () => void;
  /** เฉพาะเจ้าของใบลา: วาง/ย้าย/ย่อขยายลายเซ็นของตนบนแบบฟอร์มได้ */
  canPlaceSignature?: boolean;
  /** เจ้าของ หรือ MANAGER ขึ้นไป: ซ่อนลายเซ็นบนแบบฟอร์มได้ (วางแทนเจ้าของไม่ได้) */
  canHideSignature?: boolean;
  /** แจ้งผู้เรียกเมื่อบันทึกตำแหน่งลายเซ็นแล้ว (ใช้อัปเดตรายการในหน้าลา) */
  onSignatureSaved?: (placement: SignaturePlacement | null) => void;
}

interface TypeStats {
  pastCount: number;
  pastDays: number;
  currentCount: number;
  currentDays: number;
  totalCount: number;
  totalDays: number;
}

/**
 * แปลประเภทการลาเป็นภาษาไทย
 */
const leaveTypeLabels: Record<LeaveType, { short: string; full: string }> = {
  SICK: { short: "ป่วย", full: "ลาป่วย" },
  PERSONAL: { short: "กิจ", full: "ลากิจ" },
  MATERNITY: { short: "คลอดบุตร", full: "ลาคลอดบุตร" },
  ORDINATION: { short: "บวช", full: "ลาบวช" },
  EARLY_LEAVE: { short: "ออกก่อนเวลา", full: "ออกก่อนเวลา" },
  LATE_ARRIVAL: { short: "มาสาย", full: "มาสาย" },
  RUN_AN_ERRAND: { short: "ออกนอกเขต", full: "ออกนอกเขตพระราชฐาน" },
  OTHER: { short: "อื่นๆ", full: "ลาอื่นๆ" },
};

/**
 * ฟอร์แมตวันที่เป็นไทย
 */
function formatThaiDate(date: Date | string): {
  day: string;
  month: string;
  year: string;
} {
  const d = new Date(date);
  const day = d.getDate().toString();
  const months = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  const month = months[d.getMonth()];
  // แปลงเป็น พ.ศ. อย่างปลอดภัย (ป้องกันบวก 543 ซ้ำ กรณีปีเป็น พ.ศ. อยู่แล้ว)
  const rawYear = d.getFullYear();
  const year = (rawYear > 2500 ? rawYear : rawYear + 543).toString();
  return { day, month, year };
}

/**
 * แสดงผลจำนวนวันลาที่บันทึกไว้แล้วเป็นข้อความ (รองรับครึ่งวันและชั่วโมง)
 * ไม่คำนวณใหม่ - ใช้ Leave.totalDays ที่บันทึกไว้ตอนสร้าง/แก้ไขรายการลา
 * (แหล่งความจริงเดียว ดู src/lib/leave-calc.ts) เพื่อไม่ให้ค่าที่พิมพ์ขัดแย้งกับค่าที่บันทึกจริง
 */
function formatLeaveDays(
  days: number,
  hours?: number | null,
  isHalfDay?: boolean,
): string {
  // เช็คครึ่งวันก่อนเสมอ (ทั้งจาก checkbox isHalfDay และจากลาแบบชั่วโมงที่คำนวณออกมาเป็น 0.5 วัน)
  if (isHalfDay || days === 0.5) {
    return `ครึ่งวัน`;
  }
  if (hours && hours > 0) {
    return `${days} วัน`;
  }
  // แสดงทศนิยม 1 ตำแหน่ง
  if (days % 1 !== 0) {
    return `${days.toFixed(1)} วัน`;
  }
  return `${days} วัน`;
}

export default function LeaveForm({
  leave,
  userStats,
  previousLeave,
  userLeaves = [],
  director = null,
  supervisor = null,
  reviewer = null,
  onClose,
  canPlaceSignature = false,
  canHideSignature = false,
  onSignatureSaved,
}: LeaveFormProps) {
  // ชื่อสังกัด/ชื่อกองหลักจากข้อมูลหน่วยงาน (แก้ที่หน้าตั้งค่า)
  const org = useOrg();
  const printRef = useRef<HTMLDivElement>(null);
  const sigCtl = useSignatureControl({
    leaveId: leave.id,
    signatureFileId: leave.user.signatureFileId,
    initialPlacement: leave.signaturePlacement,
    canPlace: canPlaceSignature,
    canHide: canHideSignature,
    onSaved: onSignatureSaved,
  });

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // คำนวณสถิติแยกตามประเภทลาในปีงบประมาณ (ใช้ totalDays ที่บันทึกไว้แล้วของแต่ละรายการ)
  const fiscalRange = getFiscalYearRange(new Date(leave.startDate));
  const currentLeaveDaysNum = leave.totalDays;

  const computeTypeStats = (type: string): TypeStats => {
    // ลาก่อนหน้า (ไม่รวมใบลาปัจจุบัน) ในปีงบประมาณเดียวกัน
    const pastLeaves = userLeaves.filter(
      (l) =>
        l.id !== leave.id &&
        l.type === type &&
        new Date(l.startDate) >= fiscalRange.start &&
        new Date(l.startDate) <= fiscalRange.end &&
        (l.status === 'APPROVED' || l.status === 'PENDING')
    );
    const pastCount = pastLeaves.length;
    const pastDays = pastLeaves.reduce((sum, l) => sum + l.totalDays, 0);

    const currentCount = leave.type === type ? 1 : 0;
    const currentDays = leave.type === type ? currentLeaveDaysNum : 0;

    return {
      pastCount,
      pastDays: Math.round(pastDays * 100) / 100,
      currentCount,
      currentDays: Math.round(currentDays * 100) / 100,
      totalCount: pastCount + currentCount,
      totalDays: Math.round((pastDays + currentDays) * 100) / 100,
    };
  };

  const sickStats = computeTypeStats('SICK');
  const personalStats = computeTypeStats('PERSONAL');
  const maternityStats = computeTypeStats('MATERNITY');

  // ฟอร์แมตจำนวนวันในตารางสถิติ (รองรับครึ่งวัน/ชม.)
  const fmtDays = (days: number): string => {
    if (days === 0) return "0";
    if (days % 1 === 0) return `${days}`;
    // ถ้าลาเป็นชม. ให้แสดงค่าทศนิยมที่แม่นยำ (เช่น 0.13, 0.25, 0.5)
    const rounded = Math.round(days * 100) / 100;
    return `${rounded}`;
  };

  // ค่าเริ่มต้นสำหรับ userStats (backward compat)
  const stats = userStats || {
    pastCount: 0,
    pastDays: 0,
    currentCount: 1,
    currentDays: currentLeaveDaysNum || 1,
    totalCount: 1,
    totalDays: currentLeaveDaysNum || 1,
  };

  const startDate = formatThaiDate(leave.startDate);
  const endDate = formatThaiDate(leave.endDate);
  // ใช้วันที่ที่สร้างใบลา (createdAt) เพื่อให้เมื่อเปิดย้อนหลังยังเป็นวันที่เขียนจริง
  const documentDate = formatThaiDate(
    (leave as any).createdAt ? new Date((leave as any).createdAt) : new Date()
  );
  const leaveDays = formatLeaveDays(leave.totalDays, leave.hours, leave.isHalfDay);

  // ผู้ลงนามอนุมัติ (ผู้อำนวยการ) - ใช้ข้อมูลจริงถ้ามี ไม่เช่นนั้นคงค่าเดิมของแบบฟอร์มไว้
  const directorSig = director
    ? formatSignatureName(director.prefix, director.name)
    // ยังไม่มีผู้อำนวยการกอง (role DIRECTOR) ที่ active — เว้นช่องลงนามว่างให้เซ็นมือ (ไม่ฝังชื่อบุคคลไว้ในโค้ด)
    : { linePrefix: '', parenName: '' };
  const directorPosition = director?.position || directorShort(org);

  // ผู้ลงนามความเห็นของผู้บังคับบัญชา (หัวหน้างานของเจ้าของใบลา) - ไม่มีค่าเริ่มต้น เว้นว่างถ้ายังไม่ได้กำหนดหัวหน้างาน
  const supervisorSig = supervisor ? formatSignatureName(supervisor.prefix, supervisor.name) : null;
  const supervisorPosition = supervisor?.position || '';

  // ผู้ลงนามช่องผู้ตรวจสอบ (ธุรการที่ตรวจสอบขั้นที่ 1) - ไม่มีค่าเริ่มต้น เว้นว่างถ้ายังไม่ได้ตรวจสอบ
  const reviewerSig = reviewer ? formatSignatureName(reviewer.prefix, reviewer.name) : null;
  const reviewerPosition = reviewer?.position || '';
  // วันที่ลงนามของแต่ละขั้น = เวลาที่ขั้นนั้นดำเนินการจริง (ยังไม่ถึงขั้น = ว่าง)
  const reviewDate = formatSignDate(leave.adminReviewedAt);
  const supervisorDate = formatSignDate(leave.supervisorApprovedAt);
  const directorDate = formatSignDate(leave.approvedAt);

  // ข้อมูลการลาครั้งก่อน
  const prevLeaveDate = previousLeave ? formatThaiDate(previousLeave.startDate) : null;
  const prevLeaveEndDate = previousLeave ? formatThaiDate(previousLeave.endDate) : null;
  const prevLeaveDays = previousLeave
    ? formatLeaveDays(previousLeave.totalDays, previousLeave.hours, previousLeave.isHalfDay)
    : null;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>แบบใบลา - ${escapeHtml(((leave.user as any).prefix || '') + leave.user.name)}</title>
        <style>
          @page { size: A4; margin: 0; }
          @font-face {
            font-family: 'THSarabun';
            src: url('/fonts/THSarabun.ttf') format('truetype');
          }

          body { 
            font-family: 'THSarabun', sans-serif;
            font-size: 16pt; 
            line-height: 1.2;
            margin: 0;
            padding: 0;
          }
          .form-container { 
            width: 210mm; 
            min-height: auto;
            padding: ${cssPadding(getPageMargins("LEAVE").print)};
            box-sizing: border-box;
            page-break-inside: avoid;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        </style>
      </head>
      <body>
        <div class="form-container">
          ${getPrintableHtml(printContent)}
        </div>
      </body>
      </html>
    `);

    printWhenReady(printWindow);
  };

  const handleExportPDF = async () => {
    try {
      setIsGeneratingPDF(true);
      // โหลด @react-pdf/renderer เฉพาะตอนสร้าง PDF จริง (ไม่รวมใน bundle หลักของหน้าลา)
      // ต้อง import ./LeaveFormPDF ก่อน ./pdf-fonts เสมอ เพราะ pdf-fonts ต้องทับฟอนต์ Google Fonts
      // ด้วยฟอนต์ THSarabun.ttf ในเครื่อง (กันปัญหาเซิร์ฟเวอร์ intranet ต่ออินเทอร์เน็ตออกไปโหลดฟอนต์ไม่ได้)
      const { generateLeavePDF } = await import("./LeaveFormPDF");
      await import("@/lib/pdf-fonts");
      // ลายเซ็นผู้ลา: ดึงรูปเป็น data URL เพราะ react-pdf ส่ง cookie ล็อกอินไม่ได้
      const sigImage = sigCtl.placement ? await fetchSignatureImage(sigCtl.src) : null;
      const signature = sigImage && sigCtl.placement ? { image: sigImage, placement: sigCtl.placement } : null;
      const blob = await generateLeavePDF(leave, stats, director, previousLeave, supervisor, reviewer, signature, org);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `leave_form_${leave.user.username}_${new Date().toISOString().split("T")[0]}.pdf`;
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

  const leaveTypeLabel = leaveTypeLabels[leave.type];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">
            แบบใบลา (พิมพ์/Export PDF)
          </h2>
          <div className="flex gap-2">
            {/* <button
              onClick={handleExportPDF}
              disabled={isGeneratingPDF}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPDF ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {isGeneratingPDF ? "กำลังสร้าง PDF..." : "Export PDF"}
            </button> */}
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
              padding: cssPadding(getPageMargins("LEAVE").print),
              boxSizing: "border-box",
              fontFamily: "THSarabun",
              fontSize: "16pt",
              lineHeight: 1.2,
            }}
          >
            {/* ส่วนหัว */}
            <div style={{ textAlign: "center", marginBottom: "3mm" }}>
              <div style={{ fontSize: "18pt", fontWeight: "bold" }}>
                แบบใบลาป่วย ลาคลอดบุตร ลากิจ
              </div>
            </div>

            {/* เขียนที่ + วันที่ */}
            <div
              style={{
                textAlign: "right",
                fontSize: "16pt",
                marginBottom: "2mm",
              }}
            >
              <div style={{ marginBottom: "1mm" }}>
                เขียนที่
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "80mm",
                    textAlign: "center",
                  }}
                >
                  {org.divisionName}
                </span>
              </div>
              <div>
                วันที่
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "10mm",
                    textAlign: "center",
                  }}
                >
                  {documentDate.day}
                </span>
                เดือน
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "25mm",
                    textAlign: "center",
                  }}
                >
                  {documentDate.month}
                </span>
                พ.ศ.
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "15mm",
                    textAlign: "center",
                  }}
                >
                  {documentDate.year}
                </span>
              </div>
            </div>

            {/* เรื่อง + เรียน */}
            <div style={{ fontSize: "16pt" }}>
              <div style={{ display: "flex", marginBottom: "1mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>เรื่อง</span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    flex: 1,
                    marginLeft: "2mm",
                    paddingLeft: "1mm",
                  }}
                >
                  ขออนุญาต{leaveTypeLabel.full}
                </span>
              </div>
              <div style={{ display: "flex", marginBottom: "2mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>เรียน</span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    flex: 1,
                    marginLeft: "2mm",
                    paddingLeft: "1mm",
                  }}
                >
                  {directorTitle(org)}
                </span>
              </div>

              {/* ข้าพเจ้า + ตำแหน่ง */}
              <div
                style={{
                  display: "flex",
                  paddingLeft: "10mm",
                  marginBottom: "1mm",
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>ข้าพเจ้า</span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    flex: 1,
                    marginLeft: "1mm",
                    textAlign: "center",
                  }}
                >
                  {leave.user.prefix}{leave.user.name}
                </span>
                <span style={{ whiteSpace: "nowrap", marginLeft: "1mm" }}>
                  ตำแหน่ง
                </span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    flex: 1,
                    marginLeft: "1mm",
                    textAlign: "center",
                  }}
                >
                  {leave.user.position || ""}
                </span>
              </div>

              {/* กอง + สังกัด */}
              <div style={{ paddingLeft: "0mm", marginBottom: "2mm" }}>
                <span>กอง</span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "60mm",
                    textAlign: "center",
                  }}
                >
                  {org.departmentName}
                </span>
                <span style={{ marginLeft: "5mm" }}>สังกัด</span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "80mm",
                    textAlign: "center",
                  }}
                >
                  {org.divisionName}
                </span>
              </div>

              {/* ขอลา: ป่วย / กิจ / คลอดบุตร */}
              <div style={{ marginBottom: "1mm", paddingLeft: "15mm" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginRight: "5mm",
                    fontWeight: leave.type === "SICK" ? "bold" : "normal",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "3mm",
                      height: "3mm",
                      marginRight: "1.5mm",
                      borderRadius: "50%",
                      border: "1px solid black",
                      backgroundColor:
                        leave.type === "SICK" ? "black" : "transparent",
                    }}
                  />
                  ป่วย
                </span>
              </div>
              <div style={{ display: "flex", marginBottom: "1mm" }}>
                <span style={{ marginRight: "4mm", whiteSpace: "nowrap" }}>
                  ขอลา
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginLeft: "3mm",
                    marginRight: "3mm",
                    fontWeight: leave.type === "PERSONAL" ? "bold" : "normal",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "3mm",
                      height: "3mm",
                      marginRight: "1.5mm",
                      borderRadius: "50%",
                      border: "1px solid black",
                      backgroundColor:
                        leave.type === "PERSONAL" ? "black" : "transparent",
                    }}
                  />
                  กิจ
                </span>
                <span
                  style={{
                    whiteSpace: "nowrap",
                    marginLeft: "8mm",
                    marginRight: "2mm",
                  }}
                >
                  เนื่องจาก
                </span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    flex: 1,
                    textAlign: "center",
                  }}
                >
                  {leave.type === "PERSONAL" ? leave.reason : ""}
                </span>
              </div>
              <div style={{ marginBottom: "2mm", paddingLeft: "15mm" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontWeight: leave.type === "MATERNITY" ? "bold" : "normal",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "3mm",
                      height: "3mm",
                      marginRight: "1.5mm",
                      borderRadius: "50%",
                      border: "1px solid black",
                      backgroundColor:
                        leave.type === "MATERNITY" ? "black" : "transparent",
                    }}
                  />
                  คลอดบุตร
                </span>
              </div>

              {/* ตั้งแต่วันที่...ถึงวันที่...มีกำหนด */}
              <div style={{ marginBottom: "1mm" }}>
                ตั้งแต่วันที่
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "8mm",
                    textAlign: "center",
                  }}
                >
                  {startDate.day}
                </span>
                เดือน
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "20mm",
                    textAlign: "center",
                  }}
                >
                  {startDate.month}
                </span>
                พ.ศ.
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "12mm",
                    textAlign: "center",
                  }}
                >
                  {startDate.year}
                </span>
                <span style={{ marginLeft: "" }}>ถึงวันที่</span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "8mm",
                    textAlign: "center",
                  }}
                >
                  {endDate.day}
                </span>
                เดือน
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "20mm",
                    textAlign: "center",
                  }}
                >
                  {endDate.month}
                </span>
                พ.ศ.
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "12mm",
                    textAlign: "center",
                  }}
                >
                  {endDate.year}
                </span>
                มีกำหนด
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "12mm",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                >
                  {leaveDays}
                </span>
              </div>

              {/* ข้าพเจ้าได้ลา */}
              <div style={{ marginBottom: "2mm" }}>
                ข้าพเจ้าได้ลา
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    margin: "0 3mm",
                    fontWeight: previousLeave?.type === "SICK" ? "bold" : "normal",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "3mm",
                      height: "3mm",
                      marginRight: "1.5mm",
                      borderRadius: "50%",
                      border: "1px solid black",
                      backgroundColor:
                        previousLeave?.type === "SICK" ? "black" : "transparent",
                    }}
                  />
                  ป่วย
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    margin: "0 1mm",
                    fontWeight: previousLeave?.type === "PERSONAL" ? "bold" : "normal",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "3mm",
                      height: "3mm",
                      marginRight: "1.5mm",
                      borderRadius: "50%",
                      border: "1px solid black",
                      backgroundColor:
                        previousLeave?.type === "PERSONAL" ? "black" : "transparent",
                    }}
                  />
                  กิจ
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    margin: "0 3mm",
                    fontWeight: previousLeave?.type === "MATERNITY" ? "bold" : "normal",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "3mm",
                      height: "3mm",
                      marginRight: "1.5mm",
                      borderRadius: "50%",
                      border: "1px solid black",
                      backgroundColor:
                        previousLeave?.type === "MATERNITY" ? "black" : "transparent",
                    }}
                  />
                  คลอดบุตร
                </span>
                ครั้งสุดท้ายตั้งแต่วันที่
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "8mm",
                    textAlign: "center",
                  }}
                >
                  {prevLeaveDate?.day || ""}
                </span>
                เดือน
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "20mm",
                    textAlign: "center",
                  }}
                >
                  {prevLeaveDate?.month || ""}
                </span>
                พ.ศ.
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "12mm",
                    textAlign: "center",
                  }}
                >
                  {prevLeaveDate?.year || ""}
                </span>
              </div>

              {/* ถึงวันที่ + มีกำหนด + ในระหว่างลา */}
              <div style={{ marginBottom: "1mm" }}>
                ถึงวันที่
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "8mm",
                    textAlign: "center",
                  }}
                >
                  {prevLeaveEndDate?.day || ""}
                </span>
                เดือน
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "20mm",
                    textAlign: "center",
                  }}
                >
                  {prevLeaveEndDate?.month || ""}
                </span>
                พ.ศ.
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "12mm",
                    textAlign: "center",
                  }}
                >
                  {prevLeaveEndDate?.year || ""}
                </span>
                มีกำหนด
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "12mm",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                >
                  {prevLeaveDays || ""}
                </span>
                ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "20mm",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                >
                  {(leave as any).contactAddress || (leave.user as any).address || ""}
                </span>
              </div>
              <div style={{ display: "flex", marginBottom: "2mm" }}>
                <span
                  style={{ borderBottom: "0.5pt dotted black", color: INK_BLUE, flex: 1 }}
                >
                  {/* ต่อจากสถานที่พัก (กรณีข้อความยาว) */}
                </span>
                <span style={{ whiteSpace: "nowrap", margin: "0 2mm" }}>
                  หมายเลขโทรศัพท์
                </span>
                <span
                  style={{
                    borderBottom: "0.5pt dotted black", color: INK_BLUE,
                    display: "inline-block",
                    minWidth: "40mm",
                    textAlign: "center",
                    fontWeight: "bold",
                  }}
                >
                  {(leave.user as any).phone || ""}
                </span>
              </div>
            </div>

            {/* ลงชื่อผู้ลา */}
            <div
              style={{
                position: "relative",
                textAlign: "center",
                margin: "8mm 0 8mm 0",
                fontSize: "16pt",
              }}
            >
              <SignatureMark ctl={sigCtl} anchorLeft="50%" anchorTop="4mm" />
              {(() => {
                const sig = formatSignatureName(
                  (leave.user as any).prefix,
                  (leave.user as any).name
                );
                return (
                  <>
                    <div style={{ marginBottom: "1mm" }}>
                      ลงชื่อ{sig.linePrefix ? ` ${sig.linePrefix}` : ""}{" "}
                      <span
                        style={{
                          borderBottom: "0.5pt dotted black", color: INK_BLUE,
                          display: "inline-block",
                          minWidth: "55mm",
                          textAlign: "left",
                        }}
                      >
                        {" "}
                      </span>
                    </div>
                    <div style={{ marginLeft: "8mm" }}>
                      {"("}{" "}
                      <span
                        style={{
                          borderBottom: "0.5pt dotted black", color: INK_BLACK,
                          display: "inline-block",
                          minWidth: "50mm",
                          textAlign: "center",
                        }}
                      >
                        {sig.parenName}
                      </span>{" "}
                      {")"}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* ตารางสถิติ + ความเห็น */}
            <div
              style={{
                display: "flex",
                gap: "5mm",
                alignItems: "flex-start",
                fontSize: "16pt",
              }}
            >
              {/* ฝั่งซ้าย - สถิติ */}
              <div style={{ width: "50%", margin: "1mm auto" }}>
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: "16pt",
                    textAlign: "center",
                    marginBottom: "1mm",
                    textDecoration: "underline",
                  }}
                >
                  สถิติการลาในปีงบประมาณนี้
                </div>

                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14pt",
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          border: "0.5pt solid black",
                          padding: "1mm",
                          textAlign: "center",
                          width: "25%",
                        }}
                      >
                        ประเภทลา
                      </th>
                      <th
                        style={{
                          border: "0.5pt solid black",
                          padding: "1mm",
                          textAlign: "center",
                          width: "25%",
                        }}
                      >
                        ลามาแล้ว
                        <br />
                        ครั้ง/วัน
                      </th>
                      <th
                        style={{
                          border: "0.5pt solid black",
                          padding: "1mm",
                          textAlign: "center",
                          width: "25%",
                        }}
                      >
                        ลาครั้งนี้
                        <br />
                        ครั้ง/วัน
                      </th>
                      <th
                        style={{
                          border: "0.5pt solid black",
                          padding: "1mm",
                          textAlign: "center",
                          width: "25%",
                        }}
                      >
                        รวมเป็น
                        <br />
                        ครั้ง/วัน
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      { label: "ป่วย", stats: sickStats },
                      { label: "กิจ", stats: personalStats },
                      { label: "คลอดบุตร", stats: maternityStats },
                    ] as { label: string; stats: TypeStats }[]).map((row) => (
                      <tr key={row.label}>
                        <td
                          style={{
                            border: "0.5pt solid black",
                            padding: "1mm",
                            textAlign: "center",
                          }}
                        >
                          {row.label}
                        </td>
                        <td
                          style={{
                            border: "0.5pt solid black",
                            padding: "1mm",
                            textAlign: "center",
                          }}
                        >
                          {row.stats.pastCount > 0 || row.stats.pastDays > 0
                            ? `${row.stats.pastCount}/${fmtDays(row.stats.pastDays)}`
                            : "-"}
                        </td>
                        <td
                          style={{
                            border: "0.5pt solid black",
                            padding: "1mm",
                            textAlign: "center",
                          }}
                        >
                          {row.stats.currentCount > 0
                            ? `${row.stats.currentCount}/${fmtDays(row.stats.currentDays)}`
                            : "-"}
                        </td>
                        <td
                          style={{
                            border: "0.5pt solid black",
                            padding: "1mm",
                            textAlign: "center",
                          }}
                        >
                          {row.stats.totalCount > 0 || row.stats.totalDays > 0
                            ? `${row.stats.totalCount}/${fmtDays(row.stats.totalDays)}`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* ลงชื่อผู้ตรวจสอบ */}
                {/* ลงชื่อ */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: "8mm",
                    marginBottom: "1mm",
                  }}
                >
                  ลงชื่อ {reviewerSig?.linePrefix || ""}
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLUE,
                      display: "inline-block",
                      minWidth: "50mm",
                    }}
                  />
                  ผู้ตรวจสอบ
                </div>

                {/* (ชื่อ) */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    paddingLeft: "8mm",
                    marginBottom: "3mm",
                  }}
                >
                  {"("}
                  <span style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLACK,
                      display: "inline-block",
                      minWidth: "50mm",
                      textAlign: "center",
                    }}
                  >
                    {reviewerSig?.parenName || ""}
                  </span>
                  {")"}
                </div>

                {/* ตำแหน่ง */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "3mm",
                  }}
                >
                  ตำแหน่ง
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLACK,
                      display: "inline-block",
                      minWidth: "55mm",
                      textAlign: "center",
                    }}
                  >
                    {reviewerPosition}
                  </span>
                </div>
                {/* วันที่ */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  วันที่
                  <SignDateCells date={reviewDate} widths={[10, 12, 16]} />
                </div>
              </div>

              {/* ฝั่งขวา - ความเห็น + คำสั่ง */}
              <div style={{ width: "50%", margin: "1mm auto" }}>
                {/* ความเห็นผู้บังคับบัญชา */}
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: "16pt",
                    textDecoration: "underline",
                    marginBottom: "2mm",
                    textAlign: "left",
                  }}
                >
                  ความเห็นของผู้บังคับบัญชา
                </div>

                {/* เส้นความเห็น */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "3mm",
                  }}
                >
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLUE,
                      width: "90%",
                      height: "5mm",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "3mm",
                  }}
                >
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLUE,
                      width: "90%",
                      height: "5mm",
                    }}
                  />
                </div>

                {/* ลงชื่อ */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "1mm",
                  }}
                >
                  ลงชื่อ {supervisorSig?.linePrefix || ""}
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLUE,
                      display: "inline-block",
                      minWidth: "60mm",
                    }}
                  />
                </div>

                {/* (ชื่อ) */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginLeft: "10mm",
                    marginBottom: "3mm",
                  }}
                >
                  {"("}
                  <span style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLACK,
                      display: "inline-block",
                      minWidth: "60mm",
                      textAlign: "center",
                    }}
                  >
                    {supervisorSig?.parenName || ""}
                  </span>
                  {")"}
                </div>

                {/* ตำแหน่ง */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "3mm",
                  }}
                >
                  ตำแหน่ง
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLACK,
                      display: "inline-block",
                      minWidth: "60mm",
                      textAlign: "center",
                    }}
                  >
                    {supervisorPosition}
                  </span>
                </div>

                {/* วันที่ */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  วันที่
                  <SignDateCells date={supervisorDate} widths={[10, 12, 16]} />
                </div>

                {/* คำสั่ง */}
                <div
                  style={{
                    marginTop: "6mm",
                    fontWeight: "bold",
                    fontSize: "16pt",
                    marginBottom: "2mm",
                    textDecoration: "underline",
                    textAlign: "left",
                  }}
                >
                  คำสั่ง
                </div>

                {/* ตัวเลือก */}
                <div
                  style={{
                    display: "flex",
                    gap: "8mm",
                    marginBottom: "3mm",
                    alignItems: "center",
                    justifyContent: "flex-start",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "1.5mm",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "3mm",
                        height: "3mm",
                        borderRadius: "50%",
                        border: "1px solid black",
                      }}
                    />
                    อนุญาต
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "1.5mm",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "3mm",
                        height: "3mm",
                        borderRadius: "50%",
                        border: "1px solid black",
                      }}
                    />
                    ไม่อนุญาต
                  </span>
                </div>

                {/* ลงชื่อ */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "1mm",
                  }}
                >
                  ลงชื่อ
                  <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginLeft: "2mm",
                    marginBottom: "3mm",
                    position: "relative",
                  }}
                ></div>
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLUE,
                      display: "inline-block",
                      minWidth: "55mm",
                      textAlign: "left",
                    }}
                  >
                    {directorSig.linePrefix}
                    </span>
                </div>

                {/* (ชื่อ) - ข้อความลอยบนเส้นประ */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginLeft: "10mm",
                    marginBottom: "3mm",
                    position: "relative",
                  }}
                >
                  <span style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLACK,
                      display: "inline-block",
                      minWidth: "55mm",
                      textAlign: "center",
                      position: "relative",
                    }}
                  >
                    ( {directorSig.parenName} )
                  </span>
                </div>

                {/* ตำแหน่ง - ข้อความลอยบนเส้นประ */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "3mm",
                  }}
                >
                  ตำแหน่ง
                  <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginLeft: "2mm",
                    marginBottom: "3mm",
                    position: "relative",
                  }}
                ></div>
                  <span
                    style={{
                      borderBottom: "0.5pt dotted black", color: INK_BLACK,
                      display: "inline-block",
                      minWidth: "55mm",
                      textAlign: "center",
                    }}
                  >
                    {directorPosition}
                  </span>
                </div>

                {/* วันที่ */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  วันที่
                  <SignDateCells date={directorDate} widths={[8, 12, 16]} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
