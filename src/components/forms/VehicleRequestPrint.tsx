/**
 * หน้าพิมพ์ HTML ของ "ใบขอรับการสนับสนุนรถยนต์" — วาดจากโครงหน้า buildVehicleLayout()
 * (โครงเดียวกับ VehicleRequestPdf.tsx เพื่อให้พิมพ์กับ PDF เหมือนกัน)
 */

"use client";

import React from "react";
import type { LayoutBlock, LayoutItem, LayoutRow } from "@/lib/vehicle-request";
import { INK_BLUE, INK_BLACK } from "./formPrintShared";

const FONT_PT = 15;
const SMALL_PT = 12;

function Item({ item }: { item: LayoutItem }) {
  switch (item.k) {
    case "gap":
      return <span style={{ display: "inline-block", width: `${item.w}mm`, flexShrink: 0 }} />;
    case "group":
      return (
        <span style={{ display: "inline-flex", alignItems: "flex-end", flexShrink: 0 }}>
          {item.items.map((it, i) => (
            <Item key={i} item={it} />
          ))}
        </span>
      );
    case "box":
      return (
        <span
          style={{
            display: "inline-block",
            width: "4mm",
            height: "4mm",
            border: "0.5pt solid black",
            flexShrink: 0,
            alignSelf: "center",
            textAlign: "center",
            lineHeight: "3.6mm",
            fontSize: "11pt",
            color: INK_BLUE,
          }}
        >
          {item.checked ? "✓" : ""}
        </span>
      );
    case "text":
      return (
        <span
          style={{
            whiteSpace: item.wrap ? "normal" : "nowrap",
            flexShrink: item.wrap ? 1 : 0,
            minWidth: item.wrap ? 0 : undefined,
            fontWeight: item.bold ? "bold" : undefined,
            textDecoration: item.underline ? "underline" : undefined,
            fontSize: item.size ? `${item.size}pt` : item.small ? `${SMALL_PT}pt` : undefined,
          }}
        >
          {item.v}
        </span>
      );
    case "dot":
      return (
        <span
          style={{
            borderBottom: "0.5pt dotted black",
            color: item.ink === "black" ? INK_BLACK : INK_BLUE,
            textAlign: item.align ?? "center",
            minHeight: "1.2em",
            minWidth: 0,
            ...(item.w !== undefined ? { width: `${item.w}mm`, flexShrink: 1 } : { flex: item.flex ?? 1 }),
          }}
        >
          {item.v}
        </span>
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
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: justify,
        marginTop: row.mt ? `${row.mt}mm` : undefined,
        paddingLeft: row.indent ? `${row.indent}mm` : undefined,
      }}
    >
      {row.items.map((it, i) => (
        <Item key={i} item={it} />
      ))}
    </div>
  );
}

export default function VehicleRequestPrint({
  blocks,
  signatureSlot,
}: {
  blocks: LayoutBlock[];
  /** ลายเซ็นผู้จัดทำเอกสาร (SignatureMark) — วางทับเส้น "ลงชื่อ" ในคอลัมน์ขวาของบล็อกท้าย */
  signatureSlot?: React.ReactNode;
}) {
  return (
    <div style={{ fontSize: `${FONT_PT}pt`, lineHeight: 1.2 }}>
      {blocks.map((b, i) => {
        if (b.kind === "rows") return b.rows.map((r, j) => <Row key={`${i}-${j}`} row={r} />);
        if (b.kind === "footnote")
          return (
            <div key={i} style={{ fontSize: `${SMALL_PT - 2}pt`, marginTop: "4mm" }}>
              {b.v}
            </div>
          );
        return (
          <div key={i} style={{ display: "flex", gap: "8mm", marginTop: b.mt ? `${b.mt}mm` : undefined }}>
            <div style={{ flex: b.ratio?.[0] ?? 1, minWidth: 0, position: "relative" }}>
              {b.left.map((r, j) => (
                <Row key={j} row={r} />
              ))}
            </div>
            <div style={{ flex: b.ratio?.[1] ?? 1, minWidth: 0, position: "relative" }}>
              {b.signatureAnchor === "right" ? signatureSlot : null}
              {b.right.map((r, j) => (
                <Row key={j} row={r} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
