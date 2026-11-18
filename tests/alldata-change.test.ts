import { describe, expect, it, vi } from "vitest";
import { amountThreshold, checkChange, evaluateGates, parseChangeInput, planChange, predict, resolveRef, docLines, type ChangeOp, type Taxes } from "@/lib/workbench/alldata-change";
import type { AlldataReadback } from "@/lib/workbench/alldata-readback";

const TAXES_ON: Taxes = { gst: { apply: true, rate: 5 }, pst: { apply: true, rate: 7 }, hst: { apply: false, rate: 0 } };
const TAXES_GST: Taxes = { gst: { apply: true, rate: 5 }, pst: { apply: false, rate: 7 }, hst: { apply: false, rate: 0 } };

/** The shape of the live TEST draft used on 2026-11-17: part A (2 × $10, cost $6), part B ($5), labor ($120); PST was switched on in Settings (12% tax). */
const DOC: AlldataReadback = {
  documentId: 900,
  version: 3,
  state: "Draft",
  documentNumber: 0,
  editable: true,
  voided: false,
  events: ["Created"],
  customerAttached: false,
  customerId: null,
  mileageIn: 1000,
  technician: "Jason",
  serviceWriter: "Kevin",
  shopNote: "TEST4",
  lines: [
    { datalineId: 11, lineTypeId: 5, description: "TEST4 零件A", partNumber: "TEST-A", quantityOrHours: 2, priceRate: 10, cost: 6, markupAmount: 4, total: 20, taxable: true },
    { datalineId: 12, lineTypeId: 5, description: "TEST4 零件B", partNumber: "TEST-B", quantityOrHours: 1, priceRate: 5, cost: 5, markupAmount: 0, total: 5, taxable: true },
    { datalineId: 13, lineTypeId: 6, description: "TEST4 工时", partNumber: "", quantityOrHours: 1, priceRate: 120, cost: 120, markupAmount: 0, total: 120, taxable: true },
  ],
  totals: { parts: 25, labor: 120, flatFee: 0, discount: 0, subTotal: 145, gst: 7.25, pst: 10.15, hst: 0, tax: 17.4, total: 162.4 },
};

const set = (ref: { line?: number; contains?: string; partNumber?: string }, rest: Record<string, unknown>): ChangeOp => ({ op: "set_line", ref, ...rest }) as ChangeOp;

describe("parsing the assistant's change request", () => {
  it("needs a document and valid changes", () => {
    expect(parseChangeInput({ document: {}, ops: [] }, "C-1")).toHaveProperty("error");
    expect(parseChangeInput({ document: { query: "1062" }, ops: [{ op: "set_line", ref: {}, unit_price: 5 }] }, "C-1")).toHaveProperty("error");
    expect(parseChangeInput({ document: { query: "1062" }, ops: [{ op: "set_line", ref: { line: 1 } }] }, "C-1")).toHaveProperty("error");
    expect(parseChangeInput({ document: { query: "1062" }, ops: [{ op: "set_line", ref: { line: 1 }, quantity: 0 }] }, "C-1")).toHaveProperty("error");
    expect(parseChangeInput({ document: { query: "1062" }, ops: [{ op: "set_header", technician: "Nobody" }] }, "C-1")).toHaveProperty("error");
    expect(parseChangeInput({ document: { query: "1062" }, ops: [{ op: "add_line", kind: "part", description: "x", unit_price: -1, quantity: 1 }] }, "C-1")).toHaveProperty("error");
    expect(parseChangeInput({ document: { query: "1062" }, ops: Array.from({ length: 21 }, () => ({ op: "remove_line", ref: { line: 1 } })) }, "C-1")).toHaveProperty("error");
  });

  it("normalises a good request", () => {
    const request = parseChangeInput(
      {
        document: { document_id: 900, query: "" },
        reason: "客人要两个",
        ops: [
          { op: "set_line", ref: { contains: "零件a" }, quantity: 3, unit_price: "12" },
          { op: "add_line", kind: "discount", description: "10%", unit_price: 5, quantity: 1 },
          { op: "add_line", kind: "part", description: "Wiper", part_number: "W1", unit_price: 20, unit_cost: 12, quantity: 2, taxable: true },
          { op: "set_header", mileage: 82000.4, technician: "Mr. Liu" },
          { op: "set_customer", search: "604-555-0100" },
        ],
      },
      "C-1",
    );
    expect(request).toMatchObject({
      id: "C-1",
      document: { documentId: 900 },
      ops: [
        { op: "set_line", ref: { contains: "零件a" }, quantity: 3, unitPrice: 12 },
        { op: "add_line", kind: "discount", unitPrice: 5, taxable: false, quantity: 1 },
        { op: "add_line", kind: "part", unitCost: 12, taxable: true },
        { op: "set_header", mileage: 82000, technician: "Mr. Liu" },
        { op: "set_customer", search: "604-555-0100" },
      ],
    });
  });
});

