/**
 * Changing a draft or an estimate that already exists in ALLDATA (改零件 / 改工时 / 改价 / 加减项目 /
 * 改客户 / 查单). The assistant only proposes the change; the staff member's browser reads the document,
 * this module works out the before/after and which confirmation gates the change trips, and the extension
 * saves it only after staff press the button. Nothing here talks to ALLDATA.
 */
import { isReleased, type GateReleases } from "./alldata-gates";
import type { OpDetail } from "./alldata-oplog";
import type { AlldataReadback } from "./alldata-readback";
import type { ReadbackCheck } from "./alldata-readback";

const money = (value: number) => Math.round(value * 100) / 100;
const str = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** ALLDATA's technicians and service writers (Settings → Shop Info, 2026-11-17). */
export const ALLDATA_TECHNICIANS: Record<string, number> = { Jason: 270227, LI: 471405, "Mr. Liu": 270226, Zhenjing: 364525 };
export const ALLDATA_WRITERS: Record<string, number> = { Amber: 279710, Jason: 279711, Kevin: 276708, Steven: 271766 };

/** The owner's confirmation gate on money (2026-11-17): a change of at least $50 or 10% of the document, whichever is smaller. */
export const AMOUNT_GATE = { dollars: 50, percent: 0.1 };

export type AddKind = "part" | "labor" | "flat_fee" | "discount";

export interface LineRef {
  /** 1-based, as the lines are listed on the card. */
  line?: number;
  /** Words from the line's description (must match exactly one line). */
  contains?: string;
  partNumber?: string;
}

export type ChangeOp =
  | { op: "set_line"; ref: LineRef; description?: string; partNumber?: string; quantity?: number; unitPrice?: number; taxable?: boolean }
  | { op: "remove_line"; ref: LineRef }
  | { op: "add_line"; kind: AddKind; description: string; partNumber: string; quantity: number; unitPrice: number; unitCost: number | null; taxable: boolean }
  | { op: "set_header"; mileage?: number; shopNote?: string; technician?: string; serviceWriter?: string }
  | { op: "set_customer"; search: string };

export interface AlldataChangeRequest {
  id: string;
  /** The document: its id when the conversation made it, or something to search for (a number, a name, a phone). */
  document: { documentId: number | null; query: string };
  ops: ChangeOp[];
  /** Why, in the staff member's words. */
  reason: string;
  createdAt: string;
  /** Set once the change was applied in ALLDATA. */
  applied?: { at: string; documentId: number; version: number };
}

export const MAX_OPS = 20;

function parseRef(raw: unknown): LineRef | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const line = num(r.line);
  const ref: LineRef = {};
  if (line !== null && Number.isInteger(line) && line >= 1 && line <= 60) ref.line = line;
  const contains = str(r.contains, 80);
  if (contains) ref.contains = contains;
  const partNumber = str(r.part_number, 60);
  if (partNumber) ref.partNumber = partNumber;
  return ref.line || ref.contains || ref.partNumber ? ref : null;
}

