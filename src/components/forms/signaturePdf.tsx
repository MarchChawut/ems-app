/**
 * ==================================================
 * signaturePdf - ส่วนประกอบของบล็อกลงชื่อสำหรับ react-pdf
 * ==================================================
 * SignDatePdf เป็นคู่ของ SignDateCells (HTML): ช่องวันที่ลงนามแบบย่อ 8 / พ.ย. / 69 สีดำบนเส้นจุดไข่ปลา
 * ไฟล์นี้ import @react-pdf/renderer จึงต้องถูกโหลดผ่านโมดูล PDF (ที่เป็น dynamic import อยู่แล้ว) เท่านั้น
 */

import React from "react";
import { Text } from "@react-pdf/renderer";
import { INK_BLACK, type SignDate } from "./formPrintShared";

interface SignDatePdfProps {
  date: SignDate | null;
  /** ความกว้างขั้นต่ำของช่องวัน/เดือน/ปี หน่วย pt */
  widths: [number, number, number];
  variant?: "slash" | "labelled";
}

const cell = (minWidth: number) => ({
  borderBottom: "0.5 dotted black",
  color: INK_BLACK,
  textAlign: "center" as const,
  paddingHorizontal: 3,
  minWidth,
});

export function SignDatePdf({ date, widths, variant = "slash" }: SignDatePdfProps) {
  const [wDay, wMonth, wYear] = widths;
  const month = variant === "labelled" ? " เดือน " : " / ";
  const year = variant === "labelled" ? " พ.ศ. " : " / ";
  return (
    <>
      <Text style={cell(wDay)}>{date?.day}</Text>
      <Text>{month}</Text>
      <Text style={cell(wMonth)}>{date?.month}</Text>
      <Text>{year}</Text>
      <Text style={cell(wYear)}>{date?.year}</Text>
    </>
  );
}