describe("finding a line", () => {
  const lines = docLines(DOC);
  it("by number, by words, by part number; refuses missing and ambiguous ones", () => {
    expect(resolveRef(lines, { line: 2 })).toEqual({ index: 1 });
    expect(resolveRef(lines, { contains: "工时" })).toEqual({ index: 2 });
    expect(resolveRef(lines, { partNumber: "test-b" })).toEqual({ index: 1 });
    expect(resolveRef(lines, { line: 9 })).toHaveProperty("error");
    expect(resolveRef(lines, { contains: "nothing" })).toHaveProperty("error");
    expect(resolveRef(lines, { contains: "零件" })).toMatchObject({ error: expect.stringContaining("2 lines match") });
  });
});

describe("planning a change", () => {
  it("changes a part's quantity and price: the shop's cost stays, the markup moves, and the diff says so", () => {
    const plan = planChange(DOC, [set({ contains: "零件A" }, { quantity: 3, unitPrice: 12 })], TAXES_ON);
    expect(plan.problems).toEqual([]);
    expect(plan.edits.updates).toEqual([{ datalineId: 11, quantity: 3, unitPrice: 12 }]);
    expect(plan.diff).toEqual([{ kind: "changed", label: "第 1 行 TEST4 零件A", before: "数量 2；单价 $10.00", after: "数量 3；单价 $12.00" }]);
    // 20 → 36: +16, tax 12% → +19.20 on a $145 / $162.40 document.
    expect(plan.predicted).toMatchObject({ subTotal: 161, tax: 19.32, total: 180.32, approximate: false });
    expect(plan.predicted.lines[0]).toMatchObject({ unitPrice: 12, cost: 6, total: 36 });
  });

  it("removes a line, adds lines and changes the header (technician, mileage, note) in one go", () => {
    const plan = planChange(
      DOC,
      [
        { op: "remove_line", ref: { partNumber: "TEST-B" } },
        { op: "add_line", kind: "flat_fee", description: "Shop fee", partNumber: "", quantity: 1, unitPrice: 25, unitCost: null, taxable: true },
        { op: "add_line", kind: "discount", description: "10%", partNumber: "", quantity: 1, unitPrice: 14, unitCost: null, taxable: false },
        { op: "set_header", mileage: 2500, shopNote: "改过", technician: "Mr. Liu", serviceWriter: "Amber" },
      ],
      TAXES_GST,
    );
    expect(plan.edits.removes).toEqual([12]);
    expect(plan.edits.adds.map((a) => a.kind)).toEqual(["flat_fee", "discount"]);
    expect(plan.edits.header).toEqual({ mileageIn: 2500, shopNote: "改过", technicianId: 270226, serviceWriterId: 279710 });
    expect(plan.diff.map((d) => d.kind)).toEqual(["removed", "added", "added", "header", "header", "header", "header"]);
    // 20 + 120 + 25 − 14 = 151 before tax; GST on 165 (the non-taxable discount doesn't lower the taxed amount) = 8.25.
    expect(plan.predicted).toMatchObject({ subTotal: 151, tax: 8.25, total: 159.25 });
  });

  it("stops on a line it can't find, a catalog line, or a line already removed, and says which", () => {
    const withCatalog: AlldataReadback = { ...DOC, lines: [...DOC.lines, { datalineId: 14, lineTypeId: 1, description: "Brake pad (catalog)", partNumber: "X1", quantityOrHours: 1, priceRate: 50, cost: 30, markupAmount: 0, total: 50, taxable: true }] };
    const plan = planChange(
      withCatalog,
      [set({ contains: "nothing" }, { unitPrice: 1 }), set({ line: 4 }, { unitPrice: 60 }), { op: "remove_line", ref: { line: 1 } }, set({ line: 1 }, { quantity: 5 })],
      TAXES_ON,
    );
    expect(plan.problems).toHaveLength(3);
    expect(plan.problems[0]).toContain("No line matches");
    expect(plan.problems[1]).toContain("目录零件");
    expect(plan.problems[2]).toContain("在这次修改里已经动过了");
  });

  it("refuses to change the same line twice in one request", () => {
    const plan = planChange(DOC, [set({ line: 1 }, { unitPrice: 200 }), set({ line: 1 }, { unitPrice: 100 }), set({ line: 2 }, { unitPrice: 1 }), { op: "remove_line", ref: { line: 2 } }], TAXES_ON);
    expect(plan.problems).toHaveLength(2);
    expect(plan.problems[0]).toContain("同一行请合并");
    expect(plan.edits.updates.map((u) => u.datalineId)).toEqual([11, 12]);
  });

  it("works from ALLDATA's own numbers when the document has job groups or catalog lines", () => {
    const withGroup: AlldataReadback = {
      ...DOC,
      lines: [...DOC.lines, { datalineId: 20, lineTypeId: 20, description: "Oil change group", partNumber: "", quantityOrHours: null, priceRate: 0, cost: 0, markupAmount: 0, total: 100, taxable: false }],
      totals: { ...DOC.totals, subTotal: 245, tax: 29.4, total: 274.4 },
    };
    const plan = planChange(withGroup, [set({ line: 3 }, { quantity: 2 })], TAXES_ON);
    expect(plan.predicted.approximate).toBe(true);
    // +$120 labor at 12% tax.
    expect(plan.predicted).toMatchObject({ subTotal: 365, tax: 43.8, total: 408.8 });
  });

  it("counts a PST switched on since the document was saved, even with lines it can't price", () => {
    const big: AlldataReadback = {
      ...DOC,
      lines: [{ datalineId: 11, lineTypeId: 5, description: "Part", partNumber: "A", quantityOrHours: 1, priceRate: 1000, cost: 1000, markupAmount: 0, total: 1000, taxable: true }, { datalineId: 20, lineTypeId: 8, description: "Note", partNumber: "", quantityOrHours: null, priceRate: 0, cost: 0, markupAmount: 0, total: 0, taxable: true }],
      totals: { parts: 1000, labor: 0, flatFee: 0, discount: 0, subTotal: 1000, gst: 50, pst: 0, hst: 0, tax: 50, total: 1050 },
    };
    const plan = planChange(big, [{ op: "set_header", mileage: 9 }], TAXES_ON);
    expect(plan.predicted).toMatchObject({ approximate: true, tax: 120, total: 1120 });
    expect(evaluateGates(big, plan, false).gates.map((g) => g.id)).toEqual(["amount"]);
  });

  it("doesn't let a non-taxable discount or a changed rate hide the money gate on a document with lines it can't price", () => {
    const base = (totals: AlldataReadback["totals"], lines: AlldataReadback["lines"]): AlldataReadback => ({ ...DOC, lines, totals });
    const part = { datalineId: 11, lineTypeId: 5, description: "Part", partNumber: "A", quantityOrHours: 1, priceRate: 1000, cost: 1000, markupAmount: 0, total: 1000, taxable: true };
    const note = { datalineId: 20, lineTypeId: 8, description: "Note", partNumber: "", quantityOrHours: null, priceRate: 0, cost: 0, markupAmount: 0, total: 0, taxable: true };
    const discount = { datalineId: 12, lineTypeId: 18, description: "Disc", partNumber: "", quantityOrHours: null, priceRate: -200, cost: -200, markupAmount: 0, total: -200, taxable: false };
    // All taxes were off ($800 total); GST 5% has since been switched on.
    const untaxed = base({ parts: 1000, labor: 0, flatFee: 0, discount: -200, subTotal: 800, gst: 0, pst: 0, hst: 0, tax: 0, total: 800 }, [part, discount, note]);
    const a = planChange(untaxed, [{ op: "set_header", mileage: 9 }], TAXES_GST);
    expect(a.predicted.total).toBe(850);
    expect(evaluateGates(untaxed, a, false).gates.map((g) => g.id)).toEqual(["amount"]);
    // GST was 5% ($50 on $1,000); it is 10% now.
    const taxed = base({ parts: 1000, labor: 0, flatFee: 0, discount: 0, subTotal: 1000, gst: 50, pst: 0, hst: 0, tax: 50, total: 1050 }, [part, note]);
    const b = planChange(taxed, [{ op: "set_header", mileage: 9 }], { ...TAXES_GST, gst: { apply: true, rate: 10 } });
    expect(b.predicted.total).toBe(1100);
    expect(evaluateGates(taxed, b, false).gates.map((g) => g.id)).toEqual(["amount"]);
  });

  it("predicts the whole document with the current tax settings, so a PST that was switched off since shows up", () => {
    const full = predict(docLines(DOC), DOC, TAXES_GST);
    expect(full).toMatchObject({ subTotal: 145, tax: 7.25, total: 152.25 });
    expect(full.total).not.toBe(DOC.totals.total);
  });
});

