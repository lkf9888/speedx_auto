/**
 * An ALLDATA estimate drafted in the workbench. The assistant only drafts:
 * the document is created in ALLDATA by the staff member's own browser (the
 * SPEEDX ALLDATA extension, see extensions/alldata-bridge) when they press
 * the button on the draft card. ALLDATA blocks server-side sign-in, so the
 * server never talks to ALLDATA.
 */
import { laborShortfall } from "@/lib/repair-chat/labor-minimum";

export type DraftLineKind = "part" | "labor";

export interface DraftLine {
  kind: DraftLineKind;
  description: string;
  partNumber: string;
  /** Units for parts; hours (or units, for per-item labor such as tire mounting) for labor. */
  quantity: number;
  /** Customer price per unit / per hour, before tax. */
  unitPrice: number;
  /** Shop cost per unit, when known (parts only). */
  unitCost: number | null;
  taxable: boolean;
}

export interface DraftCustomer {
  name: string;
  phone: string;
  email: string;
}

export interface AlldataDraft {
  id: string;
  title: string;
  customer: DraftCustomer | null;
  /** Free text, e.g. "2019 Toyota Camry LE"; used to pick the customer's vehicle in ALLDATA. */
  vehicle: string;
  vin: string;
  mileage: number | null;
  lines: DraftLine[];
  /** ALLDATA shop note (internal only). */
  note: string;
  createdAt: string;
  /** Set once staff created it in ALLDATA. */
  created?: AlldataCreated;
}

/** What ALLDATA gave back once the estimate was created. */
export interface AlldataCreated {
  documentId: number;
  estimateNumber: number;
  customerAttached: boolean;
}

export const MAX_DRAFT_LINES = 40;

/** The shop's ALLDATA labor rate ("Basic Labor") that every labor line is booked under. */
export const ALLDATA_LABOR_RATE = { name: "Basic Labor", id: 238899 };

const money = (value: number) => Math.round(value * 100) / 100;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Validate the assistant's draft_alldata_estimate input. */
export function parseDraftInput(input: Record<string, unknown>, id: string, now = new Date()): AlldataDraft | { error: string } {
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length === 0) return { error: "A draft needs at least one line." };
  if (rawLines.length > MAX_DRAFT_LINES) return { error: `At most ${MAX_DRAFT_LINES} lines.` };
  const lines: DraftLine[] = [];
  for (const [index, raw] of rawLines.entries()) {
    const line = (raw ?? {}) as Record<string, unknown>;
    const kind = line.kind === "labor" ? "labor" : line.kind === "part" ? "part" : null;
    const description = str(line.description, 200);
    const quantity = num(line.quantity);
    const unitPrice = num(line.unit_price);
    const unitCost = num(line.unit_cost);
    if (!kind || !description) return { error: `Line ${index + 1}: kind and description are required.` };
    if (quantity === null || quantity <= 0 || quantity > 999) return { error: `Line ${index + 1}: quantity must be between 0 and 999.` };
    if (unitPrice === null || unitPrice < 0 || unitPrice > 100_000) return { error: `Line ${index + 1}: unit_price is missing or out of range.` };
    lines.push({
      kind,
      description,
      partNumber: str(line.part_number, 60),
      quantity: money(quantity),
      unitPrice: money(unitPrice),
      unitCost: kind === "part" && unitCost !== null && unitCost >= 0 ? money(unitCost) : null,
      taxable: line.taxable !== false,
    });
  }
  // The shop bills at least 0.5 h of labor per order.
  const laborLines = lines.filter((l) => l.kind === "labor");
  const shortfall = laborShortfall(laborLines.map((l) => l.quantity));
  if (shortfall && lines.length < MAX_DRAFT_LINES) {
    lines.push({ kind: "labor", description: "Minimum labor charge (order under 0.5 h)", partNumber: "", quantity: shortfall, unitPrice: laborLines[0].unitPrice, unitCost: null, taxable: true });
  }
  const customerRaw = (input.customer ?? null) as Record<string, unknown> | null;
  const customer =
    customerRaw && (str(customerRaw.name, 80) || str(customerRaw.phone, 40))
      ? { name: str(customerRaw.name, 80), phone: str(customerRaw.phone, 40), email: str(customerRaw.email, 120) }
      : null;
  const mileage = num(input.mileage);
  return {
    id,
    title: str(input.title, 80) || lines[0].description,
    customer,
    vehicle: str(input.vehicle, 120),
    vin: str(input.vin, 17).toUpperCase(),
    mileage: mileage !== null && mileage >= 0 && mileage < 2_000_000 ? Math.round(mileage) : null,
    lines,
    note: str(input.note, 500),
    createdAt: now.toISOString(),
  };
}

