import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { matchVehicle, partTypeOf, readVar, resetNexpartTables, usagesFor, westcanLookup } from "@/lib/westcan/nexpart";
import { buildLaborQuote, type StaffQuote } from "@/lib/workbench/quote";
import { mergeWestcan, readWestcanRows } from "@/lib/workbench/westcan";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-15: Westcan (Nexpart) parts at cost × 1.3; order WorldPac
// local → Westcan → WorldPac ordered in → 待补价.

const VEHICLE_JS = `var yearMakeMap = {"2019":{"76":[5,6]},"2021":{"2":[6]}};
var makeMap = [{"m":"Toyota","i":76},{"m":"Porsche","i":2},{"m":"Land Rover","i":7}];
var modelMap = [{"m":"Camry","i":1011,"v":[5]},{"m":"Camry Solara","i":1012,"v":[5]},{"m":"Cayenne","i":19,"v":[6]},{"m":"Cayenne \\"E\\"","i":20,"v":[6]}];
var ymm = {"2019":{"5":[1]}};`;
const POSITION_JS = `var partTypesPositionsListACES = {"61":{"1896":"Front","1684":"Front"},"62":{"1896":"Rear"},"65":{"1710":"Front"}};`;
const get = async (url: string) => (url.includes("mmV4") ? VEHICLE_JS : POSITION_JS);

const camry = { baseVehicleId: 146565, label: "2019 Toyota Camry", attributes: [{ name: "SubModel", id: 269, label: "LE" }, { name: "EngineBase", id: 1, label: "2.5 L4" }] };

describe("Nexpart vehicle and part matching", () => {
  beforeEach(() => resetNexpartTables());

  it("reads Nexpart's static tables", () => {
    expect(readVar(VEHICLE_JS, "makeMap")).toHaveLength(3);
    expect(readVar(VEHICLE_JS, "modelMap")).toContainEqual({ m: 'Cayenne "E"', i: 20, v: [6] });
    expect(readVar("nothing", "makeMap")).toBeNull();
  });

  it("matches a WorldPac vehicle to Nexpart's make and model, and the part to its position group", async () => {
    const lookup = await westcanLookup(camry, "N1896", "Front", { get });
    expect(lookup).toEqual({
      year: 2019,
      makeId: 76,
      make: "Toyota",
      model: "Camry",
      models: [{ id: 1011, vehType: 5 }],
      engine: "2.5 L4",
      submodel: "LE",
      partTypes: [1896],
      usages: [61],
      multiplier: 1,
    });
    expect((await westcanLookup(camry, "N1896", "Front, both sides", { get, bothSides: true }))?.multiplier).toBe(2);
  });

  it("takes the longest model name that fits and skips what it can't match", () => {
    const tables = { makes: readVar(VEHICLE_JS, "makeMap"), models: readVar(VEHICLE_JS, "modelMap"), yearMakes: readVar(VEHICLE_JS, "yearMakeMap") } as never;
    expect(matchVehicle("2019 Toyota Camry Solara", tables)?.models).toEqual([{ id: 1012, vehType: 5 }]);
    expect(matchVehicle("2021 Porsche Cayenne", tables)?.models).toEqual([{ id: 19, vehType: 6 }]);
    expect(matchVehicle("2019 Porsche Cayenne", tables)).toBeNull();
    expect(matchVehicle("VIN 123456", tables)).toBeNull();
  });

  it("needs a part type and, for front/rear parts, a position group", async () => {
    expect(partTypeOf("N1896")).toBe(1896);
    expect(partTypeOf("BA")).toBeNull();
    expect(await westcanLookup(camry, "", "Front", { get })).toBeNull();
    expect(await westcanLookup(camry, "N1710", "Rear", { get })).toBeNull();
    const table = readVar(POSITION_JS, "partTypesPositionsListACES") as Record<string, Record<string, string>>;
    expect(usagesFor(table, 1896, "Rear")).toEqual([62]);
    expect(usagesFor(table, 1896, "")).toEqual([]);
  });

  it("is off in tests unless the tables are handed in", async () => {
    expect(await westcanLookup(camry, "N1896", "Front")).toBeNull();
  });
});

const env = {} as NodeJS.ProcessEnv;
const lookup = { year: 2018, makeId: 59, make: "Honda", model: "Civic", models: [{ id: 752, vehType: 5 }], engine: "", submodel: "", partTypes: [1896], usages: [61], multiplier: 1 };

const transfer: StaffPartOption = {
  description: "Brake Disc",
  series: "",
  listPrice: 150,
  quantity: 2,
  inStockLocally: false,
  note: "",
  prices: { unitPrice: 80 },
  partNumber: "WP-1",
  brand: "Brembo",
  availability: "Wednesday",
  qtyAvailable: 0,
  fields: {},
};

const quoteWith = (parts: StaffPartOption[]): StaffQuote => ({
  ...buildLaborQuote("2018 Honda Civic", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 1, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: parts }, "W-1", env),
  westcan: { lookup },
});