describe("the confirmation gates", () => {
  it("trips the money gate at $50 or 10% of the document, whichever is smaller", () => {
    expect(amountThreshold(162.4)).toBe(16.24);
    expect(amountThreshold(1000)).toBe(50);
    // A document worth nothing has a threshold of $0, as the rule reads: any change of money needs the owner.
    expect(amountThreshold(0)).toBe(0);
    const empty: AlldataReadback = { ...DOC, lines: [], totals: { ...DOC.totals, parts: 0, labor: 0, subTotal: 0, gst: 0, pst: 0, tax: 0, total: 0 } };
    const adding = planChange(empty, [{ op: "add_line", kind: "part", description: "x", partNumber: "", quantity: 1, unitPrice: 10, unitCost: null, taxable: true }], TAXES_GST);
    expect(evaluateGates(empty, adding, false).gates.map((g) => g.id)).toEqual(["amount"]);
    const headerOnly = planChange(empty, [{ op: "set_header", mileage: 5 }], TAXES_GST);
    expect(evaluateGates(empty, headerOnly, false).gates).toEqual([]);
    const small = planChange(DOC, [set({ line: 2 }, { unitPrice: 6 })], TAXES_ON);
    expect(evaluateGates(DOC, small, false)).toMatchObject({ gates: [], blocked: null, delta: 1.12 });
    const big = planChange(DOC, [set({ line: 3 }, { quantity: 1.2 })], TAXES_ON);
    const result = evaluateGates(DOC, big, false);
    expect(result.gates.map((g) => g.id)).toEqual(["amount"]);
    expect(result.delta).toBe(26.88);
  });

  it("treats an estimate whose print history can't be read as already sent", () => {
    const plan = planChange(DOC, [{ op: "set_header", mileage: 2 }], TAXES_ON);
    expect(evaluateGates({ ...DOC, state: "Estimate", events: null }, plan, false).gates.map((g) => g.id)).toEqual(["sent"]);
    expect(evaluateGates({ ...DOC, events: null }, plan, false).gates).toEqual([]);
  });

  it("blocks invoices and voided documents, and flags a printed estimate and a customer change", () => {
    const plan = planChange(DOC, [set({ line: 2 }, { unitPrice: 6 })], TAXES_ON);
    expect(evaluateGates({ ...DOC, state: "Invoice", editable: false }, plan, false).blocked).toContain("Invoice");
    expect(evaluateGates({ ...DOC, state: "Estimate", editable: false, voided: true }, plan, false).blocked).toContain("作废");
    const printed = evaluateGates({ ...DOC, state: "Estimate", events: ["Created", "Printed"] }, plan, true);
    expect(printed.gates.map((g) => g.id)).toEqual(["sent", "customer"]);
    // A draft has never been given to the customer, even if the history says printed.
    expect(evaluateGates({ ...DOC, events: ["Created", "Printed"] }, plan, false).gates).toEqual([]);
  });
});

