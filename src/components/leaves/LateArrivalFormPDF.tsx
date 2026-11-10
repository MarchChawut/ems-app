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
} from "@react-pdf/renderer";
import { Leave, User } from "@/types";
import { formatSignatureName } from "@/lib/utils";
import { INK_BLUE, INK_BLACK, formatSignDate } from "../forms/formPrintShared";
import { SignDatePdf } from "../forms/signaturePdf";
import { DEFAULT_ORG, directorTitle, type OrgInfo } from "@/lib/org-settings";

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

export interface LateArrivalStats {
  exemptPast: number;
  exemptTotal: number;
  latePast: number;
  lateTotal: number;
}

interface LateArrivalFormPDFProps {
  /** ชื่อสังกัด/ชื่อกองหลัก (ข้อมูลหน่วยงาน) — ไม่ระบุ = ค่าเริ่มต้น */
  org?: OrgInfo;
  leave: Leave & { user: User };
  stats?: LateArrivalStats;
  /** ผู้อำนวยการกอง (role DIRECTOR) ที่ยัง active อยู่ - ใช้พิมพ์ชื่อ/ตำแหน่งล่วงหน้าในช่องลงนาม */
  director?: User | null;
  /** ธุรการที่ตรวจสอบใบลา (Leave.adminReviewedBy) - ใช้พิมพ์ชื่อในช่อง "ผู้ตรวจสอบ" */
  reviewer?: User | null;
}

// ตัด prefix ที่ระบบแนบไว้ในเหตุผลอัตโนมัติ (ครึ่งวัน/ชม./เวลาออก-เวลากลับ) ออกก่อนแสดงผล
const REASON_PREFIX_RE =
  /^\[(ครึ่งวันเช้า|ครึ่งวันบ่าย|ลา [\d.]+ ชม\.|เวลาออก \d{2}:\d{2} - เวลากลับ \d{2}:\d{2})\]\s*/;

const thaiMonths = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatThaiDate(date: Date | string) {
  const d = new Date(date);
  return {
    day: d.getDate().toString(),
    month: thaiMonths[d.getMonth()],
    year: (d.getFullYear() > 2500 ? d.getFullYear() : d.getFullYear() + 543).toString(),
  };
}

