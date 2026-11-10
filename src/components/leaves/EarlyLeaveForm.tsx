/**
 * ==================================================
 * Early Leave Form Component - แบบขอออกก่อนเวลาปฏิบัติราชการ
 * ==================================================
 * แบบฟอร์มเฉพาะประเภทการลา "ออกก่อนเวลา" (EARLY_LEAVE) แยกจากแบบใบลาป่วย/คลอดบุตร/กิจ
 * มิเรอร์โครงสร้างจาก LateArrivalForm.tsx (ดูไฟล์นั้นประกอบ)
 */

"use client";

import React, { useRef } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { directorTitle } from "@/lib/org-settings";
import { getPageMargins, cssPadding } from "@/components/forms/pageMargins";
import { Printer, X } from "lucide-react";
import { Leave, User } from "@/types";
import { formatSignatureName } from "@/lib/utils";
import { getFiscalYearRange } from "@/lib/leave-calc";
import { escapeHtml } from "@/components/forms/formPrintShared";
import { INK_BLUE } from "../forms/formPrintShared";
import SignDateCells from "../forms/SignDateCells";
import { useSignatureControl, SignatureMark, SignatureToolbar } from "../forms/signature";
import { getPrintableHtml, printWhenReady, INK_BLACK, formatSignDate } from "../forms/formPrintShared";
import type { SignaturePlacement } from "@/types";