/** Validate the assistant's propose_alldata_change input. */
export function parseChangeInput(input: Record<string, unknown>, id: string, now = new Date()): AlldataChangeRequest | { error: string } {
  const doc = (input.document ?? {}) as Record<string, unknown>;
  const documentId = num(doc.document_id);
  const query = str(doc.query, 80);
  if ((documentId === null || !Number.isInteger(documentId) || documentId <= 0) && !query) return { error: "Name the document: its document_id from this conversation, or a number / name / phone to search." };
  const rawOps = Array.isArray(input.ops) ? input.ops : [];
  if (rawOps.length > MAX_OPS) return { error: `At most ${MAX_OPS} changes at a time.` };
  const ops: ChangeOp[] = [];
  for (const [index, entry] of rawOps.entries()) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const n = `Change ${index + 1}`;
    if (o.op === "set_line") {
      const ref = parseRef(o.ref);
      if (!ref) return { error: `${n}: say which line (line number, words from its description, or part number).` };
      const op: ChangeOp = { op: "set_line", ref };
      const description = str(o.description, 200);
      if (description) op.description = description;
      const partNumber = str(o.part_number, 60);
      if (partNumber) op.partNumber = partNumber;
      if (o.quantity !== undefined && o.quantity !== null) {
        const q = num(o.quantity);
        if (q === null || q <= 0 || q > 999) return { error: `${n}: quantity must be between 0 and 999.` };
        op.quantity = money(q);
      }
      if (o.unit_price !== undefined && o.unit_price !== null) {
        const p = num(o.unit_price);
        if (p === null || p < 0 || p > 100_000) return { error: `${n}: unit_price is out of range.` };
        op.unitPrice = money(p);
      }
      if (typeof o.taxable === "boolean") op.taxable = o.taxable;
      if (Object.keys(op).length === 2) return { error: `${n}: nothing to change on that line.` };
      ops.push(op);
    } else if (o.op === "remove_line") {
      const ref = parseRef(o.ref);
      if (!ref) return { error: `${n}: say which line to remove.` };
      ops.push({ op: "remove_line", ref });
    } else if (o.op === "add_line") {
      const kind = o.kind === "part" || o.kind === "labor" || o.kind === "flat_fee" || o.kind === "discount" ? o.kind : null;
      const description = str(o.description, 200);
      const price = num(o.unit_price);
      const quantity = kind === "flat_fee" || kind === "discount" ? 1 : num(o.quantity);
      if (!kind || !description) return { error: `${n}: kind and description are required.` };
      if (price === null || price < 0 || price > 100_000) return { error: `${n}: unit_price is missing or out of range.` };
      if (quantity === null || quantity <= 0 || quantity > 999) return { error: `${n}: quantity must be between 0 and 999.` };
      const cost = num(o.unit_cost);
      ops.push({
        op: "add_line",
        kind,
        description,
        partNumber: str(o.part_number, 60),
        quantity: money(quantity),
        unitPrice: money(price),
        unitCost: kind === "part" && cost !== null && cost >= 0 ? money(cost) : null,
        taxable: kind === "discount" ? o.taxable === true : o.taxable !== false,
      });
    } else if (o.op === "set_header") {
      const op: ChangeOp = { op: "set_header" };
      const mileage = num(o.mileage);
      if (mileage !== null) {
        if (mileage < 0 || mileage >= 2_000_000) return { error: `${n}: mileage is out of range.` };
        op.mileage = Math.round(mileage);
      }
      if (typeof o.shop_note === "string") op.shopNote = str(o.shop_note, 500);
      const technician = str(o.technician, 40);
      if (technician) {
        if (!(technician in ALLDATA_TECHNICIANS)) return { error: `${n}: unknown technician. Choose from ${Object.keys(ALLDATA_TECHNICIANS).join(", ")}.` };
        op.technician = technician;
      }
      const writer = str(o.service_writer, 40);
      if (writer) {
        if (!(writer in ALLDATA_WRITERS)) return { error: `${n}: unknown service writer. Choose from ${Object.keys(ALLDATA_WRITERS).join(", ")}.` };
        op.serviceWriter = writer;
      }
      if (Object.keys(op).length === 1) return { error: `${n}: nothing to change in the header.` };
      ops.push(op);
    } else if (o.op === "set_customer") {
      const search = str(o.search, 80);
      if (!search) return { error: `${n}: give a phone or name to find the new customer.` };
      ops.push({ op: "set_customer", search });
    } else {
      return { error: `${n}: unknown change type.` };
    }
  }
  return {
    id,
    document: { documentId: documentId !== null && Number.isInteger(documentId) && documentId > 0 ? documentId : null, query },
    ops,
    reason: str(input.reason, 300),
    createdAt: now.toISOString(),
  };
}

// ------------------------------------------------------------------ the document's lines

export type LineKind = "part" | "labor" | "flat_fee" | "discount" | "other";

export interface DocLine {
  datalineId: number | null;
  typeId: number;
  kind: LineKind;
  description: string;
  partNumber: string;
  quantity: number | null;
  /** What the customer pays per unit (a part's price includes its markup). */
  unitPrice: number;
  cost: number;
  total: number;
  taxable: boolean;
  /** Custom part, custom labor, flat fee and labor discount can be changed here; catalog lines and job groups can't. */
  editable: boolean;
}

