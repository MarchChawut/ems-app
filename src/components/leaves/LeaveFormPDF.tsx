"use client";

import React from "react";
import { getPageMargins, pdfPadding } from "@/components/forms/pageMargins";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  PDFDownloadLink,
  Image,
} from "@react-pdf/renderer";
import { Leave, LeaveType, User } from "@/types";
import { formatSignatureName } from "@/lib/utils";
import { INK_BLUE, INK_BLACK, formatSignDate } from "../forms/formPrintShared";
import { signaturePdfStyle, type PdfSignatureImage } from "../forms/signature";
import { SignDatePdf } from "../forms/signaturePdf";
import type { SignaturePlacement } from "@/types";
import { DEFAULT_ORG, directorTitle, directorShort, type OrgInfo } from "@/lib/org-settings";

// ลงทะเบียนฟอนต์ไทย (Sarabun จาก Google Fonts)
Font.register({
  family: "THSarabun",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/sarabun/v15/DtVjJx26TKEr37c9YL5rilwm.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YNpoulwm6gDX.ttf",
      fontWeight: "bold",
    },
  ],
});

// ปิด hyphenation สำหรับภาษาไทย
Font.registerHyphenationCallback((word) => [word]);

interface LeaveFormPDFProps {
  /** ชื่อสังกัด/ชื่อกองหลัก (ข้อมูลหน่วยงาน) — ไม่ระบุ = ค่าเริ่มต้น */
  org?: OrgInfo;
  leave: Leave & { user: User };
  userStats?: {
    pastCount: number;
    pastDays: number;
    currentCount: number;
    currentDays: number;
    totalCount: number;
    totalDays: number;
  };
  /** การลาครั้งก่อนหน้า (ประเภทเดียวกัน) สำหรับบรรทัด "ครั้งสุดท้ายตั้งแต่วันที่" */
  previousLeave?: (Leave & { user: User }) | null;
  /** ผู้อำนวยการกอง (role DIRECTOR) ที่ยัง active อยู่ - ใช้พิมพ์ชื่อ/ตำแหน่งล่วงหน้าในช่องลงนาม */
  director?: User | null;
  /** หัวหน้างานของเจ้าของใบลา (User.supervisorId) - ใช้พิมพ์ชื่อในช่อง "ความเห็นของผู้บังคับบัญชา" */
  supervisor?: User | null;
  /** ธุรการที่ตรวจสอบใบลา (Leave.adminReviewedBy) - ใช้พิมพ์ชื่อในช่อง "ลงชื่อผู้ตรวจสอบ" */
  reviewer?: User | null;
  /** ลายเซ็นผู้ลาที่วางไว้ (รูป data URL + ตำแหน่ง mm) - ไม่ระบุ = ไม่แสดง */
  signature?: { image: PdfSignatureImage; placement: SignaturePlacement } | null;
}

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

