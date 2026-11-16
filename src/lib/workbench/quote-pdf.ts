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
import { taxOn } from "./tax";

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

/** Labor on one job: the list price (the shop's $120/h), what is charged, and so the discount. */
export interface PdfLabor {
  hours: number;
  list: number;
  charged: number;
}

/** Several jobs on one estimate (the combined quote sheet): one block each and a grand total; null is "to be quoted". */
export interface SheetPdf {
  rows: Array<{ label: string; amount: number | null; note?: string; labor?: PdfLabor | null }>;
  total: number;
}

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#d1d5db";
const BAND = "#1f2937";
const GREEN = "#047857";

const sign = (value: number) => `−${money(Math.abs(value))}`;
const percentOff = (list: number, charged: number) => {
  const pct = ((list - charged) / list) * 100;
  return `${Math.abs(pct - Math.round(pct)) < 0.05 ? Math.round(pct) : pct.toFixed(1)}% off`;
};
const hoursText = (hours: number) => `${Number.isInteger(hours) ? hours.toFixed(1) : String(hours)} h`;
const rate = (labor: PdfLabor) => (labor.hours > 0 ? labor.list / labor.hours : 0);

/** A labor figure only counts when it has hours and doesn't exceed the list price. */
function usableLabor(labor: PdfLabor | null | undefined): PdfLabor | null {
  return labor && labor.hours > 0 && labor.list > 0 && labor.charged >= 0 && labor.charged <= labor.list + 0.005 ? labor : null;
}

const th = (text: string, align: "left" | "right", width?: string) =>
  el("th", { padding: "8px 10px", textAlign: align, fontSize: "11px", letterSpacing: "0.6px", textTransform: "uppercase", ...(width ? { width } : {}) }, text);
const td = (text: string, o: { align?: "left" | "right"; bold?: boolean; color?: string; indent?: boolean; small?: boolean } = {}) =>
  el(
    "td",
    {
      padding: "7px 10px",
      borderBottom: `1px solid ${LINE}`,
      textAlign: o.align ?? "left",
      fontWeight: o.bold ? "700" : "400",
      verticalAlign: "top",
      fontSize: o.small ? "12px" : "13px",
      color: o.color ?? INK,
      ...(o.indent ? { paddingLeft: "24px" } : {}),
    },
    text,
  );
const row = (cells: HTMLElement[], background?: string) => el("tr", background ? { background } : {}, undefined, cells);

/** The lines under one job: parts, labor at the list rate, the discount and the job's amount. */
function jobRows(title: string, amount: number, labor: PdfLabor, index: number): HTMLElement[] {
  const parts = Math.max(0, Math.round((amount - labor.charged) * 100) / 100);
  const discount = Math.round((labor.list - labor.charged) * 100) / 100;
  const out = [
    row([td(String(index), { bold: true }), td(title, { bold: true }), td("", { align: "right" }), td("", { align: "right" }), td("", { align: "right" })], "#f3f4f6"),
    ...(parts > 0.004 ? [row([td(""), td("Parts", { indent: true }), td("1", { align: "right" }), td(money(parts), { align: "right" }), td(money(parts), { align: "right" })])] : []),
    row([td(""), td(`Labor · ${hoursText(labor.hours)} at ${money(rate(labor))}/h`, { indent: true }), td("", { align: "right" }), td("", { align: "right" }), td(money(labor.list), { align: "right" })]),
  ];
  if (discount > 0.004) {
    out.push(
      row(
        [
          td(""),
          td(`Labor discount (${percentOff(labor.list, labor.charged)})`, { indent: true, color: GREEN, bold: true }),
          td("", { align: "right" }),
          td("", { align: "right" }),
          el("td", { padding: "7px 10px", borderBottom: `1px solid ${LINE}`, textAlign: "right", fontWeight: "800", fontSize: "16px", color: GREEN }, sign(discount)),
        ],
        "#ecfdf5",
      ),
    );
  }
  out.push(row([td(""), td("Job total", { bold: true, indent: true }), td("", { align: "right" }), td("", { align: "right" }), td(money(amount), { align: "right", bold: true })]));
  return out;
}

