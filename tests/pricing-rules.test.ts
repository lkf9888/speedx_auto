import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeVehicleKey, partsMarkup, quoteService, sanitizePartQuotes, staffPartQuotes, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";
import { buildEstimate, chargedHours } from "@/lib/repair-chat/pricing";
import { runTool, type ChatEvent } from "@/lib/repair-chat/tools";
import type { EstimateCard } from "@/lib/repair-chat/pricing";

// Shop rules from the ALLDATA invoice smoke test (2026-10-17): parts at cost × 1.3, at least 0.5 h labor per job.

const pna = {
  applications: [{ appID: "1", qtyPerCar: 1 }],
  quotes: [{ productQuotes: [{ appID: "1", partDescription: "Oxygen Sensor", seriesDescription: "OE", listPrice: 250, unitPrice: 100, availability: "local", qtyAvailable: 3 }] }],
};

describe("part prices", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("charge customers the shop's cost × markup, and the cost goes no further", () => {
    const [option] = sanitizePartQuotes(pna, null, "", 1.3);
    expect(option.listPrice).toBe(130);
    expect(JSON.stringify(option)).not.toMatch(/100|unitPrice/);
    expect(staffPartQuotes(pna, null, "", 1.3)[0]).toMatchObject({ listPrice: 130, prices: { unitPrice: 100, listPrice: 250 } });
  });

  it("fall back to WorldPac List when no markup is set", () => {
    expect(sanitizePartQuotes(pna, null, "", null)[0].listPrice).toBe(250);
  });

  it("use PARTS_MARKUP, else the tire markup", () => {
    vi.stubEnv("PARTS_MARKUP", "");
    vi.stubEnv("TIRE_MARKUP", "1.3");
    expect(partsMarkup()).toBe(1.3);
    vi.stubEnv("PARTS_MARKUP", "1.25");
    expect(partsMarkup()).toBe(1.25);
    vi.stubEnv("PARTS_MARKUP", "");
    vi.stubEnv("TIRE_MARKUP", "");
    expect(partsMarkup()).toBeNull();
  });
});

describe("labor minimum", () => {
  const job = { status: "ok" as const, serviceName: "Engine Air Filter Element R&R", position: "", laborHours: 0.2, laborNote: "", primaryPartName: "", partOptions: [], otherPartNames: [], partsNote: "" };

  it("charges at least 0.5 h and says so", () => {
    expect(chargedHours(0.2)).toBe(0.5);
    expect(chargedHours(1.1)).toBe(1.1);
    const card = buildEstimate("2023 Mercedes-Benz GLC300", job, "E-1");
    expect([card.laborHours, card.laborWalkIn]).toEqual([0.5, 60]);
    expect(card.laborNote).toContain("Minimum labor charge 0.5 h (labor guide 0.2 h)");
  });

  it("doesn't apply to a job charged at half because it's done with another", () => {
    expect(buildEstimate("car", { ...job, laborHours: 0.45, halved: true }, "E-2").laborHours).toBe(0.45);
  });
});

let nextBase = 720000;
const vehicle = (): VehicleRef => ({ baseVehicleId: (nextBase += 1), label: "2003 Honda Accord", attributes: [] });

/** A labor job whose catalog entry links no part; the part exists under its own name. */
function sensorCatalog(): CatalogApi & { posts: string[] } {
  const posts: string[] = [];
  return {
    posts,
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string, data: unknown) {
      posts.push(path);
      const d = data as Record<string, unknown>;
      if (path === "labor-ops-list") return { laborOperations: [{ applicationID: 1, assetName: "a", position: { description: "Front" } }] } as T;
      if (path === "labor-ops-details") return { laborOperation: { estimateTimeHour: 0.5, laborCategoryName: "Oxygen Sensor R&R", applications: [] } } as T;
      if (path === "vehicle/refine") return { recommendedVehAttrs: [] } as T;
      if (path === "category/details") {
        if (!d.categoryCode) return { replacementParts: [{ code: "E", description: "Emission Control" }] } as T;
        if (d.categoryCode === "E") return { replacementParts: [{ code: "EA", description: "Oxygen Sensors" }] } as T;
        if (d.categoryCode === "EA") return { partTypes: [{ code: "N1", description: "Oxygen Sensor" }, { code: "N2", description: "Air Fuel Ratio Sensor" }] } as T;
      }
      if (path === "pna360_cat") {
        return {
          applications: [{ appID: "1", qtyPerCar: 1 }, { appID: "2", qtyPerCar: 1 }],
          quotes: [
            {
              productQuotes: [
                { appID: "1", partDescription: "Oxygen Sensor", seriesDescription: "Upstream", listPrice: 300, unitPrice: 120, position: { description: "Front" } },
                { appID: "2", partDescription: "Oxygen Sensor", seriesDescription: "Downstream", listPrice: 280, unitPrice: 110, position: { description: "Rear" } },
              ],
            },
          ],
        } as T;
      }
      throw new Error(`unexpected ${path}`);
    },
  } as CatalogApi & { posts: string[] };
}

describe("parts for jobs whose catalog entry links none", () => {
  it("are found by the job's name, at the job's position, with a note", async () => {
    const api = sensorCatalog();
    const quote = await quoteService(api, vehicle(), 77, null);
    expect(quote.status).toBe("ok");
    if (quote.status !== "ok") return;
    expect(quote.partOptions.map((o) => o.series)).toEqual(["Upstream"]);
    expect(quote.partsNote).toMatch(/matched by name/);
    expect(api.posts).toContain("pna360_cat");
  });
});

describe("per-configuration cards", () => {
  it("become one card when the detail doesn't change the price", async () => {
    const api: CatalogApi = {
      async get() {
        throw new Error("unused");
      },
      async post<T>(path: string, data: unknown) {
        const d = data as Record<string, unknown>;
        const trim = (d.refinedVehAttrIDs as Array<{ name?: string }> | undefined)?.find((a) => a.name === "SubModel");
        if (path === "vehicle/refine") return { recommendedVehAttrs: [{ attrName: "SubModel", attrDesc: "Sub Model", vehAttrs: ["S", "SV", "SL"].map((v, i) => ({ isEnabled: true, value: { key: 30 + i, value: v } })) }] } as T;
        if (path === "labor-ops-list") {
          if (!trim) return { vehAttrOptions: [{ attrName: "SubModel", attrDesc: "Sub Model", vehAttrs: [{ value: { value: "S" } }, { value: { value: "SV" } }, { value: { value: "SL" } }] }] } as T;
          return { laborOperations: [{ applicationID: 1, assetName: "a", position: { description: "" } }] } as T;
        }
        if (path === "labor-ops-details") return { laborOperation: { estimateTimeHour: 0.8, laborCategoryName: "Brake Pads R&R", applications: [] } } as T;
        if (path === "category/details") return {} as T;
        throw new Error(path);
      },
    };
    const car: VehicleRef = { baseVehicleId: (nextBase += 1), label: "2018 Nissan Rogue", attributes: [] };
    const out = await runTool(api, "get_estimate", { vehicle_key: encodeVehicleKey(car), service_id: 5, position: null }, () => "E-1", "en");
    const cards = out.events.filter((e: ChatEvent): e is { type: "estimate"; estimate: EstimateCard } => e.type === "estimate").map((e) => e.estimate);
    expect(cards).toHaveLength(1);
    expect(cards[0].vehicle).toBe("2018 Nissan Rogue");
    expect(JSON.parse(out.content).note).toMatch(/same for every Sub Model/);
  });
});