const thaiMonths = [
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

function formatThaiDate(date: Date | string) {
  const d = new Date(date);
  return {
    day: d.getDate().toString(),
    month: thaiMonths[d.getMonth()],
    // แปลงเป็น พ.ศ. อย่างปลอดภัย (ป้องกันบวก 543 ซ้ำ)
    year: (d.getFullYear() > 2500 ? d.getFullYear() : d.getFullYear() + 543).toString(),
  };
}

// สร้าง styles สำหรับ PDF
const styles = StyleSheet.create({
  page: {
    padding: pdfPadding(getPageMargins("LEAVE").pdf),
    fontFamily: "THSarabun",
    fontSize: 16,
    lineHeight: 1.2,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 5,
  },
  row: {
    flexDirection: "row",
    marginBottom: 2,
    alignItems: "flex-end",
  },
  rowCenter: {
    flexDirection: "row",
    marginBottom: 2,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  right: {
    textAlign: "right",
    fontSize: 16,
    marginBottom: 2,
  },
  rightRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    marginBottom: 2,
  },
  label: {
    fontSize: 16,
  },
  dottedLine: {
    borderBottom: "0.5 dotted black", color: INK_BLUE,
    minWidth: 30,
    textAlign: "center",
    paddingHorizontal: 3,
  },
  dottedLineLong: {
    borderBottom: "0.5 dotted black", color: INK_BLUE,
    flex: 1,
    textAlign: "center",
    paddingHorizontal: 3,
  },
  circle: {
    width: 8,
    height: 8,
    border: "0.5 solid black",
    borderRadius: 4,
    marginRight: 4,
  },
  circleFilled: {
    width: 8,
    height: 8,
    border: "0.5 solid black",
    borderRadius: 4,
    backgroundColor: "black",
    marginRight: 4,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  table: {
    width: "100%",
    border: "0.5 solid black",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5 solid black",
  },
  tableHeader: {
    border: "0.5 solid black",
    padding: 3,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "bold",
  },
  tableCell: {
    border: "0.5 solid black",
    padding: 3,
    textAlign: "center",
    fontSize: 14,
  },
  twoColumn: {
    flexDirection: "row",
    gap: 15,
    marginTop: 2,
    fontSize: 16,
  },
  leftColumn: {
    width: "50%",
    marginTop: 2,
  },
  rightColumn: {
    width: "50%",
    marginTop: 2,
  },
  sectionTitle: {
    fontWeight: "bold",
    textDecoration: "underline",
    marginBottom: 5,
    fontSize: 16,
    textAlign: "center",
  },
  sectionTitleLeft: {
    fontWeight: "bold",
    textDecoration: "underline",
    marginBottom: 5,
    fontSize: 16,
    textAlign: "left",
  },
  signSection: {
    marginTop: 8,
    alignItems: "center",
    fontSize: 14,
  },
  leftAlignRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 3,
  },
  fullLine: {
    borderBottom: "0.5 dotted black", color: INK_BLUE,
    height: 10,
    marginBottom: 5,
    width: "100%",
  },
});

// PDF Document Component
function LeaveDocument({ leave, userStats, previousLeave, director, supervisor, reviewer, signature, org = DEFAULT_ORG }: LeaveFormPDFProps) {
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
  const startDate = formatThaiDate(leave.startDate);
  const endDate = formatThaiDate(leave.endDate);
  // ข้อมูลการลาครั้งก่อน (ประเภทเดียวกัน) สำหรับบรรทัด "ครั้งสุดท้ายตั้งแต่วันที่"
  const prevLeaveDate = previousLeave ? formatThaiDate(previousLeave.startDate) : null;
  const prevLeaveEndDate = previousLeave ? formatThaiDate(previousLeave.endDate) : null;
  const prevLeaveIsHalfDay = previousLeave?.isHalfDay || previousLeave?.totalDays === 0.5;
  const prevLeaveUnit = prevLeaveIsHalfDay
    ? ""
    : previousLeave?.hours && previousLeave.hours > 0 ? "ชม." : "วัน";
  const prevLeaveDaysValue = previousLeave
    ? (prevLeaveIsHalfDay
        ? "ครึ่งวัน"
        : previousLeave.hours && previousLeave.hours > 0
          ? previousLeave.hours.toString()
          : previousLeave.totalDays.toString())
    : "";
  // ใช้วันที่ที่สร้างใบลา (createdAt) เพื่อให้เมื่อเปิดย้อนหลังยังเป็นวันที่เขียนจริง
  const documentDate = formatThaiDate(
    (leave as any).createdAt ? new Date((leave as any).createdAt) : new Date()
  );
  const leaveIsHalfDay = leave.isHalfDay || leave.totalDays === 0.5;
  // หน่วยที่แสดงหลัง leaveDays
  const leaveUnit = leaveIsHalfDay ? "" : (leave.hours && leave.hours > 0) ? "ชม." : "วัน";
  // ใช้ totalDays ที่บันทึกไว้แล้ว (คำนวณครั้งเดียวตอนสร้าง/แก้ไขรายการลา) แทนการคำนวณซ้ำ
  const leaveDays = leaveIsHalfDay
    ? "ครึ่งวัน"
    : (leave.hours && leave.hours > 0)
      ? leave.hours.toString()
      : leave.totalDays.toString();
  const currentDaysValue = leave.totalDays;

  // label หัวตาราง
  const tableUnit = leave.hours && leave.hours > 0 ? "ครั้ง/ชม." : "ครั้ง/วัน";

  // ค่าที่แสดงในช่อง "ลาครั้งนี้" — แสดง ชม. จริง
  const currentDaysDisplay = leave.hours && leave.hours > 0
    ? leave.hours
    : currentDaysValue;

  const leaveTypeLabel = leaveTypeLabels[leave.type];

  const stats = userStats || {
    pastCount: 0,
    pastDays: 0,
    currentCount: 1,
    currentDays: currentDaysValue,
    totalCount: 1,
    totalDays: currentDaysValue,
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* หัวเรื่อง */}
        <Text style={styles.title}>แบบใบลาป่วย ลาคลอดบุตร ลากิจ</Text>

        {/* เขียนที่ + วันที่ */}
        <View style={styles.right}>
          <View style={styles.rightRow}>
            <Text style={styles.label}>เขียนที่ </Text>
            <Text style={[styles.dottedLine, { minWidth: 200 }]}>
              {org.divisionName}
            </Text>
          </View>
          <View style={styles.rightRow}>
            <Text style={styles.label}>วันที่ </Text>
            <Text style={[styles.dottedLine, { minWidth: 25 }]}>
              {documentDate.day}
            </Text>
            <Text style={styles.label}> เดือน </Text>
            <Text style={[styles.dottedLine, { minWidth: 60 }]}>
              {documentDate.month}
            </Text>
            <Text style={styles.label}> พ.ศ. </Text>
            <Text style={[styles.dottedLine, { minWidth: 40 }]}>
              {documentDate.year}
            </Text>
          </View>
        </View>

        {/* เรื่อง + เรียน */}
        <View style={styles.row}>
          <Text style={styles.label}>เรื่อง </Text>
          <Text
            style={[
              styles.dottedLineLong,
              { textAlign: "left", paddingLeft: 3 },
            ]}
          >
            ขออนุญาต{leaveTypeLabel.full}
          </Text>
        </View>
        <View style={[styles.row, { marginBottom: 4 }]}>
          <Text style={styles.label}>เรียน </Text>
          <Text
            style={[
              styles.dottedLineLong,
              { textAlign: "left", paddingLeft: 3 },
            ]}
          >
            {directorTitle(org)}
          </Text>
        </View>

        {/* ข้าพเจ้า + ตำแหน่ง */}
        <View style={[styles.row, { paddingLeft: 28 }]}>
          <Text style={styles.label}>ข้าพเจ้า </Text>
          <Text style={[styles.dottedLineLong]}>{(leave.user as any).prefix}{leave.user.name}</Text>
          <Text style={styles.label}> ตำแหน่ง </Text>
          <Text style={[styles.dottedLineLong]}>
            {leave.user.position || ""}
          </Text>
        </View>

        {/* กอง + สังกัด */}
        <View style={[styles.row, { marginBottom: 4 }]}>
          <Text style={styles.label}>กอง </Text>
          <Text style={[styles.dottedLine, { minWidth: 160 }]}>
            {org.departmentName}
          </Text>
          <Text style={[styles.label, { marginLeft: 12 }]}> สังกัด </Text>
          <Text style={[styles.dottedLine, { minWidth: 160 }]}>
            {org.divisionName}
          </Text>
        </View>

        {/* ขอลา: ป่วย (บรรทัดแยก) */}
        <View style={[styles.row, { paddingLeft: 40 }]}>
          <View style={styles.checkboxRow}>
            <View
              style={
                leave.type === "SICK" ? styles.circleFilled : styles.circle
              }
            />
            <Text style={leave.type === "SICK" ? { fontWeight: "bold" } : {}}>
              ป่วย
            </Text>
          </View>
        </View>

        {/* ขอลา กิจ เนื่องจาก */}
        <View style={styles.row}>
          <Text style={styles.label}>ขอลา </Text>
          <View style={[styles.checkboxRow, { marginLeft: 40 }]}>
            <View
              style={
                leave.type === "PERSONAL" ? styles.circleFilled : styles.circle
              }
            />
            <Text
              style={leave.type === "PERSONAL" ? { fontWeight: "bold" } : {}}
            >
              กิจ
            </Text>
          </View>
          <Text style={styles.label}> เนื่องจาก </Text>
          <Text style={[styles.dottedLineLong]}>
            {leave.type === "PERSONAL" ? leave.reason : ""}
          </Text>
        </View>

        {/* คลอดบุตร + ออกก่อนเวลา (บรรทัดแยก) */}
        <View style={[styles.row, { paddingLeft: 40, marginBottom: 4 }]}>
          <View style={styles.checkboxRow}>
            <View
              style={
                leave.type === "MATERNITY" ? styles.circleFilled : styles.circle
              }
            />
            <Text
              style={leave.type === "MATERNITY" ? { fontWeight: "bold" } : {}}
            >
              คลอดบุตร
            </Text>
          </View>
          <View style={[styles.checkboxRow, { marginLeft: 12 }]}>
            <View
              style={
                leave.type === "EARLY_LEAVE" ? styles.circleFilled : styles.circle
              }
            />
            <Text
              style={leave.type === "EARLY_LEAVE" ? { fontWeight: "bold" } : {}}
            >
              ออกก่อนเวลา
            </Text>
          </View>
        </View>

        {/* ตั้งแต่วันที่...ถึงวันที่...มีกำหนด (บรรทัดเดียว) */}
        <View style={styles.row}>
          <Text style={styles.label}>ตั้งแต่วันที่ </Text>
          <Text style={[styles.dottedLine, { minWidth: 20 }]}>
            {startDate.day}
          </Text>
          <Text style={styles.label}> เดือน </Text>
          <Text style={[styles.dottedLine, { minWidth: 55 }]}>
            {startDate.month}
          </Text>
          <Text style={styles.label}> พ.ศ. </Text>
          <Text style={[styles.dottedLine, { minWidth: 30 }]}>
            {startDate.year}
          </Text>
          <Text style={styles.label}> ถึงวันที่ </Text>
          <Text style={[styles.dottedLine, { minWidth: 20 }]}>
            {endDate.day}
          </Text>
          <Text style={styles.label}> เดือน </Text>
          <Text style={[styles.dottedLine, { minWidth: 55 }]}>
            {endDate.month}
          </Text>
          <Text style={styles.label}> พ.ศ. </Text>
          <Text style={[styles.dottedLine, { minWidth: 30 }]}>
            {endDate.year}
          </Text>
          <Text style={styles.label}> มีกำหนด </Text>
          <Text
            style={[styles.dottedLine, { minWidth: 30, fontWeight: "bold" }]}
          >
            {leaveDays}
          </Text>
          <Text style={styles.label}> {leaveUnit} </Text>
        </View>

        {/* ข้าพเจ้าได้ลา + ครั้งสุดท้ายตั้งแต่วันที่ */}
        <View style={[styles.row, { marginTop: 3 }]}>
          <Text style={styles.label}>ข้าพเจ้าได้ลา </Text>
          <View style={styles.checkboxRow}>
            <View
              style={
                previousLeave?.type === "SICK" ? styles.circleFilled : styles.circle
              }
            />
            <Text style={previousLeave?.type === "SICK" ? { fontWeight: "bold" } : {}}>
              ป่วย
            </Text>
          </View>
          <View style={[styles.checkboxRow, { marginRight: 3 }]}>
            <View
              style={
                previousLeave?.type === "PERSONAL" ? styles.circleFilled : styles.circle
              }
            />
            <Text
              style={previousLeave?.type === "PERSONAL" ? { fontWeight: "bold" } : {}}
            >
              กิจ
            </Text>
          </View>
          <View style={styles.checkboxRow}>
            <View
              style={
                previousLeave?.type === "MATERNITY" ? styles.circleFilled : styles.circle
              }
            />
            <Text
              style={previousLeave?.type === "MATERNITY" ? { fontWeight: "bold" } : {}}
            >
              คลอดบุตร
            </Text>
          </View>
          <View style={[styles.checkboxRow, { marginRight: 3 }]}>
            <View
              style={
                previousLeave?.type === "EARLY_LEAVE" ? styles.circleFilled : styles.circle
              }
            />
            <Text
              style={previousLeave?.type === "EARLY_LEAVE" ? { fontWeight: "bold" } : {}}
            >
              ออกก่อนเวลา
            </Text>
          </View>
          <Text style={styles.label}> ครั้งสุดท้ายตั้งแต่วันที่ </Text>
          <Text style={[styles.dottedLine, { minWidth: 20 }]}>
            {prevLeaveDate?.day || ""}
          </Text>
          <Text style={styles.label}> เดือน </Text>
          <Text style={[styles.dottedLine, { minWidth: 55 }]}>
            {prevLeaveDate?.month || ""}
          </Text>
          <Text style={styles.label}> พ.ศ. </Text>
          <Text style={[styles.dottedLine, { minWidth: 30 }]}>
            {prevLeaveDate?.year || ""}
          </Text>
        </View>

        {/* ถึงวันที่ + มีกำหนด + ในระหว่างลา */}
        <View style={styles.row}>
          <Text style={styles.label}>ถึงวันที่ </Text>
          <Text style={[styles.dottedLine, { minWidth: 20 }]}>
            {prevLeaveEndDate?.day || ""}
          </Text>
          <Text style={styles.label}> เดือน </Text>
          <Text style={[styles.dottedLine, { minWidth: 55 }]}>
            {prevLeaveEndDate?.month || ""}
          </Text>
          <Text style={styles.label}> พ.ศ. </Text>
          <Text style={[styles.dottedLine, { minWidth: 30 }]}>
            {prevLeaveEndDate?.year || ""}
          </Text>
          <Text style={styles.label}> มีกำหนด </Text>
          <Text
            style={[styles.dottedLine, { minWidth: 30, fontWeight: "bold" }]}
          >
            {prevLeaveDaysValue}
          </Text>
          <Text style={styles.label}>
            {" "}{previousLeave ? prevLeaveUnit : ""}{" "}
            ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่{" "}
          </Text>
          <Text style={[styles.dottedLine, { minWidth: 35 }]}>
            {(leave as any).contactAddress || (leave.user as any).address || " "}
          </Text>
        </View>

        {/* ...หมายเลขโทรศัพท์ */}
        <View style={[styles.row, { marginBottom: 1 }]}>
          <Text style={[styles.dottedLineLong]}>
            {" "}
          </Text>
          <Text style={styles.label}> หมายเลขโทรศัพท์ </Text>
          <Text style={[styles.dottedLine, { minWidth: 100 }]}>
            {(leave.user as any).phone || " "}
          </Text>
        </View>

        {/* ลงชื่อผู้ลา */}
        {(() => {
          const sig = formatSignatureName(
            (leave.user as any).prefix,
            leave.user.name
          );
          return (
            <View style={[styles.signSection, { position: "relative" }]}>
              {signature ? (
                <Image
                  src={signature.image.dataUrl}
                  style={signaturePdfStyle(signature.placement, signature.image.aspect)}
                />
              ) : null}
              <View style={styles.rowCenter}>
                <Text style={styles.label}>ลงชื่อ </Text>
                {sig.linePrefix ? (
                  <Text style={styles.label}>{sig.linePrefix} </Text>
                ) : null}
                <Text
                  style={[
                    styles.dottedLine,
                    { minWidth: 140, textAlign: "center" },
                  ]}
                >
                  {" "}
                </Text>
              </View>
              <View style={[styles.rowCenter, { marginLeft: 20 }]}>
                <Text>( </Text>
                <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 130 }]}>
                  {sig.parenName}
                </Text>
                <Text> )</Text>
              </View>
            </View>
          );
        })()}

        {/* สถิติ + ความเห็น (2 คอลัมน์) */}
        <View style={styles.twoColumn}>
          {/* ฝั่งซ้าย - สถิติ */}
          <View style={styles.leftColumn}>
            <Text style={styles.sectionTitle}>สถิติการลาในปีงบประมาณนี้</Text>

            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableHeader, { width: "25%" }]}>
                  ประเภทลา
                </Text>
                <Text style={[styles.tableHeader, { width: "25%" }]}>
                  ลามาแล้ว{"\n"}ครั้ง/วัน
                </Text>
                <Text style={[styles.tableHeader, { width: "25%" }]}>
                  ลาครั้งนี้{"\n"}{tableUnit}
                </Text>
                <Text style={[styles.tableHeader, { width: "25%" }]}>
                  รวมเป็น{"\n"}{tableUnit}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>ป่วย</Text>
                <Text style={styles.tableCell}>
                  {leave.type === "SICK"
                    ? `${stats.pastCount}/${stats.pastDays}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "SICK"
                    ? `${stats.currentCount}/${currentDaysDisplay}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "SICK"
                    ? `${stats.totalCount}/${stats.totalDays}`
                    : ""}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>กิจ</Text>
                <Text style={styles.tableCell}>
                  {leave.type === "PERSONAL"
                    ? `${stats.pastCount}/${stats.pastDays}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "PERSONAL"
                    ? `${stats.currentCount}/${currentDaysDisplay}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "PERSONAL"
                    ? `${stats.totalCount}/${stats.totalDays}`
                    : ""}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>คลอดบุตร</Text>
                <Text style={styles.tableCell}>
                  {leave.type === "MATERNITY"
                    ? `${stats.pastCount}/${stats.pastDays}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "MATERNITY"
                    ? `${stats.currentCount}/${currentDaysDisplay}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "MATERNITY"
                    ? `${stats.totalCount}/${stats.totalDays}`
                    : ""}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCell, { fontSize: 12 }]}>ออกก่อนเวลา</Text>
                <Text style={styles.tableCell}>
                  {leave.type === "EARLY_LEAVE"
                    ? `${stats.pastCount}/${stats.pastDays}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "EARLY_LEAVE"
                    ? `${stats.currentCount}/${currentDaysDisplay}`
                    : ""}
                </Text>
                <Text style={styles.tableCell}>
                  {leave.type === "EARLY_LEAVE"
                    ? `${stats.totalCount}/${stats.totalDays}`
                    : ""}
                </Text>
              </View>
            </View>

            {/* ลงชื่อผู้ตรวจสอบ */}
            <View style={{ marginTop: 12 }}>
              <View style={styles.rowCenter}>
                <Text style={styles.label}>ลงชื่อ </Text>
                <Text style={[styles.dottedLine, { minWidth: 130 }]}> </Text>
                <Text style={styles.label}> ผู้ตรวจสอบ</Text>
              </View>
              <View style={[styles.rowCenter, { paddingLeft: 20 }]}>
                <Text>( </Text>
                {reviewerSig ? (
                  <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 130, textAlign: "center" }]}>
                    {reviewerSig.parenName}
                  </Text>
                ) : (
                  <Text style={[styles.dottedLine, { minWidth: 130 }]}> </Text>
                )}
                <Text> )</Text>
              </View>
              <View style={[styles.rowCenter, { marginBottom: 8 }]}>
                <Text style={styles.label}>ตำแหน่ง </Text>
                {reviewerPosition ? (
                  <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 145, textAlign: "center" }]}>
                    {reviewerPosition}
                  </Text>
                ) : (
                  <Text style={[styles.dottedLine, { minWidth: 145 }]}> </Text>
                )}
              </View>
              <View style={styles.rowCenter}>
                <Text style={styles.label}>วันที่ </Text>
                <SignDatePdf date={reviewDate} widths={[20, 30, 40]} />
              </View>
            </View>
          </View>

          {/* ฝั่งขวา - ความเห็น + คำสั่ง */}
          <View style={styles.rightColumn}>
            {/* ความเห็นของผู้บังคับบัญชา */}
            <Text style={styles.sectionTitleLeft}>
              ความเห็นของผู้บังคับบัญชา
            </Text>

            {/* เส้นความเห็น */}
            <View style={styles.fullLine} />
            <View style={styles.fullLine} />

            {/* ลงชื่อ */}
            <View style={[styles.leftAlignRow, { justifyContent: "center" }]}>
              <Text>ลงชื่อ {supervisorSig?.linePrefix || ""}</Text>
              <Text style={[styles.dottedLine, { minWidth: 155 }]} />
            </View>

            <View style={[styles.leftAlignRow, { justifyContent: "center" }]}>
              <Text>( </Text>
              {supervisorSig ? (
                <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 155, textAlign: "center" }]}>
                  {supervisorSig.parenName}
                </Text>
              ) : (
                <Text style={[styles.dottedLine, { minWidth: 155 }]} />
              )}
              <Text> )</Text>
            </View>

            <View
              style={[
                styles.leftAlignRow,
                { justifyContent: "center", marginBottom: 5 },
              ]}
            >
              <Text>ตำแหน่ง </Text>
              {supervisorPosition ? (
                <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 155, textAlign: "center" }]}>
                  {supervisorPosition}
                </Text>
              ) : (
                <Text style={[styles.dottedLine, { minWidth: 155 }]} />
              )}
            </View>

            <View
              style={[
                styles.leftAlignRow,
                { justifyContent: "center", marginBottom: 12 },
              ]}
            >
              <Text>วันที่ </Text>
              <SignDatePdf date={supervisorDate} widths={[20, 30, 40]} />
            </View>

            {/* คำสั่ง */}
            <Text style={styles.sectionTitleLeft}>คำสั่ง</Text>

            {/* อนุญาต / ไม่อนุญาต */}
            <View style={[styles.leftAlignRow, { gap: 20, marginBottom: 5 }]}>
              <View style={styles.checkboxRow}>
                <View style={styles.circle} />
                <Text>อนุญาต</Text>
              </View>
              <View style={styles.checkboxRow}>
                <View style={styles.circle} />
                <Text>ไม่อนุญาต</Text>
              </View>
            </View>

            {/* ลงชื่อ */}
            <View style={[styles.leftAlignRow, { justifyContent: "center" }]}>
              <Text>ลงชื่อ {directorSig.linePrefix}</Text>
              <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 155 }]} />
            </View>

            {/* (ชื่อ) ลอยบนเส้นประ */}
            <View style={[styles.leftAlignRow, { justifyContent: "center" }]}>
              <Text
                style={[
                  styles.dottedLine,
                  { minWidth: 155, textAlign: "center" },
                ]}
              >
                ( {directorSig.parenName} )
              </Text>
            </View>

            {/* ตำแหน่ง ลอยบนเส้นประ */}
            <View style={[styles.leftAlignRow, { justifyContent: "center", marginBottom: 5 }]}>
              <Text
                style={[
                  styles.dottedLine, { color: INK_BLACK },
                  { minWidth: 155, textAlign: "center" },
                ]}
              >
                ตำแหน่ง {directorPosition}
              </Text>
            </View>

            <View style={[styles.leftAlignRow, { justifyContent: "center" }]}>
              <Text>วันที่ </Text>
              <SignDatePdf date={directorDate} widths={[20, 30, 40]} />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ฟังก์ชันสร้าง PDF Blob
export async function generateLeavePDF(
  leave: Leave & { user: User },
  userStats?: LeaveFormPDFProps["userStats"],
  director?: User | null,
  previousLeave?: LeaveFormPDFProps["previousLeave"],
  supervisor?: User | null,
  reviewer?: User | null,
  signature?: LeaveFormPDFProps["signature"],
  org?: OrgInfo,
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("generateLeavePDF can only be called on the client side");
  }
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(
    <LeaveDocument leave={leave} userStats={userStats} director={director} previousLeave={previousLeave} supervisor={supervisor} reviewer={reviewer} signature={signature} org={org} />,
  ).toBlob();
  return blob;
}

// Component สำหรับดาวน์โหลด PDF
export function LeavePDFDownloadLink({
  leave,
  userStats,
  previousLeave,
  director,
  supervisor,
  reviewer,
  signature,
  org,
  children,
}: LeaveFormPDFProps & { children: React.ReactNode }) {
  return (
    <PDFDownloadLink
      document={<LeaveDocument leave={leave} userStats={userStats} director={director} previousLeave={previousLeave} supervisor={supervisor} reviewer={reviewer} signature={signature} org={org} />}
      fileName={`leave_form_${leave.user.username}_${new Date().toISOString().split("T")[0]}.pdf`}
      style={{ textDecoration: "none" }}
    >
      {children}
    </PDFDownloadLink>
  );
}

export { LeaveDocument };