const EDITABLE_TYPES = [5, 6, 7, 18];

function kindOf(typeId: number): LineKind {
  if (typeId === 5 || typeId === 1) return "part";
  if (typeId === 6 || typeId === 2) return "labor";
  if (typeId === 7) return "flat_fee";
  if (typeId === 17 || typeId === 18) return "discount";
  return "other";
}

export function docLines(doc: Pick<AlldataReadback, "lines">): DocLine[] {
  return doc.lines.map((l) => ({
    datalineId: l.datalineId ?? null,
    typeId: l.lineTypeId,
    kind: kindOf(l.lineTypeId),
    description: l.description,
    partNumber: l.partNumber,
    quantity: l.quantityOrHours,
    unitPrice: l.priceRate,
    cost: l.cost,
    total: l.total,
    taxable: l.taxable,
    editable: EDITABLE_TYPES.includes(l.lineTypeId) && l.datalineId != null,
  }));
}

/** A part's price is cost + markup: keep the shop's cost when the price is above it, else book the price as the cost. */
export function partPricing(unitPrice: number, currentCost: number | null): { cost: number; markup: number } {
  const cost = currentCost !== null && currentCost >= 0 && currentCost < unitPrice ? currentCost : unitPrice;
  return { cost: money(cost), markup: money(unitPrice - cost) };
}

export function resolveRef(lines: DocLine[], ref: LineRef): { index: number } | { error: string } {
  if (ref.line) {
    return ref.line <= lines.length ? { index: ref.line - 1 } : { error: `There is no line ${ref.line} (the document has ${lines.length}).` };
  }
  const matches = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => (ref.partNumber ? l.partNumber.toLowerCase() === ref.partNumber.toLowerCase() : true) && (ref.contains ? l.description.toLowerCase().includes(ref.contains.toLowerCase()) : true));
  if (matches.length === 1) return { index: matches[0].i };
  const what = ref.partNumber ? `part number ${ref.partNumber}` : `"${ref.contains}"`;
  return { error: matches.length === 0 ? `No line matches ${what}.` : `${matches.length} lines match ${what}; give the line number.` };
}

// ------------------------------------------------------------------ the plan: what would be saved

export interface Taxes {
  gst: { apply: boolean; rate: number };
  pst: { apply: boolean; rate: number };
  hst: { apply: boolean; rate: number };
}

/** The edits the extension's saveDocument takes. */
export interface SaveEdits {
  updates: Array<{ datalineId: number; description?: string; partNumber?: string; quantity?: number; unitPrice?: number; taxable?: boolean }>;
  removes: number[];
  adds: Array<{ kind: AddKind; description: string; partNumber: string; quantity: number; unitPrice: number; unitCost: number | null; taxable: boolean }>;
  header: { mileageIn?: number; shopNote?: string; technicianId?: number; serviceWriterId?: number };
}

export interface DiffRow {
  kind: "changed" | "added" | "removed" | "header";
  label: string;
  before: string;
  after: string;
}

export interface Predicted {
  lines: DocLine[];
  subTotal: number;
  tax: number;
  total: number;
  /** True when the document has lines this module can't price (catalog parts, job groups): the totals are the old totals plus this change. */
  approximate: boolean;
}

export interface ChangePlan {
  edits: SaveEdits;
  diff: DiffRow[];
  /** Changes that could not be placed (unknown line, ambiguous words). The rest of the change is not applied while any exist. */
  problems: string[];
  customerSearch: string | null;
  predicted: Predicted;
  before: { subTotal: number; total: number };
  header: { mileage: number; shopNote: string; technician: string; serviceWriter: string };
}

const usd = (v: number) => (v < 0 ? `-$${(-v).toFixed(2)}` : `$${v.toFixed(2)}`);
const label = (l: DocLine, i: number) => `第 ${i + 1} 行 ${l.description.slice(0, 40)}`;

