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

// Layout (Kevin, 2026-11-16, design B): white page, the SpeedX logo large and centred over a yellow rule with a short red
// centre bar (the logo's two colours), the total in big red type with the regular price struck through to its left,
// the job lines below it as light blocks.
const BRAND_YELLOW = "#f7b900";
const BRAND_RED = "#af1b05";
const COLS = { qty: "44px", unit: "96px", amount: "104px", after: "104px" } as const;

type Cell = { text: string; width?: string; align?: "left" | "right"; bold?: boolean; color?: string; size?: string };

/** One line made of flex cells; the first cell takes the remaining width. */
function line(cells: Cell[], o: { background?: string; indent?: boolean; border?: boolean; padding?: string } = {}): HTMLElement {
  return el(
    "div",
    {
      display: "flex",
      alignItems: "baseline",
      gap: "8px",
      padding: o.padding ?? "5px 10px",
      ...(o.indent ? { paddingLeft: "26px" } : {}),
      ...(o.border === false ? {} : { borderBottom: "1px dotted #c9cfd8" }),
      ...(o.background ? { background: o.background } : {}),
    },
    undefined,
    cells.map((c, i) =>
      el("div", { ...(i === 0 ? { flex: "1" } : { width: c.width ?? COLS.amount, flexShrink: "0" }), textAlign: c.align ?? (i === 0 ? "left" : "right"), fontWeight: c.bold ? "700" : "400", color: c.color ?? INK, fontSize: c.size ?? "13px" }, c.text),
    ),
  );
}

/** The lines of one job: its title, parts, labor at the list rate, the discount and the job's amount. */
function jobLines(title: string, amount: number, labor: PdfLabor, index: number): HTMLElement[] {
  const parts = Math.max(0, Math.round((amount - labor.charged) * 100) / 100);
  const discount = Math.round((labor.list - labor.charged) * 100) / 100;
  return [
    line([{ text: `${index}.  ${title}`, bold: true, size: "13.5px" }], { background: "#fafafa", border: false, padding: "7px 10px" }),
    ...(parts > 0.004 ? [line([{ text: "Parts" }, { text: "1", width: COLS.qty }, { text: money(parts), width: COLS.unit }, { text: money(parts) }], { indent: true })] : []),
    line([{ text: `Labor · ${hoursText(labor.hours)} at ${money(rate(labor))}/h` }, { text: "", width: COLS.qty }, { text: "", width: COLS.unit }, { text: money(labor.list) }], { indent: true }),
    ...(discount > 0.004
      ? [line([{ text: `Labor discount (${percentOff(labor.list, labor.charged)})`, color: GREEN, bold: true }, { text: "", width: COLS.qty }, { text: "", width: COLS.unit }, { text: sign(discount), color: GREEN, bold: true, size: "15px" }], { indent: true, background: "#ecfdf5" })]
      : []),
    line([{ text: "Job total", bold: true }, { text: "", width: COLS.qty }, { text: "", width: COLS.unit }, { text: money(amount), bold: true }], { indent: true }),
  ];
}

/**
 * The big total. With a discount the regular price (what it would cost without it, tax included) sits to the left,
 * struck through by a red slash, and a yellow tag says how much was cut; without one, just the total.
 */