const row = (over: Record<string, unknown> = {}) => ({
  brand: "RS PARTS",
  partNumber: "RS1",
  partType: "1896",
  position: "Front",
  description: "BRAKE ROTOR (BLACK HAT)",
  cost: "43.52",
  list: "89.43",
  stockHere: 6,
  stockOther: 34,
  branch: "W.C Richmond",
  eta: "",
  specialOrder: false,
  perCar: "2",
  ...over,
});

describe("merging Westcan's answer", () => {
  it("prices Westcan parts at cost × 1.3 and puts them before WorldPac ordered-in parts", () => {
    const merged = mergeWestcan(quoteWith([transfer]), { status: "ok", vehicle: "2018 Honda Civic LX 2.0L L4", rows: [row()] });
    const [westcan, worldpac] = merged.options;
    expect(westcan).toMatchObject({ source: "westcan", brand: "RS PARTS", quantity: 2, unitPrice: 56.58, unitCost: 43.52, stock: "Westcan Richmond 有货（6）" });
    // 2 × 56.58 + 1 h × $120 walk-in labor.
    expect(westcan.customerTotal).toBe(233.16);
    expect(westcan.costTotal).toBe(87.04);
    expect(westcan.friendTotal).toBe(113.15 + 96);
    expect(worldpac).toMatchObject({ partNumber: "WP-1", outOfStock: true });
    expect(worldpac.eta).toBeUndefined();
    expect(merged.westcan?.checked).toMatchObject({ found: 1, vehicle: "2018 Honda Civic LX 2.0L L4" });
    expect(merged.customerText).toContain("233.16");
    expect(merged.customerText).not.toMatch(/43\.52|RS1/);
  });

  it("offers other Westcan branches as next day when Richmond has none", () => {
    const merged = mergeWestcan(quoteWith([transfer]), { status: "ok", rows: [row({ stockHere: 0 })] });
    expect(merged.options[0]).toMatchObject({ source: "westcan", eta: "明天到" });
    expect(merged.options[0].outOfStock).toBeUndefined();
    expect(merged.options[1].outOfStock).toBe(true);
  });

  it("only offers Richmond stock when Richmond has some", () => {
    const merged = mergeWestcan(quoteWith([]), { status: "ok", rows: [row({ partNumber: "FAR", stockHere: 0, cost: "20" }), row()] });
    expect(merged.options.map((o) => [o.partNumber, Boolean(o.outOfStock)])).toEqual([
      ["RS1", false],
      ["FAR", true],
    ]);
    // The labor-only line is gone once a part is offered.
    expect(merged.options.some((o) => o.label.startsWith("仅工时"))).toBe(false);
  });

  it("skips special orders, unpriced and unstocked parts, and leaves the quote alone when nothing is left", () => {
    const q = quoteWith([transfer]);
    const merged = mergeWestcan(q, { status: "ok", rows: [row({ specialOrder: true }), row({ cost: "" }), row({ stockHere: 0, stockOther: 0 })] });
    expect(merged.options).toEqual(q.options);
    expect(merged.westcan?.checked).toMatchObject({ found: 0, note: "Westcan 也没有能用的现货。" });
  });

  it("keeps WorldPac local stock first", () => {
    const local = { ...transfer, inStockLocally: true, availability: "Monday-local", qtyAvailable: 4 };
    const q = quoteWith([local]);
    const merged = mergeWestcan(q, { status: "ok", rows: [row()] });
    expect(merged.options).toEqual(q.options);
    expect(merged.westcan?.checked?.note).toContain("WorldPac 本地有货");
  });

  it("pairs Westcan's left and right part numbers into one set", () => {
    const parts = readWestcanRows([row({ partNumber: "L1", position: "Front Left", perCar: "1", cost: "100" }), row({ partNumber: "R1", position: "Front Right", perCar: "1", cost: "110" })]);
    expect(parts).toHaveLength(2);
    const merged = mergeWestcan(quoteWith([]), { status: "ok", rows: [row({ partNumber: "L1", position: "Front Left", perCar: "1", cost: "100" }), row({ partNumber: "R1", position: "Front Right", perCar: "1", cost: "110" }), row({ partNumber: "L2", brand: "OTHER", position: "Front Left", cost: "5" })] });
    const offered = merged.options.filter((o) => !o.outOfStock);
    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ partNumber: "L1 + R1", quantity: 1, unitCost: 210, unitPrice: 273 });
  });

  it("doubles per-side parts on both-sides jobs", () => {
    expect(readWestcanRows([row({ perCar: "1" })], 2)[0].quantity).toBe(2);
  });

  it("asks for the engine when Nexpart can't tell", () => {
    const merged = mergeWestcan(quoteWith([transfer]), { status: "need_engine", engines: ["2.0L L4", "1.5L L4 Turbo"] });
    expect(merged.westcan?.checked?.note).toContain("2.0L L4 / 1.5L L4 Turbo");
    expect(merged.options).toHaveLength(1);
  });

  it("refuses rows that aren't parts", () => {
    expect(readWestcanRows("x")).toEqual([]);
    expect(readWestcanRows([null, 3, row({ cost: "-5" }), row({ cost: "999999" })])).toEqual([]);
  });
});