export function lineTotal(line: DraftLine): number {
  return money(line.quantity * line.unitPrice);
}

export function draftTotals(draft: Pick<AlldataDraft, "lines">): { parts: number; labor: number; subtotal: number; cost: number | null } {
  const parts = money(draft.lines.filter((l) => l.kind === "part").reduce((sum, l) => sum + lineTotal(l), 0));
  const labor = money(draft.lines.filter((l) => l.kind === "labor").reduce((sum, l) => sum + lineTotal(l), 0));
  const partLines = draft.lines.filter((l) => l.kind === "part");
  const cost = partLines.length && partLines.every((l) => l.unitCost !== null) ? money(partLines.reduce((sum, l) => sum + l.unitCost! * l.quantity, 0)) : null;
  return { parts, labor, subtotal: money(parts + labor), cost };
}

/**
 * Line items in the shape ALLDATA Shop Manager's own "Custom Part" and
 * "Custom Labor" entries send (captured from its web app).
 */
export function toAlldataDatalines(lines: DraftLine[]): Record<string, unknown>[] {
  return lines.map((line, index) => {
    const common = {
      articleUrl: "Not found",
      description: line.description,
      lineNumber: index + 1,
      itemId: index + 1,
      quantityOrHours: line.quantity,
      priceRate: line.unitPrice,
      total: lineTotal(line),
      skill: "No Skill",
      taxable: line.taxable,
      autoZone: false,
      markedUpHours: null,
      markupAmount: null,
      markupCalcMethodRefCd: null,
      markupTypeRefCd: null,
      datalineId: null,
      hidden: null,
    };
    if (line.kind === "labor") {
      return {
        ...common,
        itemName: "Labor",
        lineTypeId: 6,
        partNumber: ALLDATA_LABOR_RATE.name,
        laborRate: ALLDATA_LABOR_RATE.name,
        laborRateId: ALLDATA_LABOR_RATE.id,
        cost: line.unitPrice,
      };
    }
    return {
      ...common,
      itemName: "Part",
      lineTypeId: 5,
      partNumber: line.partNumber || "—",
      laborRate: null,
      laborRateId: null,
      cost: line.unitCost ?? 0,
    };
  });
}

/** What the model reads back after drafting. */
export function summarizeDraft(draft: AlldataDraft): string {
  const totals = draftTotals(draft);
  const lines = draft.lines
    .map((l, i) => `${i + 1}. [${l.kind}] ${l.description}${l.partNumber ? ` #${l.partNumber}` : ""} ${l.quantity} × $${l.unitPrice} = $${lineTotal(l)}`)
    .join("\n");
  return [
    `ALLDATA estimate draft ${draft.id} shown to staff as a card. It is NOT in ALLDATA yet: staff check it and press the create button themselves.`,
    `Customer: ${draft.customer ? [draft.customer.name, draft.customer.phone].filter(Boolean).join(", ") : "none"}. Vehicle: ${draft.vehicle || "—"}.`,
    lines,
    `Subtotal before tax $${totals.subtotal} (parts $${totals.parts}, labor $${totals.labor}). ALLDATA adds GST/PST.`,
  ].join("\n");
}