function lineTotal(l: Pick<DocLine, "kind" | "typeId" | "quantity" | "unitPrice">): number {
  if (l.typeId === 7 || l.typeId === 18 || l.typeId === 17) return money(l.unitPrice);
  return money((l.quantity ?? 1) * l.unitPrice);
}

function rates(taxes: Taxes | null, fallbackPst: boolean) {
  const gst = taxes ? (taxes.gst.apply ? taxes.gst.rate / 100 : 0) : 0.05;
  const pst = taxes ? (taxes.pst.apply ? taxes.pst.rate / 100 : 0) : fallbackPst ? 0.07 : 0;
  const hst = taxes ? (taxes.hst.apply ? taxes.hst.rate / 100 : 0) : 0;
  return gst + pst + hst;
}

/**
 * ALLDATA taxes the taxable lines at the rates switched on in Settings at the moment of the save
 * (a discount line that isn't marked taxable doesn't reduce the taxed amount).
 */
export function predict(lines: DocLine[], before: AlldataReadback, taxes: Taxes | null): Predicted {
  const known = lines.every((l) => l.kind !== "other");
  const rate = rates(taxes, before.totals.pst > 0);
  if (known) {
    const subTotal = money(lines.reduce((s, l) => s + l.total, 0));
    const base = lines.filter((l) => l.taxable).reduce((s, l) => s + l.total, 0);
    const tax = money(base * rate);
    return { lines, subTotal, tax, total: money(subTotal + tax), approximate: false };
  }
  // Catalog lines or job groups: start from ALLDATA's own numbers and add this change's effect. The taxed amount before
  // is worked out from the tax ALLDATA charged and the rates that were on, so a PST switched on or off since still counts.
  const oldById = new Map(docLines(before).map((l) => [l.datalineId, l]));
  let deltaSub = 0;
  let deltaBase = 0;
  const seen = new Set<number | null>();
  for (const l of lines) {
    const old = l.datalineId !== null ? oldById.get(l.datalineId) : undefined;
    seen.add(l.datalineId);
    deltaSub += l.total - (old?.total ?? 0);
    deltaBase += (l.taxable ? l.total : 0) - (old && old.taxable ? old.total : 0);
  }
  for (const old of oldById.values()) {
    if (!seen.has(old.datalineId)) {
      deltaSub -= old.total;
      deltaBase -= old.taxable ? old.total : 0;
    }
  }
  // The amount ALLDATA taxed before: worked back from the tax it charged and today's rates, but never less than the sum of the
  // positive lines. Rates may have changed since the document was saved (then the first figure is wrong) and discounts and
  // non-taxable lines don't count (then the second is high); taking the larger can only make the money gate trip sooner.
  const rateThen = taxes
    ? (before.totals.gst > 0 ? taxes.gst.rate / 100 : 0) + (before.totals.pst > 0 ? taxes.pst.rate / 100 : 0) + (before.totals.hst > 0 ? taxes.hst.rate / 100 : 0)
    : 0;
  const positive = docLines(before).reduce((sum, l) => sum + Math.max(l.total, 0), 0);
  const baseBefore = Math.max(rateThen > 0 ? before.totals.tax / rateThen : 0, positive);
  const subTotal = money(before.totals.subTotal + deltaSub);
  const tax = money((baseBefore + deltaBase) * rate);
  return { lines, subTotal, tax, total: money(subTotal + tax), approximate: true };
}

