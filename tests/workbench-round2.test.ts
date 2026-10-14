import { describe, expect, it } from "vitest";
import { runWorkbenchTool, WORKBENCH_PROMPT, WORKBENCH_TOOLS, type WorkbenchEvent } from "@/lib/workbench/assistant";
import { encodeVehicleKey, staffPartsByName, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";
import type { StaffQuote } from "@/lib/workbench/quote";

let nextBase = 700000;
const vehicle = (): VehicleRef => ({ baseVehicleId: (nextBase += 1), label: "2016 Honda CR-V EX", attributes: [] });
const quotes = (events: WorkbenchEvent[]) => events.filter((e): e is { type: "quote"; quote: StaffQuote } => e.type === "quote").map((e) => e.quote);

/** A speedDIAL with a Brakes system that has rotor parts but no rotor labor job. */
function brakesCatalog(onPost: (path: string, data: Record<string, unknown>) => unknown): CatalogApi {
  return {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string, data: unknown) {
      const d = data as Record<string, unknown>;
      if (path === "category/details") {
        if (!d.categoryCode) return { replacementParts: [{ code: "BR", description: "Brake" }] } as T;
        return {
          laborOperations: [{ acaPartTerminologyID: 1684, description: "Brake Pads R&R" }],
          replacementParts: [
            { code: "N1896", description: "Disc Brake Rotor" },
            { code: "N1010", description: "Brake Pad Set" },
          ],
        } as T;
      }
      return onPost(path, d) as T;
    },
  };
}

describe("find_parts", () => {
  it("prices rotors with no labor job, front only, with cost and links", async () => {
    let asked: unknown = null;
    const api = brakesCatalog((path, data) => {
      if (path !== "pna360_cat") throw new Error(path);
      asked = data.partTypes;
      return {
        quotes: [
          {
            productQuotes: [
              { partDescription: "Disc Brake Rotor", seriesDescription: "OE", listPrice: 120, unitPrice: 60, availability: "today-local", qtyAvailable: 4, manufacturerPart: "R-F", position: { description: "Front" } },
              { partDescription: "Disc Brake Rotor", seriesDescription: "OE", listPrice: 100, unitPrice: 50, availability: "today-local", qtyAvailable: 4, manufacturerPart: "R-R", position: { description: "Rear" } },
            ],
          },
        ],
      };
    });
    const out = await runWorkbenchTool(api, "find_parts", { vehicle_key: encodeVehicleKey(vehicle()), part: "brake rotor", position: "Front" }, () => "W-1", null);
    expect(asked).toEqual([expect.objectContaining({ categoryCode: "N1896", positionID: -1 })]);
    const [card] = quotes(out.events);
    expect(card).toMatchObject({ kind: "labor", supplier: "worldpac", labor: null, service: "Disc Brake Rotor（只查零件）", position: "Front" });
    expect(card.options.map((o) => [o.partNumber, o.customerTotal, o.unitCost])).toEqual([["R-F", 120, 60]]);
    expect(card.notes[0]).toContain("不含工时");
  });

  it("says when there is no such part", async () => {
    const api = brakesCatalog(() => ({ quotes: [] }));
    expect(await staffPartsByName(api, vehicle(), "turbocharger", null)).toEqual({ status: "not_found", similar: [] });
  });
});

describe("quoting each variant", () => {
  it("quotes both engines instead of asking which one", async () => {
    const car = vehicle();
    const api: CatalogApi = {
      async get() {
        throw new Error("unused");
      },
      async post<T>(path: string, data: unknown) {
        const d = data as Record<string, unknown>;
        const engine = (d.refinedVehAttrIDs as Array<{ name?: string; value?: number }> | undefined)?.find((a) => a.name === "EngineBase");
        if (path === "vehicle/refine") {
          return { recommendedVehAttrs: [{ attrName: "EngineBase", attrDesc: "Engine", vehAttrs: [{ isEnabled: true, value: { key: 18, value: "1.8 L4" } }, { isEnabled: true, value: { key: 24, value: "2.4 L4" } }] }] } as T;
        }
        if (path === "labor-ops-list") {
          if (!engine) return { vehAttrOptions: [{ attrName: "EngineBase", attrDesc: "Engine", vehAttrs: [{ value: { value: "1.8 L4" } }, { value: { value: "2.4 L4" } }] }] } as T;
          return { laborOperations: [{ applicationID: 1, assetName: "wp", position: { description: "" } }] } as T;
        }
        if (path === "labor-ops-details") {
          return { laborOperation: { estimateTimeHour: engine?.value === 24 ? 3.2 : 2.1, laborCategoryName: "Water Pump R&R", applications: [] } } as T;
        }
        throw new Error(path);
      },
    };
    const out = await runWorkbenchTool(api, "get_estimate", { vehicle_key: encodeVehicleKey(car), service_id: 9, position: null }, () => "W-1", null);
    const cards = quotes(out.events);
    expect(cards.map((c) => [c.vehicle, c.labor?.hours])).toEqual([
      ["2016 Honda CR-V EX 1.8 L4", 2.1],
      ["2016 Honda CR-V EX 2.4 L4", 3.2],
    ]);
    expect(JSON.parse(out.content).note).toContain("each option was quoted");
  });
});

describe("tire mounting without a car", () => {
  it("prices the customer's own tires by type and count", async () => {
    const api = { get: async () => ({}), post: async () => ({}) } as unknown as CatalogApi;
    const all = quotes((await runWorkbenchTool(api, "get_flat_price", { service: "tire_change", vehicle_key: "", tire_count: 4 }, () => "W-1", null)).events);
    expect(all[0].options.map((o) => [o.unitPrice, o.customerTotal])).toEqual([
      [25, 100],
      [30, 120],
      [35, 140],
      [45, 180],
    ]);
    const nineteen = quotes((await runWorkbenchTool(api, "get_flat_price", { service: "tire_change", vehicle_key: "", tire_type: "over_18", tire_count: 2 }, () => "W-1", null)).events);
    expect(nineteen[0]).toMatchObject({ kind: "flat", options: [expect.objectContaining({ label: "普通胎（19 寸及以上）", customerTotal: 60 })] });
  });
});

describe("shop labor rules in the prompt", () => {
  it("states the half-time rule for jobs done together, per-side doubling and the customer-text divider", () => {
    expect(WORKBENCH_PROMPT).toContain("0.9 + 0.45 = 1.35 h");
    expect(WORKBENCH_PROMPT).toContain("double the hours and the part quantity");
    expect(WORKBENCH_PROMPT).toContain("—— 发给客人 ——");
    expect(WORKBENCH_TOOLS.map((t) => t.name)).toContain("find_parts");
  });
});