describe("checking the saved document against the plan", () => {
  it("passes when ALLDATA saved what was planned and names every difference when it didn't", () => {
    const plan = planChange(DOC, [set({ contains: "零件A" }, { quantity: 3, unitPrice: 12 })], TAXES_ON);
    const saved: AlldataReadback = {
      ...DOC,
      version: 4,
      lines: [{ ...DOC.lines[0], quantityOrHours: 3, priceRate: 12, markupAmount: 6, total: 36 }, DOC.lines[1], DOC.lines[2]],
      totals: { ...DOC.totals, subTotal: 161, tax: 19.32, total: 180.32 },
    };
    expect(checkChange(plan, saved)).toMatchObject({ ok: true });
    // A part number or a customer that didn't take is caught too.
    const renumber = planChange(DOC, [set({ line: 1 }, { partNumber: "NEW-P" })], TAXES_ON);
    expect(checkChange(renumber, DOC).checks.find((c) => c.field === "第 1 行 零件号")).toMatchObject({ expected: "NEW-P", actual: "TEST-A", ok: false });
    expect(checkChange(plan, saved, { customerId: 55 }).checks.find((c) => c.field === "客户")).toMatchObject({ ok: false, actual: "没有客户" });
    expect(checkChange(plan, { ...saved, customerId: 55 }, { customerId: 55 }).ok).toBe(true);
    const wrong: AlldataReadback = { ...saved, lines: [{ ...saved.lines[0], priceRate: 6, total: 18 }, DOC.lines[1], DOC.lines[2]], totals: { ...saved.totals, subTotal: 143, total: 160.16 } };
    const result = checkChange(plan, wrong);
    expect(result.ok).toBe(false);
    expect(result.checks.filter((c) => !c.ok).map((c) => c.field)).toEqual(expect.arrayContaining(["第 1 行 单价", "第 1 行 金额", "税前合计", "含税合计"]));
  });
});