export function planChange(doc: AlldataReadback, ops: ChangeOp[], taxes: Taxes | null): ChangePlan {
  const original = docLines(doc);
  let lines = original.map((l) => ({ ...l }));
  const edits: SaveEdits = { updates: [], removes: [], adds: [], header: {} };
  const diff: DiffRow[] = [];
  const problems: string[] = [];
  let customerSearch: string | null = null;
  const header = { mileage: doc.mileageIn, shopNote: doc.shopNote, technician: doc.technician, serviceWriter: doc.serviceWriter };

  // Lines are found by their position on the document as it is now, not as it is after earlier changes in this request.
  const removedIndexes = new Set<number>();
  const touchedIndexes = new Set<number>();
  const added: DocLine[] = [];
  for (const op of ops) {
    if (op.op === "set_line" || op.op === "remove_line") {
      const found = resolveRef(original, op.ref);
      if ("error" in found) {
        problems.push(found.error);
        continue;
      }
      const base = original[found.index];
      const n = label(base, found.index);
      if (removedIndexes.has(found.index) || touchedIndexes.has(found.index)) {
        problems.push(`${n} 在这次修改里已经动过了，同一行请合并成一项再提。`);
        continue;
      }
      touchedIndexes.add(found.index);
      if (op.op === "remove_line") {
        if (base.datalineId === null) {
          problems.push(`${n} 没有行编号，无法删除。`);
          continue;
        }
        removedIndexes.add(found.index);
        edits.removes.push(base.datalineId);
        diff.push({ kind: "removed", label: n, before: `${base.quantity ?? ""}${base.quantity !== null ? " × " : ""}${usd(base.unitPrice)} = ${usd(base.total)}`, after: "删除" });
        continue;
      }
      if (!base.editable || base.datalineId === null) {
        problems.push(`${n} 是目录零件、套餐或备注，工作台不能改，请在 ALLDATA 里改。`);
        continue;
      }
      const target = lines[found.index];
      const update: SaveEdits["updates"][number] = { datalineId: base.datalineId };
      const before: string[] = [];
      const after: string[] = [];
      if (op.description !== undefined && op.description !== target.description) {
        update.description = op.description;
        before.push(`描述 ${target.description}`);
        after.push(`描述 ${op.description}`);
        target.description = op.description;
      }
      if (op.partNumber !== undefined && base.typeId === 5 && op.partNumber !== target.partNumber) {
        update.partNumber = op.partNumber;
        before.push(`零件号 ${target.partNumber || "—"}`);
        after.push(`零件号 ${op.partNumber}`);
        target.partNumber = op.partNumber;
      }
      if (op.quantity !== undefined && base.typeId !== 7 && base.typeId !== 18 && op.quantity !== target.quantity) {
        update.quantity = op.quantity;
        before.push(`${base.kind === "labor" ? "小时" : "数量"} ${target.quantity}`);
        after.push(`${base.kind === "labor" ? "小时" : "数量"} ${op.quantity}`);
        target.quantity = op.quantity;
      }
      if (op.unitPrice !== undefined) {
        const price = base.typeId === 18 ? -Math.abs(op.unitPrice) : op.unitPrice;
        if (price !== target.unitPrice) {
          update.unitPrice = op.unitPrice;
          before.push(`单价 ${usd(target.unitPrice)}`);
          after.push(`单价 ${usd(price)}`);
          target.unitPrice = price;
          if (base.typeId === 5) target.cost = partPricing(price, base.cost).cost;
          else if (base.typeId === 6 || base.typeId === 18) target.cost = price;
        }
      }
      if (op.taxable !== undefined && op.taxable !== target.taxable) {
        update.taxable = op.taxable;
        before.push(`计税 ${target.taxable ? "是" : "否"}`);
        after.push(`计税 ${op.taxable ? "是" : "否"}`);
        target.taxable = op.taxable;
      }
      if (before.length === 0) continue;
      target.total = lineTotal(target);
      edits.updates.push(update);
      diff.push({ kind: "changed", label: n, before: before.join("；"), after: after.join("；") });
    } else if (op.op === "add_line") {
      const unitPrice = op.kind === "discount" ? -Math.abs(op.unitPrice) : op.unitPrice;
      const typeId = op.kind === "part" ? 5 : op.kind === "labor" ? 6 : op.kind === "flat_fee" ? 7 : 18;
      const line: DocLine = {
        datalineId: null,
        typeId,
        kind: op.kind === "flat_fee" ? "flat_fee" : op.kind,
        description: op.description,
        partNumber: op.kind === "part" ? op.partNumber || "—" : "",
        quantity: op.kind === "flat_fee" || op.kind === "discount" ? null : op.quantity,
        unitPrice,
        cost: op.kind === "part" ? partPricing(op.unitPrice, op.unitCost).cost : unitPrice,
        total: 0,
        taxable: op.taxable,
        editable: true,
      };
      line.total = lineTotal(line);
      added.push(line);
      edits.adds.push({ kind: op.kind, description: op.description, partNumber: op.partNumber, quantity: op.quantity, unitPrice: op.unitPrice, unitCost: op.unitCost, taxable: op.taxable });
      const name = { part: "零件", labor: "工时", flat_fee: "一口价", discount: "折扣" }[op.kind];
      diff.push({
        kind: "added",
        label: `新增${name}`,
        before: "—",
        after: `${op.description}${op.kind === "part" && op.partNumber ? ` #${op.partNumber}` : ""} ${line.quantity !== null ? `${line.quantity} × ` : ""}${usd(unitPrice)} = ${usd(line.total)}${line.taxable ? "" : "（不计税）"}`,
      });
    } else if (op.op === "set_header") {
      if (op.mileage !== undefined && op.mileage !== doc.mileageIn) {
        edits.header.mileageIn = op.mileage;
        diff.push({ kind: "header", label: "里程 (km)", before: String(doc.mileageIn), after: String(op.mileage) });
        header.mileage = op.mileage;
      }
      if (op.shopNote !== undefined && op.shopNote !== doc.shopNote) {
        edits.header.shopNote = op.shopNote;
        diff.push({ kind: "header", label: "内部备注", before: doc.shopNote || "（空）", after: op.shopNote || "（空）" });
        header.shopNote = op.shopNote;
      }
      if (op.technician !== undefined && op.technician !== doc.technician) {
        edits.header.technicianId = ALLDATA_TECHNICIANS[op.technician];
        diff.push({ kind: "header", label: "技师", before: doc.technician, after: op.technician });
        header.technician = op.technician;
      }
      if (op.serviceWriter !== undefined && op.serviceWriter !== doc.serviceWriter) {
        edits.header.serviceWriterId = ALLDATA_WRITERS[op.serviceWriter];
        diff.push({ kind: "header", label: "服务顾问", before: doc.serviceWriter, after: op.serviceWriter });
        header.serviceWriter = op.serviceWriter;
      }
    } else if (op.op === "set_customer") {
      customerSearch = op.search;
    }
  }
  lines = [...lines.filter((_, i) => !removedIndexes.has(i)), ...added];
  const predicted = predict(lines, doc, taxes);
  return { edits, diff, problems, customerSearch, predicted, before: { subTotal: doc.totals.subTotal, total: doc.totals.total }, header };
}