// สร้าง styles สำหรับ PDF (สไตล์เดียวกับ LeaveFormPDF.tsx เพื่อความสม่ำเสมอ)
const styles = StyleSheet.create({
  page: {
    padding: pdfPadding(getPageMargins("LATE_ARRIVAL").pdf),
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
});

// PDF Document Component
function LateArrivalDocument({ leave, stats, director, reviewer, org = DEFAULT_ORG }: LateArrivalFormPDFProps) {
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

  const s = stats || { exemptPast: 0, exemptTotal: 0, latePast: 0, lateTotal: 0 };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>แบบขอลงเวลามาปฏิบัติราชการหลังเวลา 08.30 น.</Text>

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
            <Text style={[styles.dottedLine, { minWidth: 25 }]}>{documentDate.day}</Text>
            <Text style={styles.label}> เดือน </Text>
            <Text style={[styles.dottedLine, { minWidth: 60 }]}>{documentDate.month}</Text>
            <Text style={styles.label}> พ.ศ. </Text>
            <Text style={[styles.dottedLine, { minWidth: 40 }]}>{documentDate.year}</Text>
          </View>
        </View>

        {/* เรื่อง + เรียน */}
        <View style={styles.row}>
          <Text style={styles.label}>เรื่อง </Text>
          <Text style={[styles.dottedLineLong, { textAlign: "left", paddingLeft: 3 }]}>
            ขออนุญาตลงเวลามาปฏิบัติราชการ หลังเวลา 08.30 น. (ยกเว้นสาย)
          </Text>
        </View>
        <View style={[styles.row, { marginBottom: 4 }]}>
          <Text style={styles.label}>เรียน </Text>
          <Text style={[styles.dottedLineLong, { textAlign: "left", paddingLeft: 3 }]}>
            {directorTitle(org)}
          </Text>
        </View>

        {/* ข้าพเจ้า + ตำแหน่ง */}
        <View style={[styles.row, { paddingLeft: 28 }]}>
          <Text style={styles.label}>ข้าพเจ้า </Text>
          <Text style={styles.dottedLineLong}>{(leave.user as any).prefix}{leave.user.name}</Text>
          <Text style={styles.label}> ตำแหน่ง </Text>
          <Text style={styles.dottedLineLong}>{leave.user.position || ""}</Text>
        </View>

        {/* ฝ่าย + แผนก */}
        <View style={styles.row}>
          <Text style={styles.label}>ฝ่าย </Text>
          <Text style={[styles.dottedLine, { minWidth: 160 }]}> </Text>
          <Text style={[styles.label, { marginLeft: 12 }]}> แผนก </Text>
          <Text style={[styles.dottedLine, { minWidth: 160 }]}>
            {(leave.user as any).department || ""}
          </Text>
        </View>

        {/* ศูนย์...ของวันที่ */}
        <View style={styles.row}>
          <Text style={styles.label}>
            ศูนย์เทคโนโลยีดิจิทัล ขออนุญาตยกเว้นการลงเวลามาปฏิบัติราชการของวันที่{" "}
          </Text>
          <Text style={styles.dottedLineLong}>
            {requestDate.day} {requestDate.month} {requestDate.year}
          </Text>
        </View>

        {/* ระหว่างเวลา */}
        <View style={styles.row}>
          <Text style={styles.label}>ขออนุญาตลงเวลามาปฏิบัติราชการ ระหว่างเวลา </Text>
          <Text style={[styles.dottedLine, { minWidth: 50 }]}>{leave.outTime || ""}</Text>
          <Text style={styles.label}> - </Text>
          <Text style={[styles.dottedLine, { minWidth: 50 }]}>{leave.backTime || ""}</Text>
          <Text style={styles.label}> น.</Text>
        </View>

        {/* เนื่องจาก */}
        <View style={[styles.row, { marginBottom: 4 }]}>
          <Text style={styles.label}>เนื่องจาก </Text>
          <Text style={styles.dottedLineLong}>{reason}</Text>
        </View>

        <Text style={[styles.label, { marginBottom: 4 }]}>
          ทั้งนี้ ในวันดังกล่าว ข้าพเจ้าได้ลงเวลากลับตามปกติ (หลังเวลา 16.30 น.)
        </Text>

        <Text style={[styles.label, { textAlign: "center", marginBottom: 6 }]}>
          จึงเรียนมาเพื่อโปรดพิจารณา
        </Text>

        {/* ลงชื่อผู้ขอ */}
        <View style={styles.signSection}>
          <View style={styles.rowCenter}>
            <Text style={styles.label}>ลงชื่อ </Text>
            <Text style={[styles.dottedLine, { minWidth: 140 }]}> </Text>
          </View>
          <View style={[styles.rowCenter, { marginLeft: 20 }]}>
            <Text>( </Text>
            <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 130 }]}>{sig.parenName}</Text>
            <Text> )</Text>
          </View>
        </View>

        {/* เรียน ผู้อำนวยการกอง / เพื่อโปรดพิจารณาอนุญาต */}
        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>เรียน ผู้อำนวยการกอง</Text>
          <Text style={[styles.label, { marginTop: 4, marginBottom: 8 }]}>
            เพื่อโปรดพิจารณาอนุญาต
          </Text>
          <View style={[styles.rowCenter, { marginTop: 10 }]}>
            <Text>( </Text>
            <Text style={[styles.dottedLine, { minWidth: 160 }]}> </Text>
            <Text> )</Text>
          </View>
          <View style={styles.rowCenter}>
            <Text style={styles.label}>ตำแหน่ง </Text>
            <Text style={[styles.dottedLine, { minWidth: 175 }]}> </Text>
          </View>
          <View style={styles.rowCenter}>
            <Text style={styles.label}>วันที่ </Text>
            <SignDatePdf variant="labelled" date={supervisorDate} widths={[20, 55, 30]} />
          </View>
        </View>

        {/* สถิติ + คำสั่ง (2 คอลัมน์) */}
        <View style={[styles.twoColumn, { marginTop: 12 }]}>
          <View style={styles.leftColumn}>
            <Text style={styles.sectionTitle}>สถิติในปีงบประมาณนี้</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableHeader, { width: "34%" }]}>ประเภท</Text>
                <Text style={[styles.tableHeader, { width: "33%" }]}>ที่ผ่านมา{"\n"}(ครั้ง)</Text>
                <Text style={[styles.tableHeader, { width: "33%" }]}>รวมครั้งนี้{"\n"}(ครั้ง)</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>ยกเว้นสาย</Text>
                <Text style={styles.tableCell}>{s.exemptPast}</Text>
                <Text style={styles.tableCell}>{s.exemptTotal}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>สาย</Text>
                <Text style={styles.tableCell}>{s.latePast}</Text>
                <Text style={styles.tableCell}>{s.lateTotal}</Text>
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
            </View>
          </View>

          <View style={styles.rightColumn}>
            {/* อนุญาต / ไม่อนุญาต */}
            <View style={[styles.leftAlignRow, { gap: 20, marginBottom: 8, justifyContent: "center" }]}>
              <View style={styles.checkboxRow}>
                <View style={styles.circle} />
                <Text>อนุญาต</Text>
              </View>
              <View style={styles.checkboxRow}>
                <View style={styles.circle} />
                <Text>ไม่อนุญาต</Text>
              </View>
            </View>

            <View style={[styles.leftAlignRow, { justifyContent: "center" }]}>
              <Text>{directorSig.linePrefix}</Text>
            </View>
            <View style={[styles.leftAlignRow, { justifyContent: "center" }]}>
              <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 155, textAlign: "center" }]}>
                ( {directorSig.parenName} )
              </Text>
            </View>
            <View style={[styles.leftAlignRow, { justifyContent: "center", marginBottom: 5 }]}>
              <Text style={[styles.dottedLine, { color: INK_BLACK }, { minWidth: 155, textAlign: "center" }]}>
                {directorPosition}
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
export async function generateLateArrivalPDF(
  leave: Leave & { user: User },
  stats?: LateArrivalStats,
  director?: User | null,
  reviewer?: User | null,
  org?: OrgInfo,
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("generateLateArrivalPDF can only be called on the client side");
  }
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(<LateArrivalDocument leave={leave} stats={stats} director={director} reviewer={reviewer} org={org} />).toBlob();
  return blob;
}

// Component สำหรับดาวน์โหลด PDF
export function LateArrivalPDFDownloadLink({
  leave,
  stats,
  director,
  reviewer,
  org,
  children,
}: LateArrivalFormPDFProps & { children: React.ReactNode }) {
  return (
    <PDFDownloadLink
      document={<LateArrivalDocument leave={leave} stats={stats} director={director} reviewer={reviewer} org={org} />}
      fileName={`late_arrival_form_${leave.user.username}_${new Date().toISOString().split("T")[0]}.pdf`}
      style={{ textDecoration: "none" }}
    >
      {children}
    </PDFDownloadLink>
  );
}

export { LateArrivalDocument };