describe("the quote card", () => {
  it("says Westcan is being checked, or why it couldn't be", () => {
    const { unmount } = render(<StaffQuoteCard quote={quoteWith([transfer])} onRetryWestcan={() => undefined} />);
    expect(screen.getByTestId("westcan-status")).toHaveTextContent("正在用这台电脑的 Chrome 查 Westcan");
    unmount();
    render(<StaffQuoteCard quote={quoteWith([transfer])} westcanError="没登录" onRetryWestcan={() => undefined} />);
    expect(screen.getByTestId("westcan-status")).toHaveTextContent("没查成 Westcan：没登录");
    expect(screen.getByRole("button", { name: "重试 Westcan" })).toBeInTheDocument();
  });

  it("marks Westcan parts", () => {
    const merged = mergeWestcan(quoteWith([transfer]), { status: "ok", rows: [row({ stockHere: 0 })] });
    render(<StaffQuoteCard quote={merged} tier="retail" />);
    expect(screen.getByTestId("westcan-badge")).toHaveTextContent("Westcan");
    expect(screen.getByTestId("eta")).toHaveTextContent("其他分店调货 · 明天到");
    expect(screen.getByTestId("westcan-status")).toHaveTextContent("已查 Westcan：1 个可用零件");
  });
});

describe("saving Westcan's answer", () => {
  it("merges it once into the stored quote; a second answer doesn't change it", async () => {
    const { ConversationStore } = await import("@/lib/workbench/conversations");
    const { handleConversation } = await import("@/lib/workbench/conversations-http");
    const { memoryKv } = await import("@/lib/workbench/kv");
    const store = new ConversationStore(memoryKv());
    const quote = quoteWith([transfer]);
    await store.append("cwest01", "a@x", [{ id: "t1", role: "assistant", text: "", author: "assistant", at: 1, quotes: [quote] }], undefined, "Civic");
    const deps = { user: async () => ({ email: "a@x" }), store: () => store, log: () => {} };
    const patch = (body: unknown) => new Request("https://repair.speedxrental.com/api/workbench/conversations/cwest01", { method: "PATCH", body: JSON.stringify(body) });
    const first = await handleConversation(patch({ card: { kind: "westcan", itemId: quote.id, answer: { status: "ok", rows: [row()] } } }), "cwest01", deps as never);
    expect(first.status).toBe(200);
    const saved = (await store.get("cwest01"))!.turns[0].quotes[0];
    expect(saved.options[0].source).toBe("westcan");
    await handleConversation(patch({ card: { kind: "westcan", itemId: quote.id, answer: { status: "ok", rows: [row({ cost: "1" })] } } }), "cwest01", deps as never);
    expect((await store.get("cwest01"))!.turns[0].quotes[0].options[0].unitCost).toBe(43.52);
    expect((await handleConversation(patch({ card: { kind: "westcan", itemId: quote.id, answer: { status: "hacked" } } }), "cwest01", deps as never)).status).toBe(400);
    expect((await handleConversation(patch({ card: { kind: "westcan", itemId: "W-NOPE", answer: { status: "ok", rows: [] } } }), "cwest01", deps as never)).status).toBe(404);
  });
});

describe("review fixes", () => {
  it("drops rows of another part type, keeps the per-car count on both-sides jobs, and treats left + right parts as unsided", () => {
    expect(readWestcanRows([row({ partType: "1684" })], 1, [1896])).toEqual([]);
    expect(readWestcanRows([row({ perCar: "2" })], 2)[0].quantity).toBe(2);
    const both = readWestcanRows([row({ position: "Front Left, Front Right", perCar: "1" })]);
    expect(both[0].side).toBeUndefined();
  });

  it("keeps part numbers out of the description", () => {
    expect(readWestcanRows([row({ description: "ROTOR RS1 BLACK HAT" })])[0].description).toBe("ROTOR BLACK HAT");
  });

  it("won't save final prices while Westcan is still being checked", async () => {
    const { ConversationStore } = await import("@/lib/workbench/conversations");
    const { memoryKv } = await import("@/lib/workbench/kv");
    const store = new ConversationStore(memoryKv());
    const quote = quoteWith([transfer]);
    await store.append("cwest02", "a@x", [{ id: "t1", role: "assistant", text: "", author: "assistant", at: 1, quotes: [quote] }], undefined, "Civic");
    await expect(store.markCard("cwest02", "a@x", { kind: "quote", itemId: quote.id, totals: { 0: 100 } })).rejects.toThrow(/Westcan/);
  });
});