/** What the operation log keeps about a change: counts and money only (the server writes the summary line). */
export function changeDetail(plan: Pick<ChangePlan, "edits" | "predicted" | "before" | "customerSearch">): OpDetail {
  return {
    updates: plan.edits.updates.length,
    adds: plan.edits.adds.length,
    removes: plan.edits.removes.length,
    header: Object.keys(plan.edits.header).length,
    customerChange: Boolean(plan.customerSearch),
    before: plan.before.total,
    after: plan.predicted.total,
  };
}

// ------------------------------------------------------------------ confirmation gates

export interface Gate {
  id: "locked" | "amount" | "sent" | "customer";
  label: string;
  reason: string;
}

export interface GateResult {
  /** The document can't be changed at all. */
  blocked: string | null;
  /** Gates that need the owner's explicit yes for this exact change. */
  gates: Gate[];
  /** Gates this change trips that the owner has let go ahead for this conversation: no tick needed. */
  released: Gate[];
  /** Change in the document total, tax included. */
  delta: number;
  /** The amount at which the money gate trips for this document. */
  threshold: number;
}

/** The owner's rule as he gave it: the smaller of $50 and 10% of the document. A document worth nothing yet has a threshold of $0: any change of money needs his yes. */
export function amountThreshold(beforeTotal: number): number {
  return Math.min(AMOUNT_GATE.dollars, money(Math.max(beforeTotal, 0) * AMOUNT_GATE.percent));
}

