import { describe, expect, it } from "vitest";
import { encodeVehicleKey, isSoldByVolume, quoteService, sanitizePartQuotes, staffPartQuotes, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";
import { buildEstimate, laborShortfall, minimumLaborCard } from "@/lib/repair-chat/pricing";
import { PUBLIC_PROFILE } from "@/lib/repair-chat/agent";
import { WORKBENCH_PROFILE } from "@/lib/workbench/assistant";
import { buildLaborQuote } from "@/lib/workbench/quote";
import { parseDraftInput } from "@/lib/workbench/alldata-draft";
import { runTool, type ChatEvent } from "@/lib/repair-chat/tools";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { surchargeOf } from "@/lib/workbench/surcharge";

// Shop rules from the ALLDATA invoice smoke test (2026-10-17): WorldPac parts at List, others at cost × 1.3 with the surcharge shown, at least 0.5 h labor per order (Kevin, 2026-10-21: per order, not per job).

const pna = {
  applications: [{ appID: "1", qtyPerCar: 1 }],
  quotes: [{ productQuotes: [{ appID: "1", partDescription: "Oxygen Sensor", seriesDescription: "OE", listPrice: 250, unitPrice: 100, availability: "local", qtyAvailable: 3 }] }],
};

describe("WorldPac part prices", () => {
  it("are WorldPac's suggested retail (List), and the cost goes no further", () => {
    const [option] = sanitizePartQuotes(pna, null, "");
    expect(option.listPrice).toBe(250);
    expect(JSON.stringify(option)).not.toMatch(/\b100\b|unitPrice/);
    expect(staffPartQuotes(pna, null, "")[0]).toMatchObject({ listPrice: 250, prices: { unitPrice: 100, listPrice: 250 } });
  });
});

describe("labor minimum per order", () => {
  const job = (hours: number, service = "Engine Air Filter Element R&R") =>
    ({ status: "ok" as const, serviceName: service, position: "", laborHours: hours, laborNote: "", primaryPartName: "", partOptions: [], otherPartNames: [], partsNote: "" });

  it("leaves each job at its labor-guide hours", () => {
    expect(buildEstimate("2023 Mercedes-Benz GLC300", job(0.2), "E-1").laborHours).toBe(0.2);
  });

  it("tops the whole order up to 0.5 h once, not each job", () => {
    expect(laborShortfall([0.3, 0.15])).toBe(0.05);
    expect(laborShortfall([0.6])).toBe(0);
    expect(laborShortfall([])).toBe(0);
    const engine = buildEstimate("2022 Mitsubishi Outlander", job(0.3), "E-1");
    const cabin = buildEstimate("2022 Mitsubishi Outlander", job(0.15, "Cabin Air Filter R&R"), "E-2");
    const extra = minimumLaborCard([engine, cabin], "zh-CN", "E-3")!;
    expect([extra.service, extra.laborHours, extra.laborWalkIn, extra.vehicle]).toEqual(["最低工时补足（整单不足 0.5 小时）", 0.05, 6, "2022 Mitsubishi Outlander"]);
    expect(extra.laborNote).toContain("add up to 0.45 h");
    expect(minimumLaborCard([buildEstimate("car", job(0.8), "E-4")], "en", "E-5")).toBeNull();
  });

  it("is added after the reply's cards, in both assistants", () => {
    const cards = [buildEstimate("car", job(0.2), "E-1")];
    const publicExtra = PUBLIC_PROFILE.finishTurn!(cards.map((estimate) => ({ type: "estimate" as const, estimate })), () => "E-9", "en");
    expect(publicExtra).toEqual([{ type: "estimate", estimate: expect.objectContaining({ id: "E-9", laborHours: 0.3, lang: "en" }) }]);

    const staffQuote = buildLaborQuote("car", { serviceName: "Cabin Air Filter R&R", position: "", laborHours: 0.15, laborNote: "", primaryPartName: "", otherPartNames: [], partsNote: "", partOptions: [] }, "W-1");
    const staffExtra = WORKBENCH_PROFILE.finishTurn!([{ type: "quote", quote: staffQuote }], () => "W-2", "zh-CN");
    expect(staffExtra).toHaveLength(1);
    expect(staffExtra[0]).toMatchObject({ type: "quote", quote: { id: "W-2", service: "最低工时补足（整单不足 0.5 小时）", labor: { hours: 0.35, walkIn: 42 } } });
    expect(WORKBENCH_PROFILE.finishTurn!([], () => "W-3", "en")).toEqual([]);
  });

  it("is added to ALLDATA drafts whose labor is under 0.5 h", () => {
    const draft = parseDraftInput({ lines: [{ kind: "labor", description: "Cabin filter", quantity: 0.2, unit_price: 120 }, { kind: "part", description: "Filter", quantity: 1, unit_price: 30 }] }, "D-1");
    expect("lines" in draft && draft.lines.at(-1)).toMatchObject({ kind: "labor", description: "Minimum labor charge (order under 0.5 h)", quantity: 0.3, unitPrice: 120 });
    const enough = parseDraftInput({ lines: [{ kind: "labor", description: "Pads", quantity: 0.9, unit_price: 120 }] }, "D-2");
    expect("lines" in enough && enough.lines).toHaveLength(1);
  });
});

let nextBase = 720000;
const vehicle = (): VehicleRef => ({ baseVehicleId: (nextBase += 1), label: "2003 Honda Accord", attributes: [] });

/** A labor job whose catalog entry links no part; the part exists under its own name. */
function sensorCatalog(job = "Oxygen Sensor R&R", partTypes = [{ code: "N1", description: "Oxygen Sensor" }, { code: "N2", description: "Air Fuel Ratio Sensor" }], positions = ["Front", "Rear"]): CatalogApi & { posts: string[]; codes: string[] } {
  const codes: string[] = [];
  const posts: string[] = [];
  return {
    posts,
    codes,
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string, data: unknown) {
      posts.push(path);
      const d = data as Record<string, unknown>;
      if (path === "labor-ops-list") return { laborOperations: [{ applicationID: 1, assetName: "a", position: { description: "Front" } }] } as T;
      if (path === "labor-ops-details") return { laborOperation: { estimateTimeHour: 0.5, laborCategoryName: job, applications: [] } } as T;
      if (path === "vehicle/refine") return { recommendedVehAttrs: [] } as T;
      if (path === "category/details") {
        if (!d.categoryCode) return { replacementParts: [{ code: "E", description: "Emission Control" }] } as T;
        if (d.categoryCode === "E") return { replacementParts: [{ code: "EA", description: "Oxygen Sensors" }] } as T;
        if (d.categoryCode === "EA") return { partTypes } as T;
      }
      if (path === "pna360_cat") {
        codes.push(((d.partTypes as Array<{ categoryCode: string }>)[0]).categoryCode);
        return {
          applications: [{ appID: "1", qtyPerCar: 1 }, { appID: "2", qtyPerCar: 1 }],
          quotes: [
            {
              productQuotes: [
                { appID: "1", partDescription: "Oxygen Sensor", seriesDescription: "Upstream", listPrice: 300, unitPrice: 120, position: { description: positions[0] } },
                { appID: "2", partDescription: "Oxygen Sensor", seriesDescription: "Downstream", listPrice: 280, unitPrice: 110, position: { description: positions[1] } },
              ],
            },
          ],
        } as T;
      }
      throw new Error(`unexpected ${path}`);
    },
  } as CatalogApi & { posts: string[]; codes: string[] };
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

  it("keep every part when the parts name positions differently from the labor guide", async () => {
    const quote = await quoteService(sensorCatalog(undefined, undefined, ["Upstream", "Downstream"]), vehicle(), 78, null);
    expect(quote.status === "ok" && quote.partOptions.map((o) => o.series).sort()).toEqual(["Downstream", "Upstream"]);
  });

  it("pick the job's own part, not a seal or resistor that shares its name", async () => {
    const api = sensorCatalog("HVAC Blower Motor R&R", [{ code: "S1", description: "HVAC Blower Motor Seal" }, { code: "M1", description: "HVAC Blower Motor" }, { code: "R1", description: "HVAC Blower Motor Resistor" }]);
    await quoteService(api, vehicle(), 79, null);
    expect(api.codes).toEqual(["M1"]);
  });
});