// ------------------------------------------------------------------ the assistant's tool, the history and the stored cards

import { runWorkbenchTool } from "@/lib/workbench/assistant";
import { ConversationStore, newTurnId } from "@/lib/workbench/conversations";
import { handleConversation } from "@/lib/workbench/conversations-http";
import { historyFromTurns } from "@/lib/workbench/http";
import { memoryKv } from "@/lib/workbench/kv";
import { snapshot } from "@/lib/workbench/shares";
import type { Conversation, Turn } from "@/lib/workbench/conversation-types";
import type { CatalogApi } from "@/lib/worldpac/catalog";

describe("propose_alldata_change", () => {
  const run = (input: Record<string, unknown>) => runWorkbenchTool({} as CatalogApi, "propose_alldata_change", input, () => "W-AB12", null);

  it("shows a card and says nothing was changed yet", async () => {
    const out = await run({ document: { document_id: 900 }, reason: "客人要两个", ops: [{ op: "set_line", ref: { line: 1 }, quantity: 2 }] });
    expect(out.events[0]).toMatchObject({ type: "alldata_change", change: { id: "C-AB12", document: { documentId: 900 }, ops: [{ op: "set_line", quantity: 2 }] } });
    expect(JSON.parse(out.content).note).toContain("only when they press apply");
  });

  it("opens a lookup with an empty change list, and refuses a request that names no document or a bad line", async () => {
    expect((await run({ document: { query: "1062" }, ops: [] })).events[0]).toMatchObject({ change: { ops: [], document: { query: "1062" } } });
    expect((await run({ document: {}, ops: [] })).isError).toBe(true);
    expect((await run({ document: { query: "1062" }, ops: [{ op: "set_line", ref: {}, quantity: 2 }] })).isError).toBe(true);
  });
});

describe("stored change cards", () => {
  const change = { id: "C-1", document: { documentId: 900, query: "" }, ops: [], reason: "", createdAt: "2026-11-17T20:00:00Z" };
  const turn = (over: Partial<Turn>): Turn => ({ id: newTurnId(), role: "assistant", text: "好", author: "assistant", at: 1, quotes: [], ...over });

  it("tells the assistant which ALLDATA document a draft became, and whether a change was applied", () => {
    const history = historyFromTurns([
      { ...turn({ role: "user", text: "开草稿", author: "a@x" }) },
      turn({ drafts: [{ id: "D-1", title: "前刹车片", created: { documentId: 900, estimateNumber: 0, customerAttached: false } } as never] }),
      turn({ changes: [change, { ...change, id: "C-2", applied: { at: "x", documentId: 900, version: 4 } }] }),
    ]);
    expect(history[1].text).toContain("document_id 900");
    expect(history[1].text).toContain("草稿（还没有单号）");
    expect(history[2].text).toContain("员工还没应用");
    expect(history[2].text).toContain("员工已应用");
  });

  it("records that staff applied a change, and keeps it out of a shared link", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cabc1234", "a@x", [turn({ changes: [change as never] })]);
    const conversation = await store.markCard("cabc1234", "a@x", { kind: "change", itemId: "C-1", applied: { at: "2026-11-17T21:00:00Z", documentId: 900, version: 4 } });
    expect(conversation.turns[0].changes![0].applied).toEqual({ at: "2026-11-17T21:00:00Z", documentId: 900, version: 4 });
    expect(snapshot(conversation as Conversation).turns[0].changes).toBeUndefined();
  });

  it("takes the applied mark through the conversation API, and refuses a malformed one", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cabc1234", "a@x", [turn({ changes: [change as never] })]);
    const deps = { user: async () => ({ email: "a@x" }), store: () => store, log: vi.fn() };
    const patch = (card: unknown) => handleConversation(new Request("http://x/api/workbench/conversations/cabc1234", { method: "PATCH", body: JSON.stringify({ card }) }), "cabc1234", deps as never);
    expect((await patch({ kind: "change", itemId: "C-1", applied: { documentId: "x", version: 4 } })).status).toBe(400);
    const ok = await patch({ kind: "change", itemId: "C-1", applied: { documentId: 900, version: 4 } });
    expect(ok.status).toBe(200);
    expect((await store.get("cabc1234"))!.turns[0].changes![0].applied).toMatchObject({ documentId: 900, version: 4 });
  });
});