export function evaluateGates(doc: AlldataReadback, plan: Pick<ChangePlan, "predicted" | "before" | "customerSearch">, changesCustomer: boolean, releases?: GateReleases): GateResult {
  const delta = money(plan.predicted.total - plan.before.total);
  const threshold = amountThreshold(plan.before.total);
  const gates: Gate[] = [];
  let blocked: string | null = null;
  if (!doc.editable) blocked = doc.voided ? "这张单已作废，只读，不能修改。" : `这张单是 ${doc.state}，ALLDATA 规定发票和已锁定的单据不能修改。需要改就在 ALLDATA 里作废后重开，由 Kevin 处理。`;
  if (delta !== 0 && Math.abs(delta) >= threshold) {
    gates.push({ id: "amount", label: "金额变动超过阈值", reason: `合计变动 ${delta >= 0 ? "+" : "-"}${usd(Math.abs(delta))}，阈值 ${usd(threshold)}（$50 或单据金额 10%，取较小者）` });
  }
  const sent = (doc.events ?? []).filter((e) => /print|email|send|sent/i.test(e));
  if (doc.state !== "Draft" && sent.length > 0) {
    gates.push({ id: "sent", label: "已打印 / 发送过的单据", reason: "这张单打印或发送过，客人可能已经看到旧版本，改动需要 Kevin 确认。" });
  } else if (doc.state !== "Draft" && doc.events === null) {
    gates.push({ id: "sent", label: "读不到这张单的打印记录", reason: "无法确认客人有没有看过旧版本，按已发送处理，改动需要 Kevin 确认。" });
  }
  if (changesCustomer) gates.push({ id: "customer", label: "更换客户", reason: "会把这张单改挂到另一位客户名下。" });
  // A locked document is never opened by a release; the rest follow the owner's releases for this conversation.
  const released = gates.filter((g) => g.id !== "locked" && isReleased(releases, g.id));
  return { blocked, gates: gates.filter((g) => !released.includes(g)), released, delta, threshold };
}

// ------------------------------------------------------------------ check after saving

export function checkChange(plan: ChangePlan, after: AlldataReadback, expected: { customerId?: number } = {}): { ok: boolean; checks: ReadbackCheck[] } {
  const checks: ReadbackCheck[] = [];
  const add = (field: string, expected: string | number | boolean, actual: string | number | boolean, ok?: boolean) => {
    const e = String(expected);
    const a = String(actual);
    checks.push({ field, expected: e, actual: a, ok: ok ?? e === a });
  };
  const close = (a: number, b: number, t = 0.011) => Math.abs(a - b) <= t;
  const got = docLines(after);
  const want = plan.predicted.lines;
  add("行数", want.length, got.length);
  want.forEach((w, i) => {
    const g = got[i];
    const n = `第 ${i + 1} 行`;
    if (!g) return add(`${n} 存在`, "是", "没有");
    add(`${n} 描述`, w.description, g.description);
    if (w.typeId === 5) add(`${n} 零件号`, w.partNumber || "—", g.partNumber || "—");
    if (w.kind !== "other") {
      add(`${n} 数量/小时`, w.quantity ?? 0, g.quantity ?? 0, close(w.quantity ?? 0, g.quantity ?? 0));
      add(`${n} 单价`, w.unitPrice.toFixed(2), g.unitPrice.toFixed(2), close(w.unitPrice, g.unitPrice));
      add(`${n} 金额`, w.total.toFixed(2), g.total.toFixed(2), close(w.total, g.total));
      add(`${n} 计税`, w.taxable, g.taxable);
    }
  });
  if (expected.customerId !== undefined) add("客户", `ALLDATA 客户 ${expected.customerId}`, after.customerId === null ? "没有客户" : `ALLDATA 客户 ${after.customerId}`);
  add("里程 (km)", plan.header.mileage, after.mileageIn);
  add("技师", plan.header.technician, after.technician);
  add("服务顾问", plan.header.serviceWriter, after.serviceWriter);
  add("内部备注", plan.header.shopNote, after.shopNote);
  add("税前合计", plan.predicted.subTotal.toFixed(2), after.totals.subTotal.toFixed(2), close(plan.predicted.subTotal, after.totals.subTotal));
  add("含税合计", plan.predicted.total.toFixed(2), after.totals.total.toFixed(2), close(plan.predicted.total, after.totals.total, 0.03));
  return { ok: checks.every((c) => c.ok), checks };
}