function heroTotal(label: string, total: number, regular: number | null, savedLabel: string): HTMLElement {
  const cut = regular !== null && regular - total > 0.004;
  const big = (text: string, size: string, color: string) => el("div", { fontSize: size, fontWeight: "800", color, lineHeight: "1.05", letterSpacing: "-0.5px" }, text);
  const regularPrice = cut
    ? el("div", { position: "relative", padding: "0 6px", textAlign: "center" }, undefined, [
        el("div", { fontSize: "10.5px", letterSpacing: "1.4px", color: MUTED, marginBottom: "4px" }, "REGULAR PRICE"),
        big(money(regular!), "34px", "#9ca3af"),
        // The slash: drawn as its own element so it survives html2canvas.
        el("div", { position: "absolute", left: "-4px", right: "-4px", top: "50%", height: "5px", marginTop: "-1px", background: BRAND_RED, borderRadius: "3px", transform: "rotate(-9deg)" }),
      ])
    : null;
  const yours = el("div", { textAlign: "center" }, undefined, [
    el("div", { fontSize: "10.5px", letterSpacing: "1.4px", color: cut ? BRAND_RED : MUTED, fontWeight: cut ? "700" : "400", marginBottom: "4px" }, cut ? "YOUR PRICE" : label.toUpperCase()),
    big(money(total), cut ? "54px" : "48px", BRAND_RED),
  ]);
  const tag = cut
    ? el("div", { display: "inline-block", marginTop: "10px", background: BRAND_YELLOW, color: INK, padding: "5px 16px", borderRadius: "999px", fontWeight: "800", fontSize: "14px" }, undefined, [
        el("span", {}, savedLabel),
        el("span", { marginLeft: "8px", color: BRAND_RED, fontSize: "17px" }, money(regular! - total)),
        el("span", { marginLeft: "6px", fontSize: "10.5px", fontWeight: "600" }, "tax included"),
      ])
    : null;
  return el("div", { textAlign: "center", margin: "20px 0 14px" }, undefined, [
    el("div", { display: "flex", justifyContent: "center", alignItems: "center", gap: "22px" }, undefined, [...(regularPrice ? [regularPrice, el("div", { fontSize: "30px", color: BRAND_YELLOW, fontWeight: "800" }, "→")] : []), yours]),
    ...(tag ? [tag] : []),
    ...(cut ? [el("div", { fontSize: "10.5px", color: MUTED, marginTop: "5px" }, label)] : []),
  ]);
}

/** The page as DOM, with inline styles only (the site's theme colours don't reach it). */
/**
 * The logo file for this page. The staff subdomain serves only /workbench/ paths and the public site (where shared
 * conversations open) serves the file at its root, so the path depends on where the page is open.
 */
export function defaultLogoUrl(host = typeof window === "undefined" ? "" : window.location.hostname): string {
  return /^repair\./i.test(host) ? "/workbench/logo-wide.png" : "/images/logo-wide.png";
}