describe("parts billed by volume", () => {
  it("are fluids, not hardware named after a fluid", () => {
    expect(isSoldByVolume("Auto Trans Fluid")).toBe(true);
    expect(isSoldByVolume("Engine Oil")).toBe(true);
    expect(isSoldByVolume("Engine Oil Cooler")).toBe(false);
    expect(isSoldByVolume("Radiator Coolant Hose")).toBe(false);
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

/** A car whose labor guide has pad and caliper-pin jobs but no rotor or caliper job. */
function journeyCatalog(withRotorJob = false): CatalogApi {
  return {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string, data: unknown) {
      const d = data as Record<string, unknown>;
      if (path === "category/details") {
        if (!d.categoryCode) return { replacementParts: [{ code: "B", description: "Brake" }] } as T;
        if (d.categoryCode === "B") {
          const jobs = [
            { acaPartTerminologyID: 1684, description: "Brake Pads R&R" },
            { acaPartTerminologyID: 1700, description: "Disc Brake Caliper Guide Pin R&R" },
            ...(withRotorJob ? [{ acaPartTerminologyID: 1896, description: "Brake Rotor R&R" }] : []),
          ];
          return { laborOperations: jobs, replacementParts: [{ code: "BA", description: "Brake" }] } as T;
        }
        if (d.categoryCode === "BA") return { partTypes: [{ code: "N1896", description: "Disc Brake Rotor" }, { code: "N1700", description: "Disc Brake Caliper" }, { code: "N1010", description: "Brake Pad Set" }] } as T;
      }
      if (path === "pna360_cat") {
        const code = (d.partTypes as Array<{ categoryCode: string }>)[0].categoryCode;
        const name = code === "N1896" ? "Brake Disc" : "Brake Caliper";
        return {
          applications: [{ appID: "1", qtyPerCar: 2 }, { appID: "2", qtyPerCar: 2 }],
          quotes: [
            {
              productQuotes: [
                { appID: "1", partDescription: name, seriesDescription: "Front", listPrice: 120, unitPrice: 60, position: { description: "Front" } },
                { appID: "2", partDescription: name, seriesDescription: "Rear", listPrice: 100, unitPrice: 50, position: { description: "Rear" } },
              ],
            },
          ],
        } as T;
      }
      throw new Error(`unexpected ${path}`);
    },
  };
}

describe("rotors and calipers with no labor-guide job", () => {
  const ask = (api: CatalogApi, part: string, count = 1) =>
    runTool(api, "quote_extra_part", { vehicle_key: encodeVehicleKey({ baseVehicleId: (nextBase += 1), label: "2015 Dodge Journey", attributes: [] }), part, position: "Front", count }, () => "E-1", "en");
  const card = (out: Awaited<ReturnType<typeof ask>>) => out.events.find((e: ChatEvent): e is { type: "estimate"; estimate: EstimateCard } => e.type === "estimate")!.estimate;

  it("charge 0.5 h per axle for rotors, with the front rotors at List", async () => {
    const c = card(await ask(journeyCatalog(), "brake_rotor"));
    expect([c.service, c.position, c.laborHours, c.laborWalkIn]).toEqual(["Brake Rotor R&R", "Front", 0.5, 60]);
    expect(c.partOptions).toEqual([expect.objectContaining({ unitListPrice: 120, quantity: 2 })]);
    expect(c.laborNote).toMatch(/0\.5 h per axle/);
  });

  it("charge 0.5 h per caliper", async () => {
    const c = card(await ask(journeyCatalog(), "brake_caliper", 2));
    expect([c.laborHours, c.partOptions[0].quantity]).toEqual([1, 2]);
  });

  it("send the assistant to the guide's job when there is one", async () => {
    const out = await ask(journeyCatalog(true), "brake_rotor");
    expect(JSON.parse(out.content)).toMatchObject({ status: "use_get_estimate", service_id: 1896 });
    expect(out.events).toEqual([]);
  });
});

describe("surcharge on staff cards", () => {
  it("is the customer price over cost: List for WorldPac, the markup for tires", () => {
    expect(surchargeOf({ kind: "labor" }, { unitPrice: 130, unitCost: 100, prices: {} })).toBe(0.3);
    expect(surchargeOf({ kind: "tires" }, { unitPrice: 160, unitCost: 100, prices: { retail: 130, cost: 100 } })).toBe(0.3);
    expect(surchargeOf({ kind: "flat" }, { unitPrice: 80, unitCost: null, prices: {} })).toBeNull();
  });
});
