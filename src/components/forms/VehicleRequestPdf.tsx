/**
 * ส่วนเนื้อหา PDF ของ "ใบขอรับการสนับสนุนรถยนต์" — วาดจากโครงหน้า buildVehicleLayout()
 * (โครงเดียวกับ VehicleRequestPrint.tsx เพื่อให้ PDF กับหน้าพิมพ์เหมือนกัน)
 */

import React from "react";
import { Text, View, Image } from "@react-pdf/renderer";
import type { LayoutBlock, LayoutItem, LayoutRow } from "@/lib/vehicle-request";
import { INK_BLUE, INK_BLACK } from "./formPrintShared";
import { signaturePdfStyle, type PdfSignatureImage } from "./signature";
import type { SignaturePlacement } from "@/types";

const PT_PER_MM = 72 / 25.4;
const mm = (v: number) => v * PT_PER_MM;
const SMALL = 12;

function Item({ item }: { item: LayoutItem }) {
  switch (item.k) {
    case "gap":
      return <View style={{ width: mm(item.w) }} />;
    case "group":
      return (
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          {item.items.map((it, i) => (
            <Item key={i} item={it} />
          ))}
        </View>
      );
    case "box":
      return (
        <View
          style={{
            width: mm(4),
            height: mm(4),
            border: "0.5 solid black",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 2,
          }}
        >
          {item.checked ? <Text style={{ color: INK_BLUE, fontSize: 11 }}>✓</Text> : null}
        </View>
      );
    case "text":
      return (
        <Text
          style={{
            ...(item.wrap ? { flexShrink: 1, flexGrow: 1, flexBasis: 0 } : {}),
            fontWeight: item.bold ? "bold" : undefined,
            textDecoration: item.underline ? "underline" : undefined,
            fontSize: item.size ?? (item.small ? SMALL : undefined),
          }}
        >
          {item.v}
        </Text>
      );
    case "dot":
      return (
        <Text
          style={{
            borderBottom: "0.5 dotted black",
            color: item.ink === "black" ? INK_BLACK : INK_BLUE,
            textAlign: item.align ?? "center",
            minHeight: 15,
            ...(item.w !== undefined ? { width: mm(item.w), flexShrink: 1 } : { flex: item.flex ?? 1 }),
          }}
        >
          {item.v || " "}
        </Text>
      );
  }
}

function Row({ row }: { row: LayoutRow }) {
  const justify = row.spread
    ? "space-between"
    : row.align === "right"
      ? "flex-end"
      : row.align === "center"
        ? "center"
        : "flex-start";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: justify,
        marginTop: row.mt ? mm(row.mt) : 0,
        paddingLeft: row.indent ? mm(row.indent) : 0,
      }}
    >
      {row.items.map((it, i) => (
        <Item key={i} item={it} />
      ))}
    </View>
  );
}

export default function VehicleRequestPdf({
  blocks,
  signature,
}: {
  blocks: LayoutBlock[];
  /** ลายเซ็นผู้จัดทำเอกสาร (รูป + ตำแหน่ง mm) — วางทับเส้น "ลงชื่อ" ของคอลัมน์ขวา */
  signature?: { image: PdfSignatureImage; placement: SignaturePlacement } | null;
}) {
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.kind === "rows") return b.rows.map((r, j) => <Row key={`${i}-${j}`} row={r} />);
        if (b.kind === "footnote")
          return (
            <Text key={i} style={{ fontSize: SMALL - 2, marginTop: mm(4) }}>
              {b.v}
            </Text>
          );
        return (
          <View key={i} style={{ flexDirection: "row", marginTop: b.mt ? mm(b.mt) : 0 }}>
            <View style={{ flex: b.ratio?.[0] ?? 1, position: "relative", marginRight: mm(4) }}>
              {b.left.map((r, j) => (
                <Row key={j} row={r} />
              ))}
            </View>
            <View style={{ flex: b.ratio?.[1] ?? 1, marginLeft: mm(4), position: "relative" }}>
              {b.signatureAnchor === "right" && signature ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image
                  src={signature.image.dataUrl}
                  style={signaturePdfStyle(signature.placement, signature.image.aspect)}
                />
              ) : null}
              {b.right.map((r, j) => (
                <Row key={j} row={r} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
