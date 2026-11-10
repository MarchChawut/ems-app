"use client";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from "@react-pdf/renderer";
import { FormRequest } from "@/types";
import { formatSignatureName } from "@/lib/utils";
import { formatThaiDate } from "./formPrintShared";
// ลงทะเบียนฟอนต์ THSarabun จากไฟล์ local เท่านั้น (ไม่มี fallback ไป Google Fonts) เพราะ deploy บน
// intranet server ที่ไม่ต่ออินเทอร์เน็ตออกไป - import แบบ static ตรงนี้ (ไฟล์นี้เองก็ถูก dynamic import
// อยู่แล้วจากผู้เรียก จึงไม่กระทบ bundle เริ่มต้น) รับประกันว่าฟอนต์พร้อมใช้ก่อน render เสมอ ไม่ต้องพึ่ง
// import order ของผู้เรียก
import "@/lib/pdf-fonts";
import { DEFAULT_ORG, directorTitle, type OrgInfo } from "@/lib/org-settings";
import { INK_BLUE, INK_BLACK, formatSignDate } from "./formPrintShared";
import { SignDatePdf } from "./signaturePdf";
import VehicleRequestPdf from "./VehicleRequestPdf";
import { getPageMargins, pdfPadding } from "./pageMargins";
import { buildVehicleLayout, VEHICLE_REQUEST_SYSTEM_KEY } from "@/lib/vehicle-request";
import { signaturePdfStyle, type PdfSignatureImage } from "./signature";
import type { SignaturePlacement } from "@/types";

// ปิด hyphenation สำหรับภาษาไทย
Font.registerHyphenationCallback((word) => [word]);


