import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gov/vpic", async (original) => ({
  ...(await original<typeof import("@/lib/gov/vpic")>()),
  decodeVin: vi.fn(async () => ({
    vin: "2T1BURHE0JC034187",
    year: 2018,
    make: "Toyota",
    model: "Corolla",
    trim: "LE",
    series: "",
    engine: "1.8 L, 4 cylinders",
    engineCode: "2ZR-FE",
    displacementL: 1.8,
    cylinders: 4,
    turbo: false,
    drive: "2WD",
    transmission: "CVT",
    fuel: "Gasoline",
    electrification: "",
    body: "Sedan",
    builtIn: "CANADA",
    warning: "",
  })),
}));
vi.mock("@/lib/gov/recalls", () => ({
  findRecalls: vi.fn(async (year: number, make: string, model: string) => {
    if (model === "Down") throw new Error("unreachable");
    if (model === "Clean") return { source: null, models: [], total: 0, recalls: [] };
    return { source: "Transport Canada", models: ["COROLLA"], total: 1, recalls: [{ source: "Transport Canada", number: "2020013", date: "2020-01-17", system: "Fuel System", issue: "Fuel pump may fail.", risk: "Stall.", remedy: "Replace pump." }] };
  }),
}));

const { runTool, TOOLS } = await import("@/lib/repair-chat/tools");
const { SYSTEM_PROMPT } = await import("@/lib/repair-chat/prompt");
const { WORKBENCH_TOOLS } = await import("@/lib/workbench/assistant");
import type { CatalogApi } from "@/lib/worldpac/catalog";

/** A catalog that doesn't know the VIN but knows the car by year, make and model. */
function catalog(): CatalogApi & { gets: string[] } {
  const gets: string[] = [];
  return {
    gets,
    async get<T>(path: string) {
      gets.push(path);
      if (path.startsWith("vehicle/searchMultiVehicle")) return { vehicles: [] } as T;
      if (path.startsWith("vehicle/makesbyyear")) return { makes: [{ makeID: 1, makeDesc: "Toyota" }] } as T;
      if (path.startsWith("vehicle/modelsbyyearmake")) return { models: [{ baseVehicleID: 77, modelDesc: "Corolla", makeDesc: "Toyota", yearID: 2018 }] } as T;
      return {} as T;
    },
    async post<T>(path: string) {
      if (path === "vehicle/refine") return { baseVehicleID: 77, recommendedVehAttrs: [] } as T;
      return {} as T;
    },
  } as CatalogApi & { gets: string[] };
}

describe("VIN specs in identify_vehicle", () => {
  it("adds what the VIN says and finds the car by year/make/model when the catalog doesn't know the VIN", async () => {
    const api = catalog();
    const out = await runTool(api, "identify_vehicle", { vin: "2T1BURHE0JC034187", year: null, make: null, model: null }, () => "E-1");
    const payload = JSON.parse(out.content);
    expect(payload.vin_specs).toMatchObject({ year_make_model: "2018 Toyota Corolla", engine: "1.8 L, 4 cylinders, engine code 2ZR-FE", drive: "2WD" });
    expect(payload.vin_note).toMatch(/set_vehicle_details/);
    expect(api.gets.some((p) => p.startsWith("vehicle/searchMultiVehicle"))).toBe(true);
    expect(api.gets.some((p) => p.startsWith("vehicle/modelsbyyearmake?year=2018"))).toBe(true);
    expect(payload.vehicle).toMatch(/2018 Toyota Corolla/);
  });
});

describe("check_recalls", () => {
  const ask = (model: string) => runTool({} as CatalogApi, "check_recalls", { year: 2018, make: "Toyota", model }, () => "E-1");

  it("lists recalls with the rules for mentioning them", async () => {
    const payload = JSON.parse((await ask("Corolla")).content);
    expect(payload).toMatchObject({ status: "ok", source: "Transport Canada", total: 1 });
    expect(payload.recalls[0]).toEqual({ number: "2020013", date: "2020-01-17", system: "Fuel System", issue: "Fuel pump may fail.", risk: "Stall.", remedy: "Replace pump." });
    expect(payload.note).toMatch(/free at the brand's dealer/);
    expect(payload.note).toMatch(/Never say the car is definitely affected/);
  });

  it("says when there are none, and when the database can't be reached", async () => {
    expect(JSON.parse((await ask("Clean")).content).status).toBe("none_found");
    expect(JSON.parse((await ask("Down")).content).status).toBe("unavailable");
    expect((await runTool({} as CatalogApi, "check_recalls", { year: 0, make: "", model: "" }, () => "E-1")).isError).toBe(true);
  });

  it("is offered to both assistants, and the public prompt says when to use it", () => {
    expect(TOOLS.some((t) => t.name === "check_recalls")).toBe(true);
    expect(WORKBENCH_TOOLS.some((t) => t.name === "check_recalls")).toBe(true);
    expect(SYSTEM_PROMPT).toMatch(/call check_recalls once/);
    expect(SYSTEM_PROMPT).toMatch(/vin_specs/);
  });
});
