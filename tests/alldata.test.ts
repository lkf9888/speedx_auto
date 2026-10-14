import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runWorkbenchTool } from "@/lib/workbench/assistant";
import { draftTotals, parseDraftInput, toAlldataDatalines, type AlldataDraft } from "@/lib/workbench/alldata-draft";
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
    expect(part).toMatchObject({ lineTypeId: 5, itemName: "Part", partNumber: "ACT2076", cost: 78.86, priceRate: 129.99, quantityOrHours: 1, total: 129.99, laborRateId: null, lineNumber: 1 });
    expect(labor).toMatchObject({ lineTypeId: 6, itemName: "Labor", laborRate: "Basic Labor", laborRateId: 238899, priceRate: 120, quantityOrHours: 1.3, total: 156, lineNumber: 2 });
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
      if (call.method === "POST") return { status: 201, json: { documentId: 444, state: "Draft", estimateNumber: 0 } };
      if (call.path === "/ADAG/shopmgr/documents/444/state") return { status: 200, json: { documentId: 444, state: "Estimate", estimateNumber: 954 } };
      return { status: 404, json: null };
    };
    const reply = await ask("createEstimate", { customerId: 55, customerVehicleId: 901, mileageIn: 82000, shopNote: "工作台 D-1", datalines: DATALINES });
    expect(reply.result).toEqual({ documentId: 444, estimateNumber: 954, customerAttached: true });
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
      if (call.method === "POST") return { status: 201, json: { documentId: 446 } };
      return { status: 200, json: { estimateNumber: 956 } };
    };
    const reply = await ask("createEstimate", { customerId: 55, customerVehicleId: 902, mileageIn: null, shopNote: "", datalines: DATALINES });
    expect(reply.result).toMatchObject({ customerAttached: true });
    const body = alldata.calls.find((c) => c.method === "POST")!.body as Record<string, unknown>;
    expect(body.vehicleInformation).toMatchObject({ customerVehicleId: 902, year: "2016", model: "Sequoia", acesVehicleId: "321", acesVehToEngCfgId: "88", acesTransmissionId: "4" });
  });

  it("still creates the estimate without the customer when ALLDATA refuses the customer block", async () => {
    alldata.respond = (call) => {
      if (call.path === "/ADAG/shopmgr/customers/55") return { status: 200, json: SAVED_CUSTOMER };
      if (call.method === "POST") return (call.body as { customer: unknown }).customer ? { status: 400, json: { message: "bad customer" } } : { status: 201, json: { documentId: 445 } };
      return { status: 200, json: { estimateNumber: 955 } };
    };
    const reply = await ask("createEstimate", { customerId: 55, customerVehicleId: 901, mileageIn: null, shopNote: "", datalines: DATALINES });
    expect(reply.result).toEqual({ documentId: 445, estimateNumber: 955, customerAttached: false });
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