const styles = StyleSheet.create({
  page: {
    padding: "25 20 20 30",
    fontFamily: "THSarabun",
    fontSize: 16,
    lineHeight: 1.2,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
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
  row: {
    flexDirection: "row",
    marginBottom: 3,
    alignItems: "flex-end",
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
  fieldRow: {
    flexDirection: "row",
    marginBottom: 3,
    alignItems: "flex-end",
    paddingLeft: 10,
  },
  fieldLabel: {
    fontSize: 16,
    whiteSpace: "nowrap",
  } as any,
  signatureBlock: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  signatureLine: {
    borderBottom: "0.5 dotted black", color: INK_BLUE,
    minWidth: 160,
    textAlign: "center",
    paddingHorizontal: 3,
  },
  approverBlock: {
    marginTop: 20,
    width: "60%",
    marginLeft: "auto",
  },
  approverTitle: {
    fontWeight: "bold",
    textDecoration: "underline",
    marginBottom: 6,
  },
  approverCommentLine: {
    borderBottom: "0.5 dotted black", color: INK_BLUE,
    height: 16,
    marginBottom: 8,
  },
  approverRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 3,
  },
});

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

interface FormRequestPDFProps {
  formRequest: FormRequest;
  /** ลายเซ็นผู้ขอที่วางไว้ (รูป data URL + ตำแหน่ง mm) - ไม่ระบุ = ไม่แสดง */
  signature?: { image: PdfSignatureImage; placement: SignaturePlacement } | null;
  /** ชื่อสังกัด/ชื่อกองหลัก (ข้อมูลหน่วยงาน) ใช้เป็นผู้รับ (เรียน) — ไม่ระบุ = ค่าเริ่มต้น */
  org?: OrgInfo;
}

function FormRequestDocument({ formRequest, signature, org = DEFAULT_ORG }: FormRequestPDFProps) {
  const template = formRequest.template;
  if (!template) {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text>ไม่พบแบบฟอร์มต้นแบบของรายการนี้</Text>
        </Page>
      </Document>
    );
  }
  // ระยะขอบของฟอร์มนี้ — แก้ที่ pageMargins.ts
  const pageMargins = getPageMargins(template.systemKey);
  const requester = formRequest.requestedBy;
  const requestDate = formatThaiDate(formRequest.requestDate);
  const documentDate = formatThaiDate(formRequest.createdAt);
  const sig = formatSignatureName(requester?.prefix, requester?.name);
  // วันที่ลงนามของผู้บังคับบัญชา = วันที่คำขอได้รับการพิจารณา (ยังไม่พิจารณา = ว่าง)
  const approvalDate = formatSignDate(formRequest.approvedAt);
  const data = (formRequest.data ?? {}) as unknown as Record<string, unknown>;

  if (template.systemKey === VEHICLE_REQUEST_SYSTEM_KEY) {
    const blocks = buildVehicleLayout({
      data,
      requestDate,
      requesterName: requester ? `${requester.prefix ?? ""}${requester.name}` : "",
      requesterPosition: requester?.position ?? "",
      thaiDate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatThaiDate(`${v}T00:00:00`) : null),
    });
    return (
      <Document>
        <Page size="A4" style={[styles.page, { padding: pdfPadding(pageMargins.pdf), fontSize: 15 }]}>
          <VehicleRequestPdf blocks={blocks} signature={signature} />
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      <Page size="A4" style={[styles.page, { padding: pdfPadding(pageMargins.pdf) }]}>
        <Text style={styles.title}>{template.documentTitle}</Text>

        <View style={styles.rightRow}>
          <Text>วันที่ </Text>
          <Text style={[styles.dottedLine, { minWidth: 20 }]}>{documentDate.day}</Text>
          <Text> เดือน </Text>
          <Text style={[styles.dottedLine, { minWidth: 60 }]}>{documentDate.month}</Text>
          <Text> พ.ศ. </Text>
          <Text style={[styles.dottedLine, { minWidth: 35 }]}>{documentDate.year}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>เรื่อง</Text>
          <Text style={[styles.dottedLineLong, { marginLeft: 5 }]}>{template.documentTitle}</Text>
        </View>
        <View style={[styles.row, { marginBottom: 8 }]}>
          <Text style={styles.label}>เรียน</Text>
          <Text style={[styles.dottedLineLong, { marginLeft: 5 }]}>{directorTitle(org)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>ข้าพเจ้า</Text>
          <Text style={[styles.dottedLineLong, { marginLeft: 3 }]}>
            {requester ? `${requester.prefix ?? ""}${requester.name}` : ""}
          </Text>
          <Text style={{ marginLeft: 3 }}>ตำแหน่ง</Text>
          <Text style={[styles.dottedLine, { flex: 1, marginLeft: 3 }]}>
            {requester?.position ?? ""}
          </Text>
        </View>
        <View style={[styles.row, { marginBottom: 8 }]}>
          <Text style={styles.label}>กอง</Text>
          <Text style={[styles.dottedLine, { minWidth: 130 }]}>{requester?.department ?? ""}</Text>
          <Text style={{ marginLeft: 8 }}>สังกัด</Text>
          <Text style={[styles.dottedLineLong, { marginLeft: 3 }]}>{requester?.division ?? ""}</Text>
        </View>

        <Text style={{ marginBottom: 6 }}>
          มีความประสงค์จะ{template.documentTitle} โดยมีรายละเอียดดังนี้
        </Text>

        {template.fields.map((field) => (
          <View style={styles.fieldRow} key={field.key}>
            <Text style={styles.fieldLabel}>{field.label}</Text>
            <Text style={[styles.dottedLineLong, { marginLeft: 5 }]}>
              {formatFieldValue(data[field.key])}
            </Text>
          </View>
        ))}

        <View style={styles.row}>
          <Text style={styles.label}>ในวันที่</Text>
          <Text style={[styles.dottedLine, { minWidth: 20, marginLeft: 3 }]}>{requestDate.day}</Text>
          <Text style={{ marginLeft: 3 }}>เดือน</Text>
          <Text style={[styles.dottedLine, { minWidth: 60, marginLeft: 3 }]}>{requestDate.month}</Text>
          <Text style={{ marginLeft: 3 }}>พ.ศ.</Text>
          <Text style={[styles.dottedLine, { minWidth: 35, marginLeft: 3 }]}>{requestDate.year}</Text>
        </View>
        {formRequest.documentNumber ? (
          <View style={styles.row}>
            <Text style={styles.label}>เลขที่หนังสือ</Text>
            <Text style={[styles.dottedLineLong, { marginLeft: 5 }]}>{formRequest.documentNumber}</Text>
          </View>
        ) : null}

        <View style={[styles.signatureBlock, { position: "relative" }]}>
          {signature ? (
            <Image
              src={signature.image.dataUrl}
              style={signaturePdfStyle(signature.placement, signature.image.aspect)}
            />
          ) : null}
          <View style={[styles.approverRow, { marginBottom: 2 }]}>
            <Text>ลงชื่อ{sig.linePrefix ? ` ${sig.linePrefix}` : ""} </Text>
            <Text style={styles.signatureLine}> </Text>
          </View>
          <View style={styles.approverRow}>
            <Text>( </Text>
            <Text style={[styles.signatureLine, { color: INK_BLACK }]}>{sig.parenName}</Text>
            <Text> )</Text>
          </View>
          <Text style={{ textAlign: "center", marginTop: 2 }}>ผู้ขอ</Text>
        </View>

        <View style={styles.approverBlock}>
          <Text style={styles.approverTitle}>ความเห็นผู้บังคับบัญชา</Text>
          <View style={styles.approverCommentLine} />
          <View style={styles.approverCommentLine} />
          <View style={[styles.approverRow, { marginTop: 10 }]}>
            <Text>ลงชื่อ </Text>
            <Text style={styles.signatureLine}> </Text>
          </View>
          <View style={styles.approverRow}>
            <Text>( </Text>
            <Text style={styles.signatureLine}> </Text>
            <Text> )</Text>
          </View>
          <View style={styles.approverRow}>
            <Text>ตำแหน่ง </Text>
            <Text style={styles.signatureLine}> </Text>
          </View>
          <View style={styles.approverRow}>
            <Text>วันที่ </Text>
            <SignDatePdf date={approvalDate} widths={[20, 30, 40]} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ฟังก์ชันสร้าง PDF Blob
export async function generateFormRequestPDF(
  formRequest: FormRequest,
  signature?: FormRequestPDFProps["signature"],
  org?: OrgInfo
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("generateFormRequestPDF can only be called on the client side");
  }
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(<FormRequestDocument formRequest={formRequest} signature={signature} org={org} />).toBlob();
  return blob;
}

