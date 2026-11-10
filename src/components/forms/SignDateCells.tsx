/**
 * ==================================================
 * SignDateCells - ช่อง "วันที่ลงนาม" ในบล็อกลงชื่อ (HTML สำหรับหน้าพิมพ์)
 * ==================================================
 * แสดงวันที่แบบย่อ เช่น 8 / พ.ย. / 69 บนเส้นจุดไข่ปลา สีดำ (ไม่ใช่สีหมึกปากกา เพราะเป็นข้อมูลที่ระบบเติมให้)
 * - slash:    [วัน] / [เดือน] / [ปี]            (label "วันที่" อยู่นอก component)
 * - labelled: วันที่ [วัน] เดือน [เดือน] พ.ศ. [ปี]  (label อยู่ใน component)
 * date = null (ขั้นนั้นยังไม่เกิด) → เว้นช่องว่างไว้ให้เซ็น/เขียนเอง
 * ใช้ร่วมกันใน LeaveForm / LateArrivalForm / EarlyLeaveForm / FormRequestPrintModal แทนโค้ดที่เคยเขียนซ้ำทีละจุด
 * PDF ใช้ SignDatePdf ใน ./signaturePdf
 */

import React from "react";
import { INK_BLACK, type SignDate } from "./formPrintShared";

interface SignDateCellsProps {
  date: SignDate | null;
  /** ความกว้างขั้นต่ำของช่องวัน/เดือน/ปี หน่วย mm */
  widths: [number, number, number];
  variant?: "slash" | "labelled";
  /** ระยะห่างซ้ายของช่องแรก (เช่น "2mm") */
  firstMarginLeft?: string;
}

const cellStyle = (minWidthMm: number, marginLeft?: string): React.CSSProperties => ({
  borderBottom: "0.5pt dotted black",
  color: INK_BLACK,
  display: "inline-block",
  minWidth: `${minWidthMm}mm`,
  textAlign: "center",
  ...(marginLeft ? { marginLeft } : {}),
});

export default function SignDateCells({ date, widths, variant = "slash", firstMarginLeft }: SignDateCellsProps) {
  const [wDay, wMonth, wYear] = widths;
  if (variant === "labelled") {
    return (
      <>
        วันที่<span style={cellStyle(wDay, firstMarginLeft)}>{date?.day}</span>
        เดือน<span style={cellStyle(wMonth)}>{date?.month}</span>
        พ.ศ.<span style={cellStyle(wYear)}>{date?.year}</span>
      </>
    );
  }
  return (
    <>
      <span style={cellStyle(wDay, firstMarginLeft)}>{date?.day}</span>/
      <span style={cellStyle(wMonth)}>{date?.month}</span>/
      <span style={cellStyle(wYear)}>{date?.year}</span>
    </>
  );
}