interface EarlyLeaveFormProps {
  leave: Leave & { user: User };
  userLeaves?: Leave[];
  /** ผู้อำนวยการกอง (role DIRECTOR) ที่ยัง active อยู่ - ใช้พิมพ์ชื่อ/ตำแหน่งล่วงหน้าในช่องลงนาม */
  director?: User | null;
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

interface EarlyLeaveStats {
  approvedPast: number;
  approvedTotal: number;
  earlyLeavePast: number;
  earlyLeaveTotal: number;
}

const thaiMonths = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatThaiDate(date: Date | string): { day: string; month: string; year: string } {
  const d = new Date(date);
  const day = d.getDate().toString();
  const month = thaiMonths[d.getMonth()];
  const rawYear = d.getFullYear();
  const year = (rawYear > 2500 ? rawYear : rawYear + 543).toString();
  return { day, month, year };
}

// ตัด prefix ที่ระบบแนบไว้ในเหตุผลอัตโนมัติ (ครึ่งวัน/ชม./เวลาออก-เวลากลับ) ออกก่อนแสดงผล
const REASON_PREFIX_RE =
  /^\[(ครึ่งวันเช้า|ครึ่งวันบ่าย|ลา [\d.]+ ชม\.|เวลาออก \d{2}:\d{2} - เวลากลับ \d{2}:\d{2})\]\s*/;

export default function EarlyLeaveForm({
  leave,
  userLeaves = [],
  director = null,
  reviewer = null,
  onClose,
  canPlaceSignature = false,
  canHideSignature = false,
  onSignatureSaved,
}: EarlyLeaveFormProps) {
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

  // สถิติ "อนุมัติแล้ว" / "ออกก่อนเวลา" (ยังไม่อนุมัติ/ไม่อนุมัติ) ของคำขอ EARLY_LEAVE ในปีงบประมาณเดียวกัน
  // ทุกรายการนับอยู่ในกลุ่มใดกลุ่มหนึ่งเสมอ - APPROVED ถือว่าอนุมัติแล้ว นอกนั้นทุกสถานะ (รวมสถานะระหว่างขั้นตอนอนุมัติ) ยังนับเป็นออกก่อนเวลา - นับจำนวนครั้ง ไม่ใช่ชั่วโมง
  const fiscalRange = getFiscalYearRange(new Date(leave.startDate));
  const computeStatusCount = (isApprovedBucket: boolean): { past: number; total: number } => {
    const matches = (status: Leave["status"]) =>
      isApprovedBucket ? status === "APPROVED" : status !== "APPROVED";
    const past = userLeaves.filter(
      (l) =>
        l.id !== leave.id &&
        l.type === "EARLY_LEAVE" &&
        new Date(l.startDate) >= fiscalRange.start &&
        new Date(l.startDate) <= fiscalRange.end &&
        matches(l.status)
    ).length;
    const current = leave.type === "EARLY_LEAVE" && matches(leave.status) ? 1 : 0;
    return { past, total: past + current };
  };
  const approved = computeStatusCount(true);
  const earlyLeave = computeStatusCount(false);
  const stats: EarlyLeaveStats = {
    approvedPast: approved.past,
    approvedTotal: approved.total,
    earlyLeavePast: earlyLeave.past,
    earlyLeaveTotal: earlyLeave.total,
  };

  const documentDate = formatThaiDate(
    (leave as any).createdAt ? new Date((leave as any).createdAt) : new Date()
  );
  const requestDate = formatThaiDate(leave.startDate);
  const reason = (leave.reason || "").replace(REASON_PREFIX_RE, "");
  const sig = formatSignatureName((leave.user as any).prefix, leave.user.name);
  const directorSig = director
    ? formatSignatureName(director.prefix, director.name)
    // ยังไม่มีผู้อำนวยการกอง (role DIRECTOR) ที่ active — เว้นช่องลงนามว่างให้เซ็นมือ (ไม่ฝังชื่อบุคคลไว้ในโค้ด)
    : { linePrefix: '', parenName: '' };
  const directorPosition = director?.position || directorTitle(org);
  // วันที่ลงนามของแต่ละขั้น = เวลาที่ขั้นนั้นดำเนินการจริง (ยังไม่ถึงขั้น = ว่าง)
  const supervisorDate = formatSignDate(leave.supervisorApprovedAt);
  const directorDate = formatSignDate(leave.approvedAt);
  const reviewerSig = reviewer ? formatSignatureName(reviewer.prefix, reviewer.name) : null;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>แบบขอออกก่อนเวลาปฏิบัติราชการ - ${escapeHtml(((leave.user as any).prefix || "") + leave.user.name)}</title>
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
            padding: ${cssPadding(getPageMargins("EARLY_LEAVE").print)};
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

  const dotted = (minWidth: string, ink: string = INK_BLUE): React.CSSProperties => ({
    borderBottom: "0.5pt dotted black", color: ink,
    display: "inline-block",
    minWidth,
    textAlign: "center",
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">
          แบบขอออกก่อนเวลาปฏิบัติราชการ (พิมพ์)
          </h2>
          <div className="flex gap-2">
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
              padding: cssPadding(getPageMargins("EARLY_LEAVE").print),
              boxSizing: "border-box",
              fontFamily: "THSarabun",
              fontSize: "16pt",
              lineHeight: 1.2,
            }}
          >
            {/* ส่วนหัว */}
            <div style={{ textAlign: "center", marginBottom: "8mm" }}>
              <div style={{ fontSize: "18pt", fontWeight: "bold" }}>
                แบบขอออกก่อนเวลาปฏิบัติราชการ
              </div>
            </div>

            {/* เขียนที่ + วันที่ */}
            <div style={{ textAlign: "right", fontSize: "16pt", marginBottom: "8mm" }}>
              <div style={{ marginBottom: "1mm" }}>
                เขียนที่
                <span style={dotted("60mm")}>{org.divisionName}</span>
              </div>
              <div>
                วันที่<span style={dotted("10mm")}>{documentDate.day}</span>
                เดือน<span style={dotted("24mm")}>{documentDate.month}</span>
                พ.ศ.<span style={dotted("15mm")}>{documentDate.year}</span>
              </div>
            </div>

            {/* เรื่อง + เรียน */}
            <div style={{ fontSize: "16pt" }}>
              <div style={{ display: "flex", marginBottom: "1mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>เรื่อง</span>
                <span style={{ ...dotted("auto"), flex: 1, marginLeft: "2mm", paddingLeft: "1mm", textAlign: "left" }}>
                  ขออนุญาตออกจากที่ทำงานก่อนเวลาราชการ
                </span>
              </div>
              <div style={{ display: "flex", marginBottom: "2mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>เรียน</span>
                <span style={{ ...dotted("auto"), flex: 1, marginLeft: "2mm", paddingLeft: "1mm", textAlign: "left" }}>
                  {directorTitle(org)}
                </span>
              </div>

              {/* ข้าพเจ้า + ตำแหน่ง */}
              <div style={{ display: "flex", paddingLeft: "10mm", marginBottom: "1mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>ข้าพเจ้า</span>
                <span style={{ ...dotted("auto"), flex: 1, marginLeft: "1mm" }}>
                  {leave.user.prefix}{leave.user.name}
                </span>
                <span style={{ whiteSpace: "nowrap", marginLeft: "1mm" }}>ตำแหน่ง</span>
                <span style={{ ...dotted("auto"), flex: 1, marginLeft: "1mm" }}>
                  {leave.user.position || ""}
                </span>
              </div>

              {/* ฝ่าย + แผนก */}
              <div style={{ marginBottom: "2mm" }}>
                <span>ฝ่าย</span>
                <span style={dotted("60mm")}>.</span>
                <span style={{ marginLeft: "5mm" }}>แผนก</span>
                <span style={dotted("80mm")}>{leave.user.department || ""}</span>
              </div>

              {/* ขออนุญาตออกก่อนเวลาของวันที่ */}
              <div style={{ marginBottom: "1mm" }}>
                {org.departmentName} ศูนย์เทคโนโลยีดิจิทัล ขออนุญาตออกจากที่ทำงานก่อนเวลาราชการของวันที่
                <span style={dotted("36mm")}>
                  {requestDate.day} {requestDate.month} {requestDate.year}
                </span>
                <span style={{ marginLeft: "3mm" }}>ตั้งแต่เวลา</span>
                <span style={dotted("20mm")}>{leave.outTime || ""}</span>
                <span style={{ marginLeft: "1mm" }}>น. เป็นต้นไป (เวลาราชการสิ้นสุดเวลา</span>
                <span style={dotted("20mm")}>{leave.backTime || ""}</span>
                {" น.)"}
              </div>

              {/* เนื่องจาก */}
              <div style={{ display: "flex", marginBottom: "3mm" }}>
                <span style={{ whiteSpace: "nowrap" }}>เนื่องจาก</span>
                <span style={{ ...dotted("auto"), flex: 1, marginLeft: "2mm" }}>{reason}</span>
              </div>

              <div style={{ marginBottom: "3mm" }}>
                ทั้งนี้ ข้าพเจ้าขอออกก่อนเวลาราชการตั้งแต่เวลา 14.30 น. เป็นต้นไปเท่านั้น
              </div>

              <div style={{ display: "flex", paddingLeft: "10mm", marginBottom: "10mm" }}>จึงเรียนมาเพื่อโปรดพิจารณา</div>

              {/* ลงชื่อผู้ขอ */}
              <div style={{ position: "relative" }}>
                <SignatureMark ctl={sigCtl} anchorLeft="107mm" anchorTop="4mm" />
                <div style={{ display: "flex", paddingLeft: "70mm", marginBottom: "1mm" }}>
                  ลงชื่อ
                  <span style={dotted("55mm")}>{sig.linePrefix || ""}</span>
                </div>
                <div style={{ display: "flex", paddingLeft: "77mm", marginBottom: "10mm" }}>
                  (<span style={dotted("55mm", INK_BLACK)}>{sig.parenName}</span>)
                </div>
              </div>

              {/* เรียน ผู้อำนวยการกอง */}
              <div style={{ marginBottom: "6mm" }}>
                <div>เรียน ผู้อำนวยการกอง</div>
                <div style={{ marginTop: "2mm", display: "flex", paddingLeft: "9mm", marginBottom: "8mm" }}>เพื่อโปรดพิจารณาอนุญาต</div>
                <div style={{ display: "flex", paddingLeft: "10mm", marginBottom: "1mm" }}>
                  (<span style={dotted("60mm")}> </span>)
                </div>
                <div style={{ display: "flex", marginBottom: "1mm" }}>
                  ตำแหน่ง<span style={dotted("60mm")}> </span>
                </div>
                <div style={{ display: "flex", marginBottom: "1mm" }}>
                  <SignDateCells variant="labelled" date={supervisorDate} widths={[10, 25, 15]} />
                </div>
              </div>

              {/* สถิติ + คำสั่ง (2 คอลัมน์) */}
              <div style={{ display: "flex", gap: "6mm" }}>
                <div style={{ width: "55%" }}>
                  <div style={{ fontWeight: "bold", textDecoration: "underline", textAlign: "center", marginBottom: "2mm" }}>
                    สถิติในปีงบประมาณนี้
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13pt", marginBottom: "5mm" }}>
                    <thead>
                      <tr>
                        <th style={{ border: "0.5pt solid black", padding: "1mm" }}>ประเภท</th>
                        <th style={{ border: "0.5pt solid black", padding: "1mm" }}>ที่ผ่านมา<br />(ครั้ง)</th>
                        <th style={{ border: "0.5pt solid black", padding: "1mm" }}>รวมครั้งนี้<br />(ครั้ง)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ border: "0.5pt solid black", padding: "1mm", textAlign: "center" }}>อนุมัติแล้ว</td>
                        <td style={{ border: "0.5pt solid black", padding: "1mm", textAlign: "center" }}>{stats.approvedPast}</td>
                        <td style={{ border: "0.5pt solid black", padding: "1mm", textAlign: "center" }}>{stats.approvedTotal}</td>
                      </tr>
                      <tr>
                        <td style={{ border: "0.5pt solid black", padding: "1mm", textAlign: "center" }}>ออกก่อนเวลา</td>
                        <td style={{ border: "0.5pt solid black", padding: "1mm", textAlign: "center" }}>{stats.earlyLeavePast}</td>
                        <td style={{ border: "0.5pt solid black", padding: "1mm", textAlign: "center" }}>{stats.earlyLeaveTotal}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div>
                    <div style={{ marginTop: "2mm", display: "flex", paddingLeft: "5mm", marginBottom: "1mm" }}>
                      ลงชื่อ {reviewerSig?.linePrefix || ""}<span style={dotted("50mm")}> </span> ผู้ตรวจสอบ
                    </div>
                    <div style={{ marginTop: "2mm", display: "flex", paddingLeft: "12mm", marginBottom: "1mm" }}>
                      (<span style={dotted("50mm", INK_BLACK)}>{reviewerSig?.parenName || ""}</span>)
                    </div>
                  </div>
                </div>

                <div style={{ width: "45%", textAlign: "center" }}>
                  <div style={{ marginTop: "12mm", display: "flex", justifyContent: "center", gap: "8mm", marginBottom: "8mm" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "1mm" }}>
                      <span style={{ display: "inline-block", width: "3mm", height: "3mm", borderRadius: "50%", border: "1px solid black" }} />
                      อนุญาต
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "1mm" }}>
                      <span style={{ display: "inline-block", width: "3mm", height: "3mm", borderRadius: "50%", border: "1px solid black" }} />
                      ไม่อนุญาต
                    </span>
                  </div>
                  <div style={{ marginTop: "2mm", display: "flex", paddingLeft: "10mm", marginBottom: "1mm" }}>{directorSig.linePrefix}</div>
                  <div style={{display: "flex", paddingLeft: "6mm", marginBottom: "1mm"}}>
                    (<span style={dotted("55mm", INK_BLACK)}>{directorSig.parenName}</span>)
                  </div>
                  <div style={{display: "flex", paddingLeft: "3mm", marginBottom: "1mm"}}>
                    <span style={dotted("55mm", INK_BLACK)}>{directorPosition}</span>
                  </div>
                  <div style={{ marginTop: "1mm" }}>
                    <SignDateCells variant="labelled" date={directorDate} widths={[10, 24, 13]} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
