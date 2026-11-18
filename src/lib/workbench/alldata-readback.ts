/**
 * After a draft is created in ALLDATA, the workbench reads the document back
 * and compares it with the card staff confirmed, field by field. The compare
 * is pure: it works on what the extension's readDocument returns (no customer
 * details, only whether one is attached) and the AlldataDraft on the card.
 */
import { lineTotal, type AlldataDraft } from "./alldata-draft";

/** The shop's tax rates as ALLDATA has them in Settings (GST on, PST per document). */
export const GST_RATE = 0.05;
export const PST_RATE = 0.07;

const money = (value: number) => Math.round(value * 100) / 100;

/** A document as read back from ALLDATA (see the extension's readDocument). */
export interface AlldataReadback {
  documentId: number;
  version: number;
  state: string;
  documentNumber: number;
  /** A Draft or an Estimate that isn't voided: the only documents ALLDATA lets anyone change (invoices are read-only). */
  editable: boolean;
  voided: boolean;
  /** History events such as "Created" and "Printed"; null when ALLDATA didn't give them. */
  events: string[] | null;
  customerAttached: boolean;
  /** The attached customer's ALLDATA id (not their details), to check a change of customer. */
  customerId: number | null;
  mileageIn: number;
  technician: string;
  serviceWriter: string;
  shopNote: string;
  lines: Array<{
    datalineId: number | null;
    lineTypeId: number;
    description: string;
    partNumber: string;
    quantityOrHours: number | null;
    priceRate: number;
    cost: number;
    markupAmount: number;
    total: number;
    taxable: boolean;
  }>;
  totals: { parts: number; labor: number; flatFee: number; discount: number; subTotal: number; gst: number; pst: number; hst: number; tax: number; total: number };
}

export interface ExpectedTotals {
  parts: number;
  labor: number;
  subTotal: number;
  gst: number;
  pst: number;
  total: number;
}

/**
 * What the card promises before tax is added by ALLDATA: GST (and PST when
 * the staff said to charge it) on the taxable lines. Draft lines are parts
 * and labor only, so ALLDATA's quirk of taxing a non-taxable discount at its
 * pre-discount price doesn't come into play yet.
 */
export function expectedTotals(draft: Pick<AlldataDraft, "lines">, chargePst: boolean, rates: { gst: number; pst: number } = { gst: GST_RATE, pst: PST_RATE }): ExpectedTotals {
  const parts = money(draft.lines.filter((l) => l.kind === "part").reduce((sum, l) => sum + lineTotal(l), 0));
  const labor = money(draft.lines.filter((l) => l.kind === "labor").reduce((sum, l) => sum + lineTotal(l), 0));
  const taxable = draft.lines.filter((l) => l.taxable).reduce((sum, l) => sum + lineTotal(l), 0);
  const subTotal = money(parts + labor);
  const gst = money(taxable * rates.gst);
  const pst = chargePst ? money(taxable * rates.pst) : 0;
  return { parts, labor, subTotal, gst, pst, total: money(subTotal + gst + pst) };
}

export interface ReadbackCheck {
  field: string;
  expected: string;
  actual: string;
  ok: boolean;
}

export interface ReadbackOptions {
  /** The shop note the extension was asked to write. */
  shopNote: string;
  mileage: number | null;
  customerAttached: boolean;
  chargePst: boolean;
  technician?: string;
  serviceWriter?: string;
  /** Expected document state: "Draft" for a draft, "Estimate" once converted. */
  state?: string;
  /** The rates switched on in ALLDATA Settings when known; defaults to 5% GST and 7% PST. */
  rates?: { gst: number; pst: number };
}

const same = (a: number, b: number, tolerance = 0.011) => Math.abs(a - b) <= tolerance;
const usd = (value: number) => value.toFixed(2);

export function checkReadback(draft: Pick<AlldataDraft, "lines">, doc: AlldataReadback, options: ReadbackOptions): { ok: boolean; checks: ReadbackCheck[] } {
  const checks: ReadbackCheck[] = [];
  const add = (field: string, expected: string | number | boolean, actual: string | number | boolean, ok?: boolean) => {
    const e = String(expected);
    const a = String(actual);
    checks.push({ field, expected: e, actual: a, ok: ok ?? e === a });
  };

  add("单据状态", options.state ?? "Draft", doc.state);
  add("关联客户", options.customerAttached, doc.customerAttached);
  add("里程 (km)", options.mileage ?? 0, doc.mileageIn);
  add("技师", options.technician ?? "Jason", doc.technician);
  add("服务顾问", options.serviceWriter ?? "Kevin", doc.serviceWriter);
  add("内部备注", options.shopNote, doc.shopNote);
  add("行数", draft.lines.length, doc.lines.length);

  draft.lines.forEach((line, i) => {
    const got = doc.lines[i];
    const n = `第 ${i + 1} 行`;
    if (!got) {
      add(`${n} 存在`, "是", "没有");
      return;
    }
    add(`${n} 类型`, line.kind === "labor" ? 6 : 5, got.lineTypeId);
    add(`${n} 描述`, line.description, got.description);
    if (line.kind === "part") add(`${n} 零件号`, line.partNumber || "—", got.partNumber);
    add(`${n} 数量/小时`, line.quantity, got.quantityOrHours ?? 0, same(line.quantity, got.quantityOrHours ?? 0));
    add(`${n} 单价`, usd(line.unitPrice), usd(got.priceRate), same(line.unitPrice, got.priceRate));
    add(`${n} 金额`, usd(lineTotal(line)), usd(got.total), same(lineTotal(line), got.total));
    add(`${n} 计税`, line.taxable, got.taxable);
    if (line.kind === "part") {
      // The cost the card shows is the one ALLDATA must keep; with no cost known ALLDATA holds the price as the cost.
      // A cost above the price can't be kept (ALLDATA has no negative markup), so that line is flagged here.
      const cost = line.unitCost ?? line.unitPrice;
      add(`${n} 进价`, usd(cost), usd(got.cost), same(cost, got.cost));
    }
  });

  const want = expectedTotals(draft, options.chargePst, options.rates);
  const t = doc.totals;
  add("零件合计", usd(want.parts), usd(t.parts), same(want.parts, t.parts));
  add("工时合计", usd(want.labor), usd(t.labor), same(want.labor, t.labor));
  add("税前合计", usd(want.subTotal), usd(t.subTotal), same(want.subTotal, t.subTotal));
  add("GST", usd(want.gst), usd(t.gst), same(want.gst, t.gst, 0.02));
  add("PST", usd(want.pst), usd(t.pst), same(want.pst, t.pst, 0.02));
  add("含税合计", usd(want.total), usd(t.total), same(want.total, t.total, 0.03));

  return { ok: checks.every((c) => c.ok), checks };
}