/** The page as DOM, with inline styles only (the site's theme colours don't reach it). */
export function buildQuotePage(quote: PricedQuote, now = new Date(), logoUrl = "/workbench/logo.png", sheet?: SheetPdf, soleLabor?: PdfLabor | null): HTMLElement {
  const logo = document.createElement("img");
  logo.src = logoUrl;
  Object.assign(logo.style, { width: "64px", height: "64px", objectFit: "contain" });

  const header = el("div", { display: "flex", alignItems: "center", gap: "16px", paddingBottom: "14px", borderBottom: `4px solid ${BAND}` }, undefined, [
    logo,
    el("div", { flex: "1" }, undefined, [
      el("div", { fontSize: "22px", fontWeight: "800", letterSpacing: "1px" }, company.name),
      el("div", { fontSize: "11.5px", color: "#4b5563", marginTop: "4px" }, company.addressFull),
      el("div", { fontSize: "11.5px", color: "#4b5563" }, `${company.phoneDisplay} (WhatsApp) · ${company.email} · WeChat ${company.wechatId}`),
    ]),
    el("div", { textAlign: "right" }, undefined, [el("div", { fontSize: "26px", fontWeight: "800", letterSpacing: "2px", color: BAND }, "Repair Estimate")]),
  ]);

  const position = quote.position ? ` (${toEnglish(quote.position)})` : "";
  const field = (label: string, value: string) =>
    el("div", { display: "flex", gap: "8px", fontSize: "12.5px", padding: "3px 0" }, undefined, [
      el("span", { width: "92px", color: MUTED, flexShrink: "0" }, label),
      el("span", { fontWeight: "600" }, value || "—"),
    ]);
  const box = (title: string, fields: HTMLElement[]) =>
    el("div", { flex: "1", border: `1px solid ${LINE}` }, undefined, [
      el("div", { background: "#f3f4f6", padding: "6px 10px", fontSize: "11px", fontWeight: "700", letterSpacing: "0.8px", textTransform: "uppercase", color: "#374151" }, title),
      el("div", { padding: "6px 10px" }, undefined, fields),
    ]);
  const details = el("div", { display: "flex", gap: "16px", margin: "18px 0" }, undefined, [
    box("Vehicle", [field("Vehicle", quote.vehicle === "—" ? "" : toEnglish(quote.vehicle)), field("Service", sheet ? `${sheet.rows.length} job${sheet.rows.length === 1 ? "" : "s"}` : `${toEnglish(quote.service)}${position}`)]),
    box("Estimate", [field("Estimate No.", quote.id), field("Date", shopDate(now))]),
  ]);

  const tires = quote.kind === "tires";
  const unitShown = quote.kind === "tires" || quote.kind === "flat";
  const head = el("tr", { background: BAND, color: "#ffffff" }, undefined, [
    th("#", "left", "34px"),
    th("Description", "left"),
    th("Qty", "right", "56px"),
    th(unitShown ? (tires ? "Each, installed" : "Unit price") : "Price", "right", "118px"),
    th("Amount", "right", "108px"),
    ...(!sheet && quote.options.length > 1 ? [th("After tax", "right", "108px")] : []),
  ]);

  let body: HTMLElement[];
  let partsSum = 0;
  let laborList = 0;
  let laborCharged = 0;
  let breakdown = false;
  let others = false;
  if (sheet) {
    body = sheet.rows.flatMap((r, i) => {
      const title = toEnglish(r.label) + (r.note ? ` (${toEnglish(r.note)})` : "");
      const labor = r.amount === null ? null : usableLabor(r.labor);
      if (r.amount !== null && labor && r.amount - labor.charged >= 0) {
        breakdown = true;
        partsSum += r.amount - labor.charged;
        laborList += labor.list;
        laborCharged += labor.charged;
        return jobRows(title, r.amount, labor, i + 1);
      }
      if (r.amount !== null) {
        partsSum += r.amount;
        others = true;
      }
      return [row([td(String(i + 1)), td(title), td("1", { align: "right" }), td("", { align: "right" }), td(r.amount === null ? "To be quoted" : money(r.amount), { align: "right", bold: true })])];
    });
  } else {
    const labor = quote.options.length === 1 ? usableLabor(soleLabor) : null;
    const only = quote.options[0];
    if (labor && only && only.customerTotal - labor.charged >= 0) {
      breakdown = true;
      partsSum = only.customerTotal - labor.charged;
      laborList = labor.list;
      laborCharged = labor.charged;
      body = jobRows(toEnglish([only.brand, only.label].filter(Boolean).join(" ")) + (only.source === "used" ? " – used part, warranty as stated by the seller" : ""), only.customerTotal, labor, 1);
    } else {
      body = quote.options.map((o, i) =>
        row([
          td(String(i + 1)),
          td(toEnglish([o.brand, o.label].filter(Boolean).join(" ")) + (quote.kind === "labor" ? " (parts & labour)" : "") + (o.source === "used" ? " – used part, warranty as stated by the seller" : "")),
          td(String(o.quantity), { align: "right" }),
          td(unitShown ? money(o.unitPrice) : "", { align: "right" }),
          td(money(o.customerTotal), { align: "right", bold: true }),
          ...(quote.options.length > 1 ? [td(money(taxOn(o.customerTotal).total), { align: "right", bold: true })] : []),
        ]),
      );
    }
  }
  const table = el("table", { width: "100%", borderCollapse: "collapse" }, undefined, [el("thead", {}, undefined, [head]), el("tbody", {}, undefined, body)]);

  const several = !sheet && quote.options.length > 1;
  const pending = sheet?.rows.some((r) => r.amount === null);
  const grand = sheet ? sheet.total : quote.options[0]?.customerTotal ?? 0;
  const sum = (label: string, value: string, o: { color?: string; bold?: boolean } = {}) =>
    el("div", { display: "flex", justifyContent: "space-between", gap: "24px", padding: "4px 0", fontSize: "13px", color: o.color ?? INK, fontWeight: o.bold ? "700" : "400" }, undefined, [el("span", {}, label), el("span", {}, value)]);
  const summaryLines: HTMLElement[] = [];
  if (breakdown) {
    summaryLines.push(sum(others ? "Parts & other items" : "Parts", money(partsSum)));
    summaryLines.push(sum(`Labor at list price`, money(laborList)));
    if (laborList - laborCharged > 0.004) summaryLines.push(sum(`Labor discount (${percentOff(laborList, laborCharged)})`, sign(laborList - laborCharged), { color: GREEN, bold: true }));
  }
  // (the saving banner, tax lines and total follow below)
  const taxed = taxOn(grand);
  const saved = laborList - laborCharged;
  const saving =
    breakdown && saved > 0.004
      ? el("div", { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "24px", marginTop: "8px", padding: "9px 12px", background: "#ecfdf5", border: `2px solid ${GREEN}`, color: GREEN, fontWeight: "800" }, undefined, [
          el("span", { fontSize: "14px" }, `You save on labor (${percentOff(laborList, laborCharged)})`),
          el("span", { fontSize: "22px" }, money(saved)),
        ])
      : null;
  const taxLines = [sum(pending ? "Subtotal so far (before tax)" : "Subtotal (before tax)", money(taxed.subtotal), { bold: true }), sum("GST (5%)", money(taxed.gst)), sum("PST (7%)", money(taxed.pst))];
  const totalBand = el("div", { display: "flex", justifyContent: "space-between", gap: "24px", marginTop: "6px", padding: "9px 12px", background: BAND, color: "#ffffff", fontSize: "16px", fontWeight: "800" }, undefined, [
    el("span", {}, pending ? "Total so far (after tax)" : "Total (after tax)"),
    el("span", {}, money(taxed.total)),
  ]);
  const summary = several
    ? el("div", { fontSize: "13px", marginTop: "12px", color: "#374151" }, undefined, [
        el("div", {}, "These are alternative options; choose one."),
        ...(usableLabor(soleLabor) ? [el("div", { marginTop: "4px" }, `Labor in each option: ${hoursText(soleLabor!.hours)} at ${money(rate(soleLabor!))}/h = ${money(soleLabor!.list)}${soleLabor!.list - soleLabor!.charged > 0.004 ? `, discount ${sign(soleLabor!.list - soleLabor!.charged)} (${percentOff(soleLabor!.list, soleLabor!.charged)}), charged ${money(soleLabor!.charged)}` : ""}.`)] : []),
      ])
    : el("div", { display: "flex", justifyContent: "flex-end", marginTop: "14px" }, undefined, [
        el("div", { width: "320px" }, undefined, [
          ...summaryLines,
          ...(saving ? [saving] : []),
          ...taxLines,
          totalBand,
          ...(pending ? [el("div", { fontSize: "11.5px", color: "#4b5563", marginTop: "6px", textAlign: "right" }, "Items marked “To be quoted” will be priced once the parts are confirmed.")] : []),
        ]),
      ]);

  const notes = el("div", { marginTop: "26px", fontSize: "11.5px", color: "#4b5563", lineHeight: "1.7", borderTop: `1px solid ${LINE}`, paddingTop: "10px" }, undefined, [
    el("div", {}, "• GST (5%) and PST (7%) are included in the total after tax."),
    el("div", {}, "• The final price is confirmed after inspection at the shop."),
    el("div", {}, `• Hours: ${company.hours}`),
  ]);

  return el(
    "div",
    {
      width: `${PAGE_WIDTH_PX}px`,
      padding: "44px 52px",
      boxSizing: "border-box",
      background: "#ffffff",
      color: INK,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    },
    undefined,
    [header, details, table, summary, notes],
  );
}

