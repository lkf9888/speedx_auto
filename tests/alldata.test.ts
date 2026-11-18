import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runWorkbenchTool } from "@/lib/workbench/assistant";
import { draftTotals, needsMarkupSave, parseDraftInput, partCostAndMarkup, toAlldataDatalines, type AlldataDraft } from "@/lib/workbench/alldata-draft";
import { checkReadback, expectedTotals, type AlldataReadback } from "@/lib/workbench/alldata-readback";
import type { CatalogApi } from "@/lib/worldpac/catalog";

const LINES = [
  { kind: "part", description: "Front brake pads", part_number: "ACT2076", quantity: 1, unit_price: 129.99, unit_cost: 78.86, taxable: true },
  { kind: "labor", description: "Replace front pads", part_number: "", quantity: 1.3, unit_price: 120, unit_cost: null, taxable: true },
];

describe("ALLDATA draft", () => {
  it("normalises the assistant's draft and totals it", () => {
    const draft = parseDraftInput(
      { title: "前刹车片", customer: { name: "Test Person", phone: "604-555-0100", email: "" }, vehicle: "2019 Toyota Camry LE", vin: "4t1b11hk0ku000000", mileage: 82000, lines: LINES, note: "" },
      "D-1",
    ) as AlldataDraft;
    expect(draft.vin).toBe("4T1B11HK0KU000000");
    expect(draft.lines[1]).toMatchObject({ kind: "labor", quantity: 1.3, unitPrice: 120, unitCost: null });
    expect(draftTotals(draft)).toEqual({ parts: 129.99, labor: 156, subtotal: 285.99, cost: 78.86 });
  });

  it("refuses drafts without lines or with bad numbers", () => {
    expect(parseDraftInput({ lines: [] }, "D-1")).toHaveProperty("error");
    expect(parseDraftInput({ lines: [{ ...LINES[0], unit_price: -5 }] }, "D-1")).toHaveProperty("error");
    expect(parseDraftInput({ lines: [{ ...LINES[0], quantity: 0 }] }, "D-1")).toHaveProperty("error");
    expect(parseDraftInput({ lines: [{ ...LINES[0], kind: "fee" }] }, "D-1")).toHaveProperty("error");
  });

  it("writes lines the way Shop Manager's custom part and custom labor entries do", () => {
    const draft = parseDraftInput({ lines: LINES }, "D-1") as AlldataDraft;
    const [part, labor] = toAlldataDatalines(draft.lines);
    // ALLDATA prices a custom part as cost + markup: the cost goes in Cost, the rest of the price in the markup.
    expect(part).toMatchObject({ lineTypeId: 5, itemName: "Part", partNumber: "ACT2076", cost: 78.86, priceRate: 78.86, markupAmount: 51.13, manualPriceRate: true, quantityOrHours: 1, total: 129.99, laborRateId: null, lineNumber: 1 });
    expect(labor).toMatchObject({ lineTypeId: 6, itemName: "Labor", laborRate: "Basic Labor", laborRateId: 238899, priceRate: 120, quantityOrHours: 1.3, total: 156, lineNumber: 2 });
  });

  it("carries a part's customer price as cost + markup, or as the cost when the cost is unknown (ALLDATA ignores a price on its own)", () => {
    expect(partCostAndMarkup({ unitPrice: 10, unitCost: 6 })).toEqual({ cost: 6, markup: 4 });
    expect(partCostAndMarkup({ unitPrice: 10, unitCost: null })).toEqual({ cost: 10, markup: 0 });
    expect(partCostAndMarkup({ unitPrice: 10, unitCost: 10 })).toEqual({ cost: 10, markup: 0 });
    // A cost above the price can't be a negative markup: book the price.
    expect(partCostAndMarkup({ unitPrice: 10, unitCost: 12 })).toEqual({ cost: 10, markup: 0 });
    const lines = (parseDraftInput({ lines: [{ ...LINES[0], unit_cost: null }] }, "D-1") as AlldataDraft).lines;
    expect(toAlldataDatalines(lines)[0]).toMatchObject({ cost: 129.99, priceRate: 129.99, markupAmount: null, manualPriceRate: false });
    expect(needsMarkupSave(lines)).toBe(false);
    expect(needsMarkupSave((parseDraftInput({ lines: LINES }, "D-1") as AlldataDraft).lines)).toBe(true);
  });

  it("is only drafted by the assistant, never created", async () => {
    const out = await runWorkbenchTool({} as CatalogApi, "draft_alldata_estimate", { title: "x", customer: null, vehicle: "", vin: "", mileage: null, lines: LINES, note: "" }, () => "W-AB12", null);
    expect(out.events[0]).toMatchObject({ type: "alldata_draft", draft: { id: "D-AB12" } });
    expect(JSON.parse(out.content).summary).toContain("NOT in ALLDATA yet");
  });
});

// ------------------------------------------------------------------ extension background worker

type Handler = (message: unknown, sender: { id?: string; url?: string }, respond: (reply: unknown) => void) => boolean;

interface Call {
  method: string;
  path: string;
  body: unknown;
  contentType: string;
}

const alldata = {
  calls: [] as Call[],
  respond: (call: Call): { status: number; json: unknown } => ({ status: call ? 200 : 500, json: {} }),
};
const openedTabs: string[] = [];
let handler: Handler;

