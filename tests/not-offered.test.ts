import { describe, expect, it } from "vitest";
import { NOT_OFFERED, runTool } from "@/lib/repair-chat/tools";
import { SYSTEM_PROMPT } from "@/lib/repair-chat/prompt";
import { WORKBENCH_PROMPT } from "@/lib/workbench/assistant";
import { encodeVehicleKey, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-12: the shop doesn't do wheel alignments or exhaust and muffler repair
// (added to transmissions and auto glass).

describe("work the shop doesn't do", () => {
  it.each(["Wheel Alignment", "Front End Alignment", "Muffler R&R", "Resonator R&R", "Catalytic Converter R&R", "Exhaust Pipe R&R", "Exhaust System Inspection", "Tail Pipe R&R", "muffler is loud", "exhaust leak"])("covers %s", (name) => {
    expect(NOT_OFFERED.test(name)).toBe(true);
  });

  it.each(["Exhaust Manifold Gasket R&R", "Exhaust Gas Recirculation Valve R&R", "Oxygen Sensor R&R", "Trans Fluid Drain & Refill", "Brake Pads R&R", "Tie Rod End R&R", "Headlamp Alignment", "Air Intake Resonator R&R"])("still quotes %s", (name) => {
    expect(NOT_OFFERED.test(name)).toBe(false);
  });

  it("is in both prompts", () => {
    expect(SYSTEM_PROMPT).toMatch(/does not do wheel alignments, and does not repair exhaust systems or mufflers/);
    expect(SYSTEM_PROMPT).toMatch(/pulls to one side/);
    expect(WORKBENCH_PROMPT).toMatch(/wheel alignments, or repair exhaust systems and mufflers/);
  });
});

let nextBase = 730000;
const car = (): VehicleRef => ({ baseVehicleId: (nextBase += 1), label: "2018 Honda Civic", attributes: [] });

/** A catalog whose Exhaust and Steering systems list jobs the shop doesn't do next to ones it does. */
function catalog(): CatalogApi {
  return {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string, data: unknown) {
      const d = data as Record<string, unknown>;
      if (path === "category/details") {
        if (!d.categoryCode) return { replacementParts: [{ code: "X", description: "Exhaust" }, { code: "S", description: "Steering" }] } as T;
        if (d.categoryCode === "X") {
          return { laborOperations: [{ acaPartTerminologyID: 1, description: "Muffler R&R" }, { acaPartTerminologyID: 2, description: "Exhaust Manifold Gasket R&R" }] } as T;
        }
        if (d.categoryCode === "S") {
          return { laborOperations: [{ acaPartTerminologyID: 3, description: "Wheel Alignment" }, { acaPartTerminologyID: 4, description: "Tie Rod End R&R" }] } as T;
        }
        return {} as T;
      }
      throw new Error(`unexpected ${path}`);
    },
  };
}

describe("the public assistant's tools", () => {
  it("don't list or quote those jobs", async () => {
    const api = catalog();
    const vehicle = car();
    const key = encodeVehicleKey(vehicle);
    const search = JSON.parse((await runTool(api, "find_services", { vehicle_key: key, query: "exhaust manifold gasket" }, () => "E-1")).content);
    expect(search.services.map((s: { name: string }) => s.name)).toEqual(["Exhaust Manifold Gasket R&R"]);
    const steering = JSON.parse((await runTool(api, "find_services", { vehicle_key: key, query: "steering tie rod" }, () => "E-1")).content);
    expect(steering.services.map((s: { name: string }) => s.name)).not.toContain("Wheel Alignment");

    const asked = JSON.parse((await runTool(api, "find_services", { vehicle_key: key, query: "wheel alignment" }, () => "E-1")).content);
    expect(asked).toMatchObject({ services: [], status: "not_offered" });

    const quoted = await runTool(api, "get_estimate", { vehicle_key: key, service_id: 1, position: null }, () => "E-1");
    expect(JSON.parse(quoted.content).status).toBe("not_offered");
    expect(quoted.events).toEqual([]);
  });
});