export function quotePdfName(quote: Pick<PricedQuote, "id">): string {
  return `SPEEDX-Estimate-${quote.id}.pdf`;
}

export function quoteImageName(quote: Pick<PricedQuote, "id">): string {
  return `SPEEDX-Estimate-${quote.id}.png`;
}

/** Lays the page out off-screen, draws it, and hands the canvas to `use`. */
async function withPageCanvas<T>(quote: PricedQuote, now: Date, sheet: SheetPdf | undefined, labor: PdfLabor | null | undefined, use: (canvas: HTMLCanvasElement) => T | Promise<T>): Promise<T> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const page = buildQuotePage(quote, now, undefined, sheet, labor);
  const holder = el("div", { position: "fixed", left: "-10000px", top: "0" }, undefined, [page]);
  document.body.appendChild(holder);
  try {
    await Promise.all([...page.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    return await use(canvas);
  } finally {
    holder.remove();
  }
}

/** Draws the page and returns the PDF file. */
export async function quotePdf(quote: PricedQuote, now = new Date(), sheet?: SheetPdf, labor?: PdfLabor | null): Promise<File> {
  const { jsPDF } = await import("jspdf");
  return withPageCanvas(quote, now, sheet, labor, (canvas) => {
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
  });
}

/** The same page as one PNG image (Kevin, 2026-11-15), however long. */
export async function quoteImage(quote: PricedQuote, now = new Date(), sheet?: SheetPdf, labor?: PdfLabor | null): Promise<File> {
  return withPageCanvas(quote, now, sheet, labor, async (canvas) => {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("image failed");
    return new File([blob], quoteImageName(quote), { type: "image/png" });
  });
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
