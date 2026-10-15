import { describe, expect, it } from "vitest";
import { runTool, type ChatEvent } from "@/lib/repair-chat/tools";
import { SYSTEM_PROMPT } from "@/lib/repair-chat/prompt";
import { encodeVehicleKey, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";
import type { EstimateCard } from "@/lib/repair-chat/pricing";

let nextBase = 710000;
const vehicle = (): VehicleRef => ({ baseVehicleId: (nextBase += 1), label: "2016 Honda CR-V EX", attributes: [] });

/** A car whose water pump labor depends on the engine; `engines` lists what speedDIAL offers. */
function engineCatalog(engines: string[]): CatalogApi {
  const keys = new Map(engines.map((name, i) => [name, 10 + i]));
  return {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string, data: unknown) {
      const d = data as Record<string, unknown>;
      const engine = (d.refinedVehAttrIDs as Array<{ name?: string; value?: number }> | undefined)?.find((a) => a.name === "EngineBase");
      if (path === "vehicle/refine") {
        return { recommendedVehAttrs: [{ attrName: "EngineBase", attrDesc: "Engine", vehAttrs: engines.map((value) => ({ isEnabled: true, value: { key: keys.get(value), value } })) }] } as T;
      }
      if (path === "labor-ops-list") {
        if (!engine) return { vehAttrOptions: [{ attrName: "EngineBase", attrDesc: "Engine", vehAttrs: engines.map((value) => ({ value: { value } })) }] } as T;
        return { laborOperations: [{ applicationID: 1, assetName: "wp", position: { description: "" } }] } as T;
      }
      if (path === "labor-ops-details") {
        return { laborOperation: { estimateTimeHour: engine?.value === 11 ? 3.2 : 2.1, laborCategoryName: "Water Pump R&R", applications: [] } } as T;
      }
      throw new Error(path);
    },
  };
}

const cards = (events: ChatEvent[]) => events.filter((e): e is { type: "estimate"; estimate: EstimateCard } => e.type === "estimate").map((e) => e.estimate);

describe("public estimates for each configuration", () => {
  it("shows a card per engine instead of asking which one first", async () => {
    let id = 0;
    const out = await runTool(engineCatalog(["1.8 L4", "2.4 L4"]), "get_estimate", { vehicle_key: encodeVehicleKey(vehicle()), service_id: 9, position: null }, () => `E-${++id}`, "zh-CN");
    expect(cards(out.events).map((c) => [c.vehicle, c.laborHours])).toEqual([
      ["2016 Honda CR-V EX 1.8 L4", 2.1],
      ["2016 Honda CR-V EX 2.4 L4", 3.2],
    ]);
    const content = JSON.parse(out.content);
    expect(content.depends_on).toBe("Engine");
    expect(content.variants).toHaveLength(2);
    // Customer prices only, no cost fields.
    expect(out.content).not.toMatch(/cost|dealer/i);
  });

  it("still asks when there are too many options to show", async () => {
    const out = await runTool(engineCatalog(["1.5 L4", "1.8 L4", "2.0 L4", "2.4 L4"]), "get_estimate", { vehicle_key: encodeVehicleKey(vehicle()), service_id: 9, position: null }, () => "E-1", "en");
    expect(cards(out.events)).toEqual([]);
    expect(JSON.parse(out.content).status).toBe("need_details");
  });

  it("tells the assistant how to present the per-configuration cards", () => {
    expect(SYSTEM_PROMPT).toMatch(/one card per/);
  });
});
