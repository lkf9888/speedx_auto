/**
 * A customer estimate PDF built in the staff member's browser: the quote is
 * laid out as an A4 page, drawn with html2canvas and saved with jsPDF. Always
 * in English (Chinese wording on the staff card is translated or dropped).
 * Customer prices only: no cost, margin, stock, supplier or part numbers.
 * Both libraries load only when staff ask for a PDF.
 */
import { company } from "@/lib/company";
import type { PricedQuote } from "./final-price";
import { toEnglish } from "./pdf-english";

const PAGE_WIDTH_PX = 794; // A4 at 96 dpi
const A4_MM = { width: 210, height: 297 };

const money = (value: number) => `$${value.toFixed(2)}`;

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string, children: HTMLElement[] = []): HTMLElement {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  for (const child of children) node.appendChild(child);
  return node;
}

function shopDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function cell(text: string, align: "left" | "right" = "left", bold = false): HTMLElement {
  return el("td", { padding: "10px 8px", borderBottom: "1px solid #e5e7eb", textAlign: align, fontWeight: bold ? "700" : "400", verticalAlign: "top" }, text);
}

/** The page as DOM, with inline styles only (the site's theme colours don't reach it). */
export function buildQuotePage(quote: PricedQuote, now = new Date(), logoUrl = "/workbench/logo.png"): HTMLElement {
  const logo = document.createElement("img");
  logo.src = logoUrl;
  Object.assign(logo.style, { width: "64px", height: "64px", objectFit: "contain" });

  const header = el("div", { display: "flex", alignItems: "center", gap: "16px", borderBottom: "3px solid #111827", paddingBottom: "16px" }, undefined, [
    logo,
    el("div", { flex: "1" }, undefined, [
      el("div", { fontSize: "24px", fontWeight: "800", letterSpacing: "1px" }, company.name),
      el("div", { fontSize: "12px", color: "#4b5563", marginTop: "4px" }, company.addressFull),
      el("div", { fontSize: "12px", color: "#4b5563" }, `${company.phoneDisplay} (WhatsApp) · ${company.email} · WeChat ${company.wechatId}`),
    ]),
    el("div", { textAlign: "right" }, undefined, [
      el("div", { fontSize: "22px", fontWeight: "700" }, "Repair Estimate"),
    ]),
  ]);

  const meta = (label: string, value: string) =>
    el("div", { display: "flex", gap: "8px", fontSize: "13px", padding: "3px 0" }, undefined, [
      el("span", { width: "110px", color: "#6b7280", flexShrink: "0" }, label),
      el("span", { fontWeight: "600" }, value || "—"),
    ]);
  const position = quote.position ? ` (${toEnglish(quote.position)})` : "";
  const details = el("div", { margin: "18px 0" }, undefined, [
    meta("Estimate No.", quote.id),
    meta("Date", shopDate(now)),
    meta("Vehicle", quote.vehicle === "—" ? "" : toEnglish(quote.vehicle)),
    meta("Service", `${toEnglish(quote.service)}${position}`),
  ]);

  const tires = quote.kind === "tires";
  const unitShown = quote.kind === "tires" || quote.kind === "flat";
  const head = el("tr", { background: "#f3f4f6", fontSize: "12px", color: "#374151" }, undefined, [
    el("th", { padding: "8px", textAlign: "left", width: "28px" }, "#"),
    el("th", { padding: "8px", textAlign: "left" }, "Item"),
    el("th", { padding: "8px", textAlign: "right", width: "60px" }, "Qty"),
    el("th", { padding: "8px", textAlign: "right", width: "130px" }, unitShown ? (tires ? "Each, installed" : "Unit price") : ""),
    el("th", { padding: "8px", textAlign: "right", width: "110px" }, "Amount"),
  ]);
  const rows = quote.options.map((o, i) =>
    el("tr", { fontSize: "13px" }, undefined, [
      cell(String(i + 1)),
      cell(toEnglish([o.brand, o.label].filter(Boolean).join(" ")) + (quote.kind === "labor" ? " (parts & labour)" : "")),
      cell(String(o.quantity), "right"),
      cell(unitShown ? money(o.unitPrice) : "", "right"),
      cell(money(o.customerTotal), "right", true),
    ]),
  );
  const table = el("table", { width: "100%", borderCollapse: "collapse" }, undefined, [el("thead", {}, undefined, [head]), el("tbody", {}, undefined, rows)]);

  const several = quote.options.length > 1;
  const summary = several
    ? el("div", { fontSize: "13px", marginTop: "10px", color: "#374151" }, "These are alternative options; choose one.")
    : el("div", { display: "flex", justifyContent: "flex-end", gap: "24px", fontSize: "16px", fontWeight: "800", marginTop: "12px" }, undefined, [
        el("span", {}, "Total (before tax)"),
        el("span", {}, money(quote.options[0]?.customerTotal ?? 0)),
      ]);

  const notes = el("div", { marginTop: "28px", fontSize: "12px", color: "#4b5563", lineHeight: "1.7", borderTop: "1px solid #e5e7eb", paddingTop: "12px" }, undefined, [
    el("div", {}, "• Prices are before tax; GST / PST extra."),
    el("div", {}, "• The final price is confirmed after inspection at the shop."),
    el("div", {}, `• Hours: ${company.hours}`),
  ]);

  return el(
    "div",
    {
      width: `${PAGE_WIDTH_PX}px`,
      padding: "48px 56px",
      boxSizing: "border-box",
      background: "#ffffff",
      color: "#111827",
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    },
    undefined,
    [header, details, table, summary, notes],
  );
}

export function quotePdfName(quote: Pick<PricedQuote, "id">): string {
  return `SPEEDX-Estimate-${quote.id}.pdf`;
}

/** Draws the page and returns the PDF file. */
export async function quotePdf(quote: PricedQuote, now = new Date()): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const page = buildQuotePage(quote, now);
  const holder = el("div", { position: "fixed", left: "-10000px", top: "0" }, undefined, [page]);
  document.body.appendChild(holder);
  try {
    await Promise.all([...page.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageHeightPx = Math.floor((canvas.width * A4_MM.height) / A4_MM.width);
    // Long quotes continue on further pages, cut at the page height.
    for (let top = 0, index = 0; top < canvas.height; top += pageHeightPx, index += 1) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.min(pageHeightPx, canvas.height - top);
      slice.getContext("2d")!.drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (index > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, A4_MM.width, (slice.height * A4_MM.width) / canvas.width);
    }
    return new File([pdf.output("blob")], quotePdfName(quote), { type: "application/pdf" });
  } finally {
    holder.remove();
  }
}

/** Saves the file through the browser's download. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
