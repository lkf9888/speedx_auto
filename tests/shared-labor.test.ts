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

const together = (other: number) => ({ service_id: other, position: "Front" });

async function publicCard(api: CatalogApi, vehicle: VehicleRef, serviceId: number, other: number | null): Promise<EstimateCard> {
  const out = await runTool(api, "get_estimate", { vehicle_key: encodeVehicleKey(vehicle), service_id: serviceId, position: "Front", done_with: other ? together(other) : null }, () => "E-1", "zh-CN", null);
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
    const out = await runWorkbenchTool(api, "get_estimate", { vehicle_key: encodeVehicleKey(car()), service_id: PADS, position: "Front", done_with: together(ROTORS) }, () => "W-1", null);
    const quote = (out.events[0] as { type: "quote"; quote: StaffQuote }).quote;
    expect(quote.labor).toMatchObject({ hours: 0.45, walkIn: 54 });
    expect(quote.notes.join(" ")).toContain("同时施工，工时按一半（原 0.9 h → 0.45 h）");
  });
});
