import { describe, expect, it } from "vitest";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { runTool } from "@/lib/repair-chat/tools";
import { runWorkbenchTool } from "@/lib/workbench/assistant";
import type { StaffQuote } from "@/lib/workbench/quote";
import { encodeVehicleKey, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";

const PADS = 1684;
const ROTORS = 1896;

let base = 810000;
const car = (): VehicleRef => ({ baseVehicleId: (base += 1), label: "2019 Mercedes-Benz GLC300", attributes: [] });

/** Front pads and front rotors with the given labor hours. */
function catalog(hours: Record<number, number>): CatalogApi {
  return {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string, data: unknown) {
      const d = data as { ACAPartTerminologyID?: number };
      const id = Number(d.ACAPartTerminologyID);
      if (path === "labor-ops-list") return { laborOperations: [{ applicationID: id, assetName: `a${id}`, position: { description: "Front", id: 22 }, positionID: 22 }] } as T;
      if (path === "labor-ops-details") {
        return { laborOperation: { estimateTimeHour: hours[id], laborCategoryName: id === PADS ? "Brake Pads R&R" : "Brake Rotor R&R", applications: [] } } as T;
      }
      throw new Error(path);
    },
  };
}

const together = (other: number) => ({ done_with_service_id: other, done_with_position: "Front" });

async function publicCard(api: CatalogApi, vehicle: VehicleRef, serviceId: number, other: number | null): Promise<EstimateCard> {
  const out = await runTool(api, "get_estimate", { vehicle_key: encodeVehicleKey(vehicle), service_id: serviceId, position: "Front", ...(other ? together(other) : { done_with_service_id: 0, done_with_position: "" }) }, () => "E-1", "zh-CN", null);
  const event = out.events.find((e) => e.type === "estimate") as { type: "estimate"; estimate: EstimateCard };
  return event.estimate;
}

describe("jobs done together (public assistant)", () => {
  it("charges the longer job in full and the shorter at half, whichever is quoted first", async () => {
    const api = catalog({ [PADS]: 0.9, [ROTORS]: 1.2 });
    const vehicle = car();
    const rotors = await publicCard(api, vehicle, ROTORS, PADS);
    const pads = await publicCard(api, vehicle, PADS, ROTORS);
    expect([rotors.laborHours, rotors.laborWalkIn]).toEqual([1.2, 144]);
    expect([pads.laborHours, pads.laborWalkIn]).toEqual([0.45, 54]);
    expect(pads.laborNote).toContain("labor charged at half (0.9 h → 0.45 h)");
    expect(rotors.laborNote).toContain("whose labor is charged at half");
  });

  it("breaks a tie the same way from both sides: 0.9 + 0.45", async () => {
    const api = catalog({ [PADS]: 0.9, [ROTORS]: 0.9 });
    const vehicle = car();
    const [pads, rotors] = [await publicCard(api, vehicle, PADS, ROTORS), await publicCard(api, vehicle, ROTORS, PADS)];
    expect(pads.laborHours + rotors.laborHours).toBe(1.35);
  });

  it("leaves a job alone when it isn't done with another", async () => {
    const card = await publicCard(catalog({ [PADS]: 0.9 }), car(), PADS, null);
    expect(card.laborHours).toBe(0.9);
  });
});

describe("jobs done together (workbench)", () => {
  it("shows the halved hours on the staff card too", async () => {
    const api = catalog({ [PADS]: 0.9, [ROTORS]: 1.2 });
    const out = await runWorkbenchTool(api, "get_estimate", { vehicle_key: encodeVehicleKey(car()), service_id: PADS, position: "Front", ...together(ROTORS) }, () => "W-1", null);
    const quote = (out.events[0] as { type: "quote"; quote: StaffQuote }).quote;
    expect(quote.labor).toMatchObject({ hours: 0.45, walkIn: 54 });
    expect(quote.notes.join(" ")).toContain("同时施工，工时按一半（原 0.9 h → 0.45 h）");
  });
});

describe("tool schemas", () => {
  // The Messages API refuses a request whose strict tools have more than 16 union-typed
  // (nullable / anyOf) parameters in total; one over the limit takes the whole chat down.
  function unions(schema: unknown): number {
    if (!schema || typeof schema !== "object") return 0;
    const s = schema as Record<string, unknown>;
    let n = Array.isArray(s.anyOf) || Array.isArray(s.type) ? 1 : 0;
    for (const v of Object.values(s)) {
      if (Array.isArray(v)) v.forEach((x) => (n += unions(x)));
      else if (v && typeof v === "object") n += unions(v);
    }
    return n;
  }
  const strictUnions = (tools: Array<{ strict?: boolean; input_schema: unknown }>) => tools.filter((t) => t.strict).reduce((sum, t) => sum + unions(t.input_schema), 0);

  it("stay under the API's limit of 16 union-typed parameters", async () => {
    const { TOOLS } = await import("@/lib/repair-chat/tools");
    const { WORKBENCH_TOOLS } = await import("@/lib/workbench/assistant");
    expect(strictUnions(TOOLS as never)).toBeLessThanOrEqual(16);
    expect(strictUnions(WORKBENCH_TOOLS as never)).toBeLessThanOrEqual(16);
  });
});