beforeAll(async () => {
  const chromeStub = {
    runtime: { id: "ext", getManifest: () => ({ version: "1.0.1" }), onMessage: { addListener: (h: Handler) => (handler = h) } },
    tabs: {
      query: async () => [{ id: 7, status: "complete" }],
      create: async ({ url }: { url: string }) => {
        openedTabs.push(url);
        return { id: 8 };
      },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    scripting: {
      executeScript: async ({ args }: { args: [string, string, unknown, string] }) => {
        // Chrome refuses arguments that don't survive JSON (undefined, functions).
        if (args.some((a) => a === undefined) || JSON.stringify(JSON.parse(JSON.stringify(args))) !== JSON.stringify(args)) {
          throw new Error("Value is unserializable");
        }
        const [method, path, body, contentType] = args;
        const call = { method, path, body, contentType };
        alldata.calls.push(call);
        const { status, json } = alldata.respond(call);
        return [{ result: { status, json, text: "" } }];
      },
    },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chromeStub;
  // @ts-expect-error plain script without exports
  await import("../extensions/alldata-bridge/background.js");
});

beforeEach(() => {
  alldata.calls = [];
  openedTabs.length = 0;
});

function ask(op: string, args: unknown, url = "https://repair.speedxrental.com/") {
  return new Promise<{ ok: boolean; result?: Record<string, unknown>; error?: { code: string } }>((resolve) => {
    const async = handler({ op, args }, { id: "ext", url }, (reply) => resolve(reply as never));
    if (!async) resolve({ ok: false, error: { code: "ignored" } });
  });
}

/** ALLDATA's answer to a first save: the lines with ids and types. */
const savedLines = (datalines: Array<Record<string, unknown>>) =>
  datalines.map((l, i) => ({ ...l, lineNumber: i + 1, datalineId: 9000 + i, datalineType: { datalineTypeId: l.lineTypeId } }));
const created = (id: number, call: { body: unknown }) => ({ status: 201, json: { documentId: id, documentVersion: 1, state: "Draft", estimateNumber: 0, datalines: savedLines((call.body as { datalines: Array<Record<string, unknown>> }).datalines) } });

const DATALINES = toAlldataDatalines((parseDraftInput({ lines: LINES }, "D-1") as AlldataDraft).lines);

const SAVED_CUSTOMER = {
  customerId: 55,
  customerInfo: { firstName: "Test", lastName: "Person", contactMethods: [{ name: "Mobile Phone", value: "604-555-0100", preferred: true }] },
  vehicles: [
    {
      customerVehicleId: 901,
      description: "2019 Toyota Camry LE",
      vin: "4T1B11HK0KU000000",
      odometer: { code: "KM" },
      manualEntry: false,
      vehicle: { year: "2019", make: "Toyota", model: "Camry", engine: "2.5L", acesVehicleId: "123", acesEngineId: "9", acesVehToEngCfgId: "77", acesTrimDesc: "LE" },
    },
  ],
  _links: [],
};

describe("ALLDATA extension", () => {
  it("only answers the workbench pages", async () => {
    expect((await ask("status", {}, "https://evil.example/")).error?.code).toBe("ignored");
    alldata.respond = () => ({ status: 200, json: {} });
    expect((await ask("status", {})).result).toEqual({ version: "1.0.1", signedIn: true });
    expect((await ask("status", {}, "http://localhost:3000/workbench")).ok).toBe(true);
    expect((await ask("deleteEverything", {})).error?.code).toBe("bad_request");
  });

  it("reports a signed-out ALLDATA", async () => {
    alldata.respond = () => ({ status: 401, json: { error: { errorCode: 1015 } } });
    expect((await ask("searchDocuments", { search: "953" })).error?.code).toBe("not_signed_in");
  });

  it("creates a draft with the customer and vehicle, then turns it into an estimate", async () => {
    alldata.respond = (call) => {
      if (call.path === "/ADAG/shopmgr/customers/55") return { status: 200, json: SAVED_CUSTOMER };
      if (call.method === "POST") return created(444, call);
      if (call.method === "GET" && call.path === "/ADAG/shopmgr/documents/444") return { status: 200, json: { documentId: 444, documentVersion: 1 } };
      if (call.method === "PUT" && call.path === "/ADAG/shopmgr/documents/444") return { status: 200, json: { documentId: 444 } };
      if (call.path === "/ADAG/shopmgr/documents/444/state") return { status: 200, json: { documentId: 444, state: "Estimate", estimateNumber: 954 } };
      return { status: 404, json: null };
    };
    const reply = await ask("createEstimate", { customerId: 55, customerVehicleId: 901, mileageIn: 82000, shopNote: "工作台 D-1", datalines: DATALINES });
    expect(reply.result).toEqual({ documentId: 444, estimateNumber: 954, customerAttached: true, markupSaved: true });
    const post = alldata.calls.find((c) => c.method === "POST")!;
    expect(post.path).toBe("/ADAG/shopmgr/documents?is_draft=true");
    const body = post.body as Record<string, unknown>;
    expect(body.customer).toMatchObject({ customerId: 55 });
    expect(body.customer).not.toHaveProperty("vehicles");
    expect(body.vehicleInformation).toMatchObject({ customerVehicleId: 901, vin: "4T1B11HK0KU000000", acesVehicleId: "123", updateMasterRecord: false, odometerCode: "KM" });
    expect(body).toMatchObject({ mileageIn: "82000", technicianId: 270227, serviceWriterId: 276708, shopNote: "工作台 D-1" });
    const state = alldata.calls.find((c) => c.path.endsWith("/state"))!;
    expect(state).toMatchObject({ method: "PUT", body: "estimate", contentType: "text/plain" });
  });

  it("finds a fleet customer's vehicle that the customer record doesn't embed", async () => {
    alldata.respond = (call) => {
      if (call.path === "/ADAG/shopmgr/customers/55") return { status: 200, json: { ...SAVED_CUSTOMER, vehicles: [] } };
      if (call.path.startsWith("/ADAG/shopmgr/customers/55/vehicles")) {
        const page = Number(new URL(call.path, "https://x").searchParams.get("page"));
        const filler = Array.from({ length: 10 }, (_, i) => ({ vehicleId: 100 + page * 10 + i, year: "2015", make: "Ford", model: "F-150" }));
        return { status: 200, json: { vehicles: page === 1 ? [{ vehicleId: 902, year: "2016", make: "Toyota", model: "Sequoia", engine: "5.7L", vin: "5TDBY5G10GS000000", odometer: "KM", acesVehicleId: "321", acesVehicleToEngineConfigId: "88", acesTransmissionId: "4" }] : filler } };
      }
      if (call.method === "POST") return created(446, call);
      return { status: 200, json: { estimateNumber: 956, documentVersion: 1 } };
    };
    const reply = await ask("createEstimate", { customerId: 55, customerVehicleId: 902, mileageIn: null, shopNote: "", datalines: DATALINES });
    expect(reply.result).toMatchObject({ customerAttached: true });
    const body = alldata.calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(body.vehicleInformation).toMatchObject({ customerVehicleId: 902, year: "2016", model: "Sequoia", acesVehicleId: "321", acesVehToEngCfgId: "88", acesTransmissionId: "4" });
  });

  it("still creates the estimate without the customer when ALLDATA refuses the customer block", async () => {
    alldata.respond = (call) => {
      if (call.path === "/ADAG/shopmgr/customers/55") return { status: 200, json: SAVED_CUSTOMER };
      if (call.method === "POST") return (call.body as { customer: unknown }).customer ? { status: 400, json: { message: "bad customer" } } : created(445, call);
      return { status: 200, json: { estimateNumber: 955, documentVersion: 1 } };
    };
    const reply = await ask("createEstimate", { customerId: 55, customerVehicleId: 901, mileageIn: null, shopNote: "", datalines: DATALINES });
    expect(reply.result).toEqual({ documentId: 445, estimateNumber: 955, customerAttached: false, markupSaved: true });
  });

  it("refuses odd line items and opens PDFs only for known document types", async () => {
    expect((await ask("createEstimate", { datalines: [{ lineTypeId: 99 }] })).error?.code).toBe("bad_request");
    expect((await ask("openPdf", { documentId: 444, documentType: "Anything" })).error?.code).toBe("bad_request");
    await ask("openPdf", { documentId: 444, documentType: "Invoice" });
    expect(openedTabs).toEqual(["https://my.alldata.com/ADAG/shopmgr/documents/444/pdf?timezone=America%2FVancouver&documentType=Invoice"]);
  });

  it("lists documents with the PDFs each one has", async () => {
    alldata.respond = () => ({
      status: 200,
      json: {
        documents: [
          {
            documentId: 444,
            documentNumber: 954,
            state: "Invoice",
            customerName: "Test Person",
            vehicleName: "2019 Toyota Camry",
            updatedOn: 1,
            documentStates: { estimate: { available: true, voided: false }, repairOrder: { available: true }, invoice: { available: true, isVoided: false } },
          },
        ],
      },
    });
    const reply = await ask("searchDocuments", { search: "Test" });
    expect(alldata.calls[0].path).toContain("search=Test");
    expect(reply.result?.documents).toEqual([
      { documentId: 444, number: 954, state: "Invoice", voided: false, customerName: "Test Person", vehicle: "2019 Toyota Camry", updatedOn: 1, printable: ["Estimate", "RepairOrder", "Invoice"] },
    ]);
  });
});

// ------------------------------------------------------------------ draft creation and readback

const TEST_LINES = [
  { kind: "part", description: "TEST part", part_number: "TEST-001", quantity: 2, unit_price: 10, unit_cost: 6, taxable: true },
  { kind: "labor", description: "TEST labor", part_number: "", quantity: 1.5, unit_price: 120, unit_cost: null, taxable: true },
];
const TEST_DRAFT = parseDraftInput({ lines: TEST_LINES, mileage: 12345 }, "D-T") as AlldataDraft;

/** What ALLDATA gave back for the 2026-11-17 TEST draft created from these lines (numbers as read back from the real document). */
const READBACK: AlldataReadback = {
  documentId: 80001493,
  version: 2,
  state: "Draft",
  documentNumber: 0,
  editable: true,
  voided: false,
  events: ["Created"],
  customerAttached: false,
  customerId: null,
  mileageIn: 12345,
  technician: "Jason",
  serviceWriter: "Kevin",
  shopNote: "TEST 工作台 D-T",
  lines: [
    { datalineId: 1, lineTypeId: 5, description: "TEST part", partNumber: "TEST-001", quantityOrHours: 2, priceRate: 10, cost: 6, markupAmount: 4, total: 20, taxable: true },
    { datalineId: 2, lineTypeId: 6, description: "TEST labor", partNumber: "", quantityOrHours: 1.5, priceRate: 120, cost: 180, markupAmount: 0, total: 180, taxable: true },
  ],
  totals: { parts: 20, labor: 180, flatFee: 0, discount: 0, subTotal: 200, gst: 10, pst: 0, hst: 0, tax: 10, total: 210 },
};
const OPTIONS = { shopNote: "TEST 工作台 D-T", mileage: 12345, customerAttached: false, chargePst: false };

describe("ALLDATA draft readback", () => {
  it("expects GST on taxable lines, plus PST only when asked", () => {
    expect(expectedTotals(TEST_DRAFT, false)).toEqual({ parts: 20, labor: 180, subTotal: 200, gst: 10, pst: 0, total: 210 });
    expect(expectedTotals(TEST_DRAFT, true)).toEqual({ parts: 20, labor: 180, subTotal: 200, gst: 10, pst: 14, total: 224 });
    const exempt = parseDraftInput({ lines: [{ ...TEST_LINES[0], taxable: false }, TEST_LINES[1]] }, "D-T") as AlldataDraft;
    expect(expectedTotals(exempt, false).gst).toBe(9);
  });

  it("finds a draft that matches the card field by field", () => {
    const result = checkReadback(TEST_DRAFT, READBACK, OPTIONS);
    expect(result.checks.filter((c) => !c.ok)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checks.length).toBeGreaterThan(25);
  });

  it("catches a part saved at its cost instead of the customer price (the bug the first TEST draft showed)", () => {
    const wrong: AlldataReadback = {
      ...READBACK,
      lines: [{ ...READBACK.lines[0], priceRate: 6, total: 12 }, READBACK.lines[1]],
      totals: { ...READBACK.totals, parts: 12, subTotal: 192, gst: 9.6, tax: 9.6, total: 201.6 },
    };
    const result = checkReadback(TEST_DRAFT, wrong, OPTIONS);
    expect(result.ok).toBe(false);
    expect(result.checks.filter((c) => !c.ok).map((c) => c.field)).toEqual(expect.arrayContaining(["第 1 行 单价", "第 1 行 金额", "零件合计", "含税合计"]));
  });

  it("flags a part sold below its cost, because ALLDATA can't keep a cost above the price", () => {
    const below = parseDraftInput({ lines: [{ ...TEST_LINES[0], unit_cost: 12 }, TEST_LINES[1]] }, "D-T") as AlldataDraft;
    const result = checkReadback(below, READBACK, OPTIONS);
    expect(result.checks.filter((c) => !c.ok)).toEqual([{ field: "第 1 行 进价", expected: "12.00", actual: "6.00", ok: false }]);
    const free = parseDraftInput({ lines: [{ ...TEST_LINES[0], unit_price: 0, unit_cost: 8 }, TEST_LINES[1]] }, "D-T") as AlldataDraft;
    expect(checkReadback(free, { ...READBACK, lines: [{ ...READBACK.lines[0], priceRate: 0, cost: 0, total: 0 }, READBACK.lines[1]], totals: { ...READBACK.totals, parts: 0, subTotal: 180, gst: 9, tax: 9, total: 189 } }, OPTIONS).checks.filter((c) => !c.ok).map((c) => c.field)).toEqual(["第 1 行 进价"]);
  });

  it("flags a wrong state, a missing line, PST that was or wasn't charged, and a wrong customer link", () => {
    const result = checkReadback(TEST_DRAFT, { ...READBACK, state: "Estimate", customerAttached: true, lines: [READBACK.lines[0]], totals: { ...READBACK.totals, pst: 14, total: 224 } }, OPTIONS);
    const bad = result.checks.filter((c) => !c.ok).map((c) => c.field);
    expect(bad).toEqual(expect.arrayContaining(["单据状态", "关联客户", "行数", "第 2 行 存在", "PST", "含税合计"]));
  });
});

describe("ALLDATA extension: drafts and readback", () => {
  it("saves a Draft, then saves again so the part's markup takes, and never takes a document number", async () => {
    const draftLines = toAlldataDatalines(TEST_DRAFT.lines);
    alldata.respond = (call) => {
      if (call.method === "POST") return created(500, call);
      if (call.method === "GET") return { status: 200, json: { documentId: 500, documentVersion: 1 } };
      if (call.method === "PUT") return { status: 200, json: { documentId: 500 } };
      return { status: 404, json: null };
    };
    const reply = await ask("createDraft", { customerId: null, customerVehicleId: null, mileageIn: 12345, shopNote: "TEST", datalines: draftLines });
    expect(reply.result).toEqual({ documentId: 500, estimateNumber: 0, customerAttached: false, markupSaved: true });
    expect(alldata.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /ADAG/shopmgr/documents?is_draft=true", "GET /ADAG/shopmgr/documents/500", "PUT /ADAG/shopmgr/documents/500"]);
    expect(alldata.calls.some((c) => c.path.endsWith("/state"))).toBe(false);
    const put = alldata.calls.find((c) => c.method === "PUT")!.body as { datalines: Array<Record<string, unknown>>; mileageIn: string; shopNote: string };
    expect(put.mileageIn).toBe("12345");
    expect(put.datalines[0]).toMatchObject({ datalineId: 9000, cost: 6, priceRate: 6, markupAmount: 4, manualPriceRate: true, lineTypeId: 5 });
    expect(put.datalines[1]).toMatchObject({ datalineId: 9001, lineTypeId: 6, priceRate: 120 });
  });

  it("makes one save when no part needs a markup, and reads the lines back if ALLDATA's first answer has none", async () => {
    const noMarkup = toAlldataDatalines((parseDraftInput({ lines: [{ ...TEST_LINES[0], unit_cost: null }, TEST_LINES[1]] }, "D-T") as AlldataDraft).lines);
    alldata.respond = (call) => (call.method === "POST" ? { status: 201, json: { documentId: 501 } } : { status: 404, json: null });
    expect((await ask("createDraft", { customerId: null, customerVehicleId: null, mileageIn: null, shopNote: "", datalines: noMarkup })).result).toMatchObject({ documentId: 501, estimateNumber: 0 });
    expect(alldata.calls).toHaveLength(1);

    alldata.calls = [];
    alldata.respond = (call) => {
      if (call.method === "POST") return { status: 201, json: { documentId: 502 } };
      if (call.method === "GET") return { status: 200, json: { documentId: 502, documentVersion: 1, datalines: savedLines(toAlldataDatalines(TEST_DRAFT.lines)).map((l, i) => ({ ...l, lineNumber: i + 1 })) } };
      return { status: 200, json: {} };
    };
    await ask("createDraft", { customerId: null, customerVehicleId: null, mileageIn: null, shopNote: "", datalines: toAlldataDatalines(TEST_DRAFT.lines) });
    // POST, the lines read back, the version re-checked, then the second save.
    expect(alldata.calls.map((c) => c.method)).toEqual(["POST", "GET", "GET", "PUT"]);
  });

  it("keeps the document id and reports markupSaved false when the markup save fails, so a retry can't make a second draft", async () => {
    alldata.respond = (call) => {
      if (call.method === "POST") return created(504, call);
      return { status: 500, json: { message: "boom" } };
    };
    const reply = await ask("createDraft", { customerId: null, customerVehicleId: null, mileageIn: null, shopNote: "", datalines: toAlldataDatalines(TEST_DRAFT.lines) });
    expect(reply.ok).toBe(true);
    expect(reply.result).toEqual({ documentId: 504, estimateNumber: 0, customerAttached: false, markupSaved: false });

    // An estimate is never made from a document whose markups did not save.
    alldata.calls = [];
    const estimate = await ask("createEstimate", { customerId: null, customerVehicleId: null, mileageIn: null, shopNote: "", datalines: toAlldataDatalines(TEST_DRAFT.lines) });
    expect(estimate.result).toMatchObject({ documentId: 504, estimateNumber: 0, markupSaved: false });
    expect(alldata.calls.some((c) => c.path.endsWith("/state"))).toBe(false);
  });

  it("keeps the draft's id when turning it into an estimate throws", async () => {
    let failState = false;
    alldata.respond = (call) => {
      if (call.method === "POST") return created(505, call);
      if (call.method === "GET") return { status: 200, json: { documentId: 505, documentVersion: 1 } };
      if (call.path.endsWith("/state")) {
        failState = true;
        throw new Error("network down");
      }
      return { status: 200, json: {} };
    };
    const reply = await ask("createEstimate", { customerId: null, customerVehicleId: null, mileageIn: null, shopNote: "", datalines: toAlldataDatalines(TEST_DRAFT.lines) });
    expect(failState).toBe(true);
    expect(reply.ok).toBe(true);
    expect(reply.result).toMatchObject({ documentId: 505, estimateNumber: 0, markupSaved: true });
  });

  it("does not save a second time when ALLDATA lost a line, and says so", async () => {
    alldata.respond = (call) => (call.method === "POST" ? { status: 201, json: { documentId: 503, datalines: [] } } : call.method === "GET" ? { status: 200, json: { documentId: 503, datalines: [] } } : { status: 200, json: {} });
    const reply = await ask("createDraft", { customerId: null, customerVehicleId: null, mileageIn: null, shopNote: "", datalines: toAlldataDatalines(TEST_DRAFT.lines) });
    expect(reply.result).toMatchObject({ documentId: 503, markupSaved: false });
    expect(alldata.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("reads a document back without any customer details", async () => {
    alldata.respond = () => ({
      status: 200,
      json: {
        documentId: 500,
        documentVersion: 2,
        state: "Draft",
        estimateNumber: 0,
        customer: { customerId: 1, customerInfo: { firstName: "Private", lastName: "Person" } },
        mileageIn: 12345,
        technician: { name: "Jason" },
        serviceWriter: { name: "Kevin" },
        shopNote: "TEST",
        datalines: [{ datalineType: { datalineTypeId: 5 }, description: "TEST part", partNumber: "TEST-001", quantityOrHours: 2, priceRate: 10, cost: 6, total: 20, taxable: true }],
        partsTotal: 20,
        laborTotal: 0,
        subTotal: 20,
        gstTax: 1,
        total: 21,
      },
    });
    const reply = await ask("readDocument", { documentId: 500 });
    expect(reply.result).toMatchObject({ documentId: 500, state: "Draft", customerAttached: true, technician: "Jason", totals: { parts: 20, gst: 1, total: 21 } });
    expect(JSON.stringify(reply.result)).not.toContain("Private");
    expect((await ask("readDocument", { documentId: "x" })).error?.code).toBe("bad_request");
  });
});

// ------------------------------------------------------------------ changing and converting a document

const rawLine = (id: number, typeId: number, extra: Record<string, unknown>) => ({
  datalineId: id,
  lineNumber: id - 100,
  datalineType: { datalineTypeId: typeId },
  itemName: typeId === 6 ? "Labor" : "Part",
  description: `line ${id}`,
  partNumber: typeId === 5 ? `P${id}` : null,
  laborRate: typeId === 6 ? { laborRateId: 238899, name: "Basic Labor", amount: 120 } : null,
  cost: 6,
  priceRate: 10,
  markupAmount: 4,
  manualPriceRate: true,
  quantityOrHours: 2,
  skill: null,
  taxable: true,
  total: 20,
  children: [],
  ...extra,
});

function rawDocument(over: Record<string, unknown> = {}) {
  return {
    documentId: 900,
    documentVersion: 3,
    state: "Draft",
    estimateNumber: 0,
    mileageIn: 1000,
    mileageOut: 0,
    shopNote: "TEST",
    serviceTag: null,
    customer: null,
    customerVehicle: null,
    technician: { technicianId: 270227, name: "Jason" },
    serviceWriter: { serviceWriterId: 276708, name: "Kevin" },
    documentStates: { estimate: { voided: false }, invoice: { isVoided: false } },
    datalines: [rawLine(101, 5, {}), rawLine(102, 5, { cost: 5, priceRate: 5, markupAmount: 0, manualPriceRate: false, quantityOrHours: 1, total: 5 }), rawLine(103, 6, { cost: 120, priceRate: 120, markupAmount: 0, manualPriceRate: false, quantityOrHours: 1, total: 120 })],
    ...over,
  };
}

describe("ALLDATA extension: changing a document", () => {
  const NO_TAX = { gst: { apply: false, rate: 0 }, pst: { apply: false, rate: 0 }, hst: { apply: false, rate: 0 } };
  const save = (edits: unknown, extra: Record<string, unknown> = {}) => ask("saveDocument", { documentId: 900, expectedVersion: 3, expectedTaxes: NO_TAX, edits, ...extra });

  it("saves the whole document with the edits applied, leaving other lines as they were", async () => {
    alldata.respond = (call) => {
      if (call.method === "GET") return { status: 200, json: rawDocument() };
      return { status: 200, json: { documentId: 900, documentVersion: 4, datalines: [] } };
    };
    const reply = await save({ updates: [{ datalineId: 101, quantity: 3, unitPrice: 12 }, { datalineId: 103, quantity: 1.5 }], removes: [102], adds: [], header: { mileageIn: 2500, shopNote: "改过", technicianId: 270226 } });
    expect(reply.result).toEqual({ documentId: 900, version: 4, markupSaved: true });
    const put = alldata.calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe("/ADAG/shopmgr/documents/900");
    const body = put.body as { datalines: Array<Record<string, unknown>>; mileageIn: string; shopNote: string; technicianId: number; serviceWriterId: number; customer: unknown };
    expect(body).toMatchObject({ mileageIn: "2500", shopNote: "改过", technicianId: 270226, serviceWriterId: 276708, customer: null });
    expect(body.datalines.map((l) => l.datalineId)).toEqual([101, 103]);
    // The shop's cost ($6) stays and the price moves through the markup ($12 − $6 = $6); the stored price goes back as it was,
    // because ALLDATA keeps a changed priceRate as a hand-typed price.
    expect(body.datalines[0]).toMatchObject({ lineTypeId: 5, quantityOrHours: 3, cost: 6, priceRate: 10, markupAmount: 6, manualPriceRate: true, lineNumber: 1 });
    expect(body.datalines[1]).toMatchObject({ lineTypeId: 6, quantityOrHours: 1.5, priceRate: 120, laborRate: "Basic Labor", laborRateId: 238899, lineNumber: 2 });
    expect(alldata.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("saves a second time so a newly added part gets its markup", async () => {
    let puts = 0;
    alldata.respond = (call) => {
      // The document is as the first save left it (version 4) when the second save checks.
      if (call.method === "GET") return { status: 200, json: puts === 0 ? rawDocument() : rawDocument({ documentVersion: 3 + puts }) };
      puts += 1;
      const lines = (call.body as { datalines: Array<Record<string, unknown>> }).datalines.map((l, i) => ({ ...l, lineNumber: i + 1, datalineId: (l.datalineId as number | null) ?? 777, datalineType: { datalineTypeId: l.lineTypeId } }));
      return { status: 200, json: { documentId: 900, documentVersion: 3 + puts, datalines: lines } };
    };
    const reply = await save({ updates: [], removes: [], adds: [{ kind: "part", description: "Wiper", partNumber: "W1", quantity: 2, unitPrice: 20, unitCost: 12, taxable: true }, { kind: "flat_fee", description: "Fee", partNumber: "", quantity: 1, unitPrice: 25, unitCost: null, taxable: true }, { kind: "discount", description: "10%", partNumber: "", quantity: 1, unitPrice: 7, unitCost: null, taxable: false }], header: {} });
    expect(reply.result).toEqual({ documentId: 900, version: 5, markupSaved: true });
    const [first, second] = alldata.calls.filter((c) => c.method === "PUT").map((c) => (c.body as { datalines: Array<Record<string, unknown>> }).datalines);
    expect(first.slice(3).map((l) => [l.lineTypeId, l.datalineId, l.priceRate, l.markupAmount])).toEqual([[5, null, 12, 8], [7, null, 25, null], [18, null, -7, null]]);
    expect(first[5]).toMatchObject({ taxable: false });
    expect(second[3]).toMatchObject({ datalineId: 777, markupAmount: 8, manualPriceRate: true });
    // Every line goes back in the second save with the price ALLDATA stored for it.
    expect(second.map((l) => l.priceRate)).toEqual(first.map((l) => l.priceRate));
  });

  it("reports markupSaved false, and keeps going, when the second save fails", async () => {
    let puts = 0;
    alldata.respond = (call) => {
      if (call.method === "GET") return { status: 200, json: puts === 0 ? rawDocument() : rawDocument({ documentVersion: 3 + puts }) };
      puts += 1;
      if (puts === 2) return { status: 500, json: null };
      const lines = (call.body as { datalines: Array<Record<string, unknown>> }).datalines.map((l, i) => ({ ...l, lineNumber: i + 1, datalineId: 700 + i, datalineType: { datalineTypeId: l.lineTypeId } }));
      return { status: 200, json: { documentId: 900, documentVersion: 4, datalines: lines } };
    };
    const reply = await save({ updates: [], removes: [], adds: [{ kind: "part", description: "Wiper", partNumber: "W1", quantity: 1, unitPrice: 20, unitCost: 12, taxable: true }], header: {} });
    expect(reply.result).toMatchObject({ documentId: 900, markupSaved: false });
  });

  it("does not overwrite what someone else added between the two saves", async () => {
    let puts = 0;
    alldata.respond = (call) => {
      if (call.method === "GET") return { status: 200, json: puts === 0 ? rawDocument() : rawDocument({ documentVersion: 9 }) };
      puts += 1;
      const lines = (call.body as { datalines: Array<Record<string, unknown>> }).datalines.map((l, i) => ({ ...l, lineNumber: i + 1, datalineId: 700 + i, datalineType: { datalineTypeId: l.lineTypeId } }));
      return { status: 200, json: { documentId: 900, documentVersion: 4, datalines: lines } };
    };
    const reply = await save({ updates: [], removes: [], adds: [{ kind: "part", description: "Wiper", partNumber: "W1", quantity: 1, unitPrice: 20, unitCost: 12, taxable: true }], header: {} });
    expect(reply.result).toMatchObject({ documentId: 900, version: 4, markupSaved: false });
    expect(alldata.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("leaves the markups unsaved when the tax switches move between the two saves", async () => {
    let puts = 0;
    let settingsReads = 0;
    alldata.respond = (call) => {
      if (call.path.endsWith("rates_taxes_discounts")) {
        settingsReads += 1;
        // The first reading matches the change; by the second one PST has been switched on.
        return { status: 200, json: { taxRates: [{ name: "GST", apply: true, amount: 5 }, { name: "PST", apply: settingsReads > 1, amount: 7 }] } };
      }
      if (call.method === "GET") return { status: 200, json: puts === 0 ? rawDocument() : rawDocument({ documentVersion: 4 }) };
      puts += 1;
      const lines = (call.body as { datalines: Array<Record<string, unknown>> }).datalines.map((l, i) => ({ ...l, lineNumber: i + 1, datalineId: 700 + i, datalineType: { datalineTypeId: l.lineTypeId } }));
      return { status: 200, json: { documentId: 900, documentVersion: 4, datalines: lines } };
    };
    const reply = await save({ updates: [], removes: [], adds: [{ kind: "part", description: "Wiper", partNumber: "W1", quantity: 1, unitPrice: 20, unitCost: 12, taxable: true }], header: {} }, { expectedTaxes: { gst: { apply: true, rate: 5 }, pst: { apply: false, rate: 7 }, hst: { apply: false, rate: 0 } } });
    expect(reply.result).toMatchObject({ markupSaved: false });
    expect(alldata.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("refuses to save when the tax switches in ALLDATA Settings are not the ones the change was measured with, or one line twice", async () => {
    alldata.respond = (call) => (call.path.endsWith("rates_taxes_discounts") ? { status: 200, json: { taxRates: [{ name: "GST", apply: true, amount: 5 }, { name: "PST", apply: true, amount: 7 }] } } : { status: 200, json: rawDocument() });
    expect((await save({ updates: [{ datalineId: 101, quantity: 3 }] })).error?.code).toBe("document_changed");
    expect((await save({ updates: [{ datalineId: 101, quantity: 3 }] }, { expectedTaxes: { gst: { apply: true, rate: 5 }, pst: { apply: true, rate: 7 }, hst: { apply: false, rate: 0 } } })).ok).toBe(true);
    expect((await ask("saveDocument", { documentId: 900, expectedVersion: 3, edits: { updates: [{ datalineId: 101, quantity: 3 }] } })).error?.code).toBe("bad_request");
    alldata.calls = [];
    alldata.respond = () => ({ status: 200, json: rawDocument() });
    expect((await save({ updates: [{ datalineId: 101, unitPrice: 200 }, { datalineId: 101, unitPrice: 100 }] })).error?.code).toBe("bad_request");
    expect(alldata.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("refuses an invoice, a voided document, a document someone else changed, and lines it can't edit", async () => {
    alldata.respond = () => ({ status: 200, json: rawDocument({ state: "Invoice" }) });
    expect((await save({ updates: [{ datalineId: 101, quantity: 3 }] })).error?.code).toBe("document_locked");
    alldata.respond = () => ({ status: 200, json: rawDocument({ state: "Estimate", documentStates: { estimate: { voided: true }, invoice: {} } }) });
    expect((await save({ updates: [{ datalineId: 101, quantity: 3 }] })).error?.code).toBe("document_locked");
    alldata.respond = () => ({ status: 200, json: rawDocument({ documentVersion: 4 }) });
    expect((await save({ updates: [{ datalineId: 101, quantity: 3 }] })).error?.code).toBe("document_changed");
    alldata.respond = () => ({ status: 200, json: rawDocument({ datalines: [rawLine(101, 1, {}), rawLine(103, 6, {})] }) });
    expect((await save({ updates: [{ datalineId: 101, quantity: 3 }] })).error?.code).toBe("bad_request");
    expect((await save({ updates: [{ datalineId: 999, quantity: 3 }] })).error?.code).toBe("bad_request");
    expect((await save({ removes: [999] })).error?.code).toBe("bad_request");
    expect((await save({ updates: [{ datalineId: 103, quantity: 0 }] })).error?.code).toBe("bad_request");
    expect((await save({ removes: [101, 103] })).error?.code).toBe("bad_request");
    expect(alldata.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("files the document under another customer when asked, with that customer's saved vehicle", async () => {
    alldata.respond = (call) => {
      if (call.path === "/ADAG/shopmgr/customers/55") return { status: 200, json: SAVED_CUSTOMER };
      if (call.method === "GET") return { status: 200, json: rawDocument() };
      return { status: 200, json: { documentId: 900, documentVersion: 4, datalines: [] } };
    };
    await save({ updates: [], removes: [], adds: [], header: {} }, { customerId: 55, customerVehicleId: 901 });
    const body = alldata.calls.find((c) => c.method === "PUT")!.body as { customer: Record<string, unknown>; vehicleInformation: Record<string, unknown> };
    expect(body.customer).toMatchObject({ customerId: 55 });
    expect(body.customer).not.toHaveProperty("vehicles");
    expect(body.vehicleInformation).toMatchObject({ customerVehicleId: 901, acesVehicleId: "123" });
  });
});

describe("ALLDATA extension: converting and reading", () => {
  const convert = (args: Record<string, unknown>) => ask("convertDocument", { documentId: 900, expectedVersion: 3, ...args });

  it("turns a draft into an estimate, and nothing else without being asked", async () => {
    alldata.respond = (call) => (call.method === "GET" ? { status: 200, json: rawDocument() } : { status: 200, json: { state: "Estimate", estimateNumber: 1080 } });
    expect((await convert({ to: "estimate" })).result).toEqual({ documentId: 900, state: "Estimate", documentNumber: 1080 });
    expect(alldata.calls.find((c) => c.method === "PUT")).toMatchObject({ path: "/ADAG/shopmgr/documents/900/state", body: "estimate", contentType: "text/plain" });
    alldata.respond = () => ({ status: 200, json: rawDocument({ state: "Estimate" }) });
    expect((await convert({ to: "estimate" })).error?.code).toBe("bad_request");
  });

  it("makes an invoice only with the confirmation for this exact version of this document", async () => {
    alldata.respond = (call) => (call.method === "GET" ? { status: 200, json: rawDocument({ state: "Estimate", estimateNumber: 1080 }) } : { status: 201, json: { state: "Invoice", estimateNumber: 1080 } });
    expect((await convert({ to: "invoice" })).error?.code).toBe("bad_request");
    expect((await convert({ to: "invoice", confirm: "invoice:900:2" })).error?.code).toBe("bad_request");
    expect((await convert({ to: "invoice", confirm: "invoice:901:3" })).error?.code).toBe("bad_request");
    expect(alldata.calls.some((c) => c.method === "POST")).toBe(false);
    expect((await convert({ to: "invoice", confirm: "invoice:900:3" })).result).toEqual({ documentId: 900, state: "Invoice", documentNumber: 1080 });
    expect(alldata.calls.find((c) => c.method === "POST")!.path).toBe("/ADAG/shopmgr/documents/900/invoice");
    // Stale version and locked documents are refused before anything is sent.
    alldata.calls = [];
    expect((await convert({ to: "invoice", expectedVersion: 2, confirm: "invoice:900:2" })).error?.code).toBe("document_changed");
    alldata.respond = () => ({ status: 200, json: rawDocument({ state: "Invoice" }) });
    expect((await convert({ to: "invoice", confirm: "invoice:900:3" })).error?.code).toBe("document_locked");
    expect(alldata.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("reads the tax switches and the document's print history", async () => {
    alldata.respond = (call) => {
      if (call.path.endsWith("rates_taxes_discounts")) return { status: 200, json: { taxRates: [{ name: "PST", apply: true, amount: 7 }, { name: "HST", apply: false, amount: null }, { name: "GST", apply: true, amount: 5 }] } };
      if (call.path.endsWith("/history")) return { status: 200, json: [{ eventType: "Created" }, { eventType: "Printed" }] };
      return { status: 200, json: rawDocument({ state: "Estimate" }) };
    };
    expect((await ask("readTaxSettings", {})).result).toEqual({ gst: { apply: true, rate: 5 }, pst: { apply: true, rate: 7 }, hst: { apply: false, rate: 0 } });
    const doc = (await ask("readDocument", { documentId: 900 })).result!;
    expect(doc).toMatchObject({ editable: true, voided: false, events: ["Created", "Printed"] });
    expect((doc.lines as Array<Record<string, unknown>>)[0]).toMatchObject({ datalineId: 101, markupAmount: 4 });
    alldata.respond = (call) => (call.path.endsWith("/history") ? { status: 500, json: null } : { status: 200, json: rawDocument({ state: "Invoice" }) });
    expect((await ask("readDocument", { documentId: 900 })).result).toMatchObject({ editable: false, events: null });
  });
});