export function buildQuotePage(quote: PricedQuote, now = new Date(), logoUrl = defaultLogoUrl(), sheet?: SheetPdf, soleLabor?: PdfLabor | null): HTMLElement {
  const logo = document.createElement("img");
  logo.src = logoUrl;
  // The logo file is 900 x 309: its height follows from the width.
  Object.assign(logo.style, { width: "250px", height: "86px", objectFit: "contain", display: "block", margin: "0 auto" });

  const header = el("div", { textAlign: "center", paddingBottom: "12px", position: "relative", borderBottom: `4px solid ${BRAND_YELLOW}` }, undefined, [
    logo,
    el("div", { fontSize: "12px", letterSpacing: "5px", color: MUTED, fontWeight: "600", marginTop: "6px", textTransform: "uppercase" }, "Repair Estimate"),
    el("div", { fontSize: "11px", color: "#4b5563", marginTop: "6px" }, `${company.name} · ${company.addressFull}`),
    // The short red bar over the yellow rule, in the middle.
    el("div", { position: "absolute", left: "50%", bottom: "-4px", width: "26%", height: "4px", marginLeft: "-13%", background: BRAND_RED }),
  ]);

  const position = quote.position ? ` (${toEnglish(quote.position)})` : "";
  const vehicleText = quote.vehicle === "—" ? "" : toEnglish(quote.vehicle);
  const serviceText = sheet ? `${sheet.rows.length} job${sheet.rows.length === 1 ? "" : "s"}` : `${toEnglish(quote.service)}${position}`;
  const strip = el("div", { display: "flex", justifyContent: "space-between", gap: "16px", margin: "16px 0 8px", padding: "7px 0", borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, fontSize: "12.5px" }, undefined, [
    el("div", {}, undefined, [el("span", { fontWeight: "700" }, vehicleText || "—"), el("span", { color: MUTED }, ` · ${serviceText}`)]),
    el("div", { color: MUTED }, `${shopDate(now)} · No. ${quote.id}`),
  ]);

  const tires = quote.kind === "tires";
  const unitShown = quote.kind === "tires" || quote.kind === "flat";
  const several = !sheet && quote.options.length > 1;
  const columns = (cells: Cell[]) => line(cells.map((c) => ({ ...c, color: MUTED, size: "10.5px" })), { border: true });
  const head = columns([
    { text: "Description" },
    { text: "Qty", width: COLS.qty },
    { text: unitShown ? (tires ? "Each, installed" : "Unit price") : "Price", width: COLS.unit },
    { text: "Amount" },
    ...(several ? [{ text: "After tax", width: COLS.after }] : []),
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
        return jobLines(title, r.amount, labor, i + 1);
      }
      if (r.amount !== null) {
        partsSum += r.amount;
        others = true;
      }
      return [line([{ text: `${i + 1}.  ${title}`, bold: true }, { text: "1", width: COLS.qty }, { text: "", width: COLS.unit }, { text: r.amount === null ? "To be quoted" : money(r.amount), bold: true }])];
    });
  } else {
    const labor = quote.options.length === 1 ? usableLabor(soleLabor) : null;
    const only = quote.options[0];
    if (labor && only && only.customerTotal - labor.charged >= 0) {
      breakdown = true;
      partsSum = only.customerTotal - labor.charged;
      laborList = labor.list;
      laborCharged = labor.charged;
      body = jobLines(toEnglish([only.brand, only.label].filter(Boolean).join(" ")) + (only.source === "used" ? " – used part, warranty as stated by the seller" : ""), only.customerTotal, labor, 1);
    } else {
      body = quote.options.map((o, i) =>
        line([
          { text: `${i + 1}.  ${toEnglish([o.brand, o.label].filter(Boolean).join(" "))}${quote.kind === "labor" ? " (parts & labour)" : ""}${o.source === "used" ? " – used part, warranty as stated by the seller" : ""}` },
          { text: String(o.quantity), width: COLS.qty },
          { text: unitShown ? money(o.unitPrice) : "", width: COLS.unit },
          { text: money(o.customerTotal), bold: true },
          ...(several ? [{ text: money(taxOn(o.customerTotal).total), bold: true, width: COLS.after }] : []),
        ]),
      );
    }
  }
  const list = el("div", { marginTop: "6px" }, undefined, [head, ...body]);

  const pending = sheet?.rows.some((r) => r.amount === null);
  const grand = sheet ? sheet.total : quote.options[0]?.customerTotal ?? 0;
  const sum = (label: string, value: string, o: { color?: string; bold?: boolean } = {}) =>
    el("div", { display: "flex", justifyContent: "space-between", gap: "24px", padding: "3px 0", fontSize: "13px", color: o.color ?? INK, fontWeight: o.bold ? "700" : "400" }, undefined, [el("span", {}, label), el("span", {}, value)]);
  const summaryLines: HTMLElement[] = [];
  if (breakdown) {
    summaryLines.push(sum(others ? "Parts & other items" : "Parts", money(partsSum)));
    summaryLines.push(sum(`Labor at list price`, money(laborList)));
    if (laborList - laborCharged > 0.004) summaryLines.push(sum(`Labor discount (${percentOff(laborList, laborCharged)})`, sign(laborList - laborCharged), { color: GREEN, bold: true }));
  }
  const taxed = taxOn(grand);
  const saved = laborList - laborCharged;
  const hasSaving = breakdown && saved > 0.004;
  const totalLabel = pending ? "Total so far (after tax)" : "Total (after tax)";
  const taxLines = [sum(pending ? "Subtotal so far (before tax)" : "Subtotal (before tax)", money(taxed.subtotal), { bold: true }), sum("GST (5%)", money(taxed.gst)), sum("PST (7%)", money(taxed.pst))];
  const totalRow = el("div", { display: "flex", justifyContent: "space-between", gap: "24px", marginTop: "6px", padding: "8px 0 0", borderTop: `2px solid ${INK}`, fontSize: "16px", fontWeight: "800" }, undefined, [el("span", {}, totalLabel), el("span", {}, money(taxed.total))]);
  const summary = several
    ? el("div", { fontSize: "13px", marginTop: "12px", color: "#374151" }, undefined, [
        el("div", {}, "These are alternative options; choose one."),
        ...(usableLabor(soleLabor) ? [el("div", { marginTop: "4px" }, `Labor in each option: ${hoursText(soleLabor!.hours)} at ${money(rate(soleLabor!))}/h = ${money(soleLabor!.list)}${soleLabor!.list - soleLabor!.charged > 0.004 ? `, discount ${sign(soleLabor!.list - soleLabor!.charged)} (${percentOff(soleLabor!.list, soleLabor!.charged)}), charged ${money(soleLabor!.charged)}` : ""}.`)] : []),
      ])
    : el("div", { display: "flex", justifyContent: "flex-end", marginTop: "12px" }, undefined, [
        el("div", { width: "320px" }, undefined, [
          ...summaryLines,
          ...taxLines,
          totalRow,
          ...(pending ? [el("div", { fontSize: "11.5px", color: "#4b5563", marginTop: "6px", textAlign: "right" }, "Items marked “To be quoted” will be priced once the parts are confirmed.")] : []),
        ]),
      ]);
  // The hero: the whole estimate's total, or nothing when the page lists alternatives (no single total).
  const hero = several
    ? null
    : heroTotal(pending ? "Total so far, including tax" : "Total including tax", taxed.total, hasSaving ? taxOn(grand + saved).total : null, `You save on labor (${percentOff(laborList, laborCharged)})`);

  const notes = el("div", { marginTop: "24px", fontSize: "11.5px", color: "#4b5563", lineHeight: "1.7", borderTop: `1px solid ${LINE}`, paddingTop: "10px", textAlign: "center" }, undefined, [
    el("div", {}, "GST (5%) and PST (7%) are included in the total after tax. The final price is confirmed after inspection at the shop."),
    el("div", {}, `Hours: ${company.hours}`),
    el("div", {}, `${company.phoneDisplay} (WhatsApp) · ${company.email} · WeChat ${company.wechatId}`),
  ]);

  return el(
    "div",
    {
      width: `${PAGE_WIDTH_PX}px`,
      padding: "40px 52px",
      boxSizing: "border-box",
      background: "#ffffff",
      color: INK,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    },
    undefined,
    [header, ...(hero ? [hero] : []), strip, list, summary, notes],
  );
}

export function quotePdfName(quote: Pick<PricedQuote, "id">): string {
  return `SPEEDX-Estimate-${quote.id}.pdf`;
}

export function quoteImageName(quote: Pick<PricedQuote, "id">): string {
  return `SPEEDX-Estimate-${quote.id}.png`;
}

/** Lays the page out off-screen, draws it, and hands the canvas to `draw`. */
async function withPageCanvas<T>(quote: PricedQuote, now: Date, sheet: SheetPdf | undefined, labor: PdfLabor | null | undefined, draw: (canvas: HTMLCanvasElement) => T | Promise<T>): Promise<T> {
  const { default: html2canvas } = await import("html2canvas-pro");
  const page = buildQuotePage(quote, now, undefined, sheet, labor);
  const holder = el("div", { position: "fixed", left: "-10000px", top: "0" }, undefined, [page]);
  document.body.appendChild(holder);
  try {
    await Promise.all([...page.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
    const canvas = await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    return await draw(canvas);
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
