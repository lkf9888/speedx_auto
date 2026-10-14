import { describe, expect, it } from "vitest";
import {
  decodeVehicleKey,
  encodeVehicleKey,
  identifyByVin,
  identifyByYearMakeModel,
  quoteService,
  refineVehicle,
  representativeOptions,
  sanitizePartQuotes,
  staffPartQuotes,
  scoreService,
  type CatalogApi,
  type VehicleRef,
} from "@/lib/worldpac/catalog";

const camry: VehicleRef = {
  baseVehicleId: 146565,
  label: "2019 Toyota Camry",
  attributes: [
    { name: "SubModel", id: 269, label: "LE" },
    { name: "EngineBase", id: 17637, label: "2.5 L4" },
  ],
};

function quote(overrides: Record<string, unknown>) {
  return {
    appID: "1",
    partDescription: "Brake Pad Set, Ceramic",
    seriesDescription: "PRO-ACT",
    listPrice: 159.05,
    unitPrice: 78.86,
    jobberPrice: 101.11,
    wholesalePrice: 77.77,
    dcDirectUnitPrice: 76.49,
    corePrice: 12.34,
    availability: "Tuesday-local",
    qtyAvailable: 5,
    position: { description: "Front", id: 22 },
    ...overrides,
  };
}

/** Records calls and answers from a path → handler table. */
function fakeApi(routes: Record<string, (data: unknown) => unknown>) {
  const calls: Array<{ path: string; data: unknown }> = [];
  const api: CatalogApi = {
    async get<T>(path: string) {
      calls.push({ path, data: null });
      const key = Object.keys(routes).find((k) => path.startsWith(k));
      if (!key) throw new Error(`unexpected GET ${path}`);
      return routes[key](null) as T;
    },
    async post<T>(path: string, data: unknown) {
      calls.push({ path, data });
      const handler = routes[path];
      if (!handler) throw new Error(`unexpected POST ${path}`);
      return handler(data) as T;
    },
  };
  return { api, calls };
}

describe("sanitizePartQuotes", () => {
  it("keeps the list price and drops every account price", () => {
    const options = sanitizePartQuotes(
      {
        applications: [{ appID: "1", qtyPerCar: 1, applicationNote: "w/ Electronic Parking Brake" }],
        quotes: [{ productQuotes: [quote({})] }],
      },
      22,
    );
    expect(options).toEqual([
      {
        description: "Brake Pad Set, Ceramic",
        series: "PRO-ACT",
        listPrice: 159.05,
        quantity: 1,
        inStockLocally: true,
        note: "w/ Electronic Parking Brake",
      },
    ]);
    const serialized = JSON.stringify(options);
    for (const leaked of ["78.86", "101.11", "77.77", "76.49", "12.34", "unitPrice", "jobber", "wholesale"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("filters to the labor position, reads quantity per car, and skips unpriced parts", () => {
    const options = sanitizePartQuotes(
      {
        applications: [{ appID: "2", qtyPerCar: 2 }],
        quotes: [
          {
            productQuotes: [
              quote({ appID: "2", partDescription: "Rotor", listPrice: 90, position: { description: "Front", id: 22 } }),
              quote({ appID: "3", partDescription: "Rear pad", listPrice: 80, position: { description: "Rear", id: 30 } }),
              quote({ appID: "4", partDescription: "No price", listPrice: 0 }),
            ],
          },
        ],
      },
      22,
    );
    expect(options.map((o) => [o.description, o.quantity])).toEqual([["Rotor", 2]]);
  });
});

describe("representativeOptions", () => {
  it("returns the cheapest, a middle, and the most expensive option", () => {
    const make = (price: number) => ({
      description: `p${price}`,
      series: "",
      listPrice: price,
      quantity: 1,
      inStockLocally: true,
      note: "",
    });
    const picked = representativeOptions([make(150), make(100), make(120), make(200), make(130)]);
    expect(picked.map((p) => p.listPrice)).toEqual([100, 130, 200]);
  });
});

describe("vehicle keys", () => {
  it("round-trips a vehicle", () => {
    expect(decodeVehicleKey(encodeVehicleKey(camry))).toEqual(camry);
  });

  it("rejects tampered or malformed keys", () => {
    const tampered = Buffer.from(
      JSON.stringify({ b: 1, l: "x", a: [["Sub Model; drop", 1, "LE"]] }),
    ).toString("base64url");
    expect(decodeVehicleKey(tampered)).toBeNull();
    expect(decodeVehicleKey("not-a-key")).toBeNull();
    expect(decodeVehicleKey(Buffer.from(JSON.stringify({ b: -5, l: "x", a: [] })).toString("base64url"))).toBeNull();
  });
});

describe("scoreService", () => {
  it("ranks the matching labor operation first", () => {
    const names = ["Brake Line R&R", "Brake Pads R&R", "Disc Brake Caliper R&R"];
    const best = names.sort((a, b) => scoreService("front brake pads", b) - scoreService("front brake pads", a))[0];
    expect(best).toBe("Brake Pads R&R");
    expect(scoreService("rotors", "Brake Rotor R&R")).toBeGreaterThan(0);
  });
});

describe("vehicle lookup", () => {
  it("asks only about attributes with several enabled options", async () => {
    const { api } = fakeApi({
      "vehicle/refine": () => ({
        recommendedVehAttrs: [
          {
            attrName: "SubModel",
            attrDesc: "Sub Model",
            vehAttrs: [
              { isEnabled: true, value: { key: 191, value: "EX" } },
              { isEnabled: true, value: { key: 113, value: "LX" } },
              { isEnabled: false, value: { key: 802, value: "Type R" } },
            ],
          },
          { attrName: "EngineBase", attrDesc: "Engine", vehAttrs: [{ isEnabled: true, value: { key: 17502, value: "2.0 L4" } }] },
          { attrName: "Valves", attrDesc: "Valves", vehAttrs: [{ isEnabled: true, value: { key: 1, value: "16" } }, { isEnabled: true, value: { key: 2, value: "24" } }] },
        ],
      }),
    });
    const result = await refineVehicle(api, { baseVehicleId: 141228, label: "2017 Honda Civic", attributes: [] });
    expect(result.status).toBe("needs_details");
    if (result.status !== "needs_details") return;
    expect(result.questions).toEqual([{ attribute: "SubModel", label: "Sub Model", options: ["EX", "LX"] }]);
    expect(result.vehicle.attributes).toEqual([{ name: "EngineBase", id: 17502, label: "2.0 L4" }]);
  });

  it("resolves make aliases and exact model names", async () => {
    const { api } = fakeApi({
      "vehicle/makesbyyear": () => ({ makes: [{ makeID: 47, makeDesc: "Chevrolet" }] }),
      "vehicle/modelsbyyearmake": () => ({
        models: [
          { baseVehicleID: "1", modelDesc: "Malibu", makeDesc: "Chevrolet", yearID: 2016 },
          { baseVehicleID: "2", modelDesc: "Malibu Limited", makeDesc: "Chevrolet", yearID: 2016 },
        ],
      }),
      "vehicle/refine": () => ({ recommendedVehAttrs: [] }),
    });
    const result = await identifyByYearMakeModel(api, 2016, "chevy", "malibu");
    expect(result).toEqual({
      status: "ok",
      vehicle: { baseVehicleId: 1, label: "2016 Chevrolet Malibu", attributes: [] },
    });
  });
});

describe("quoteService", () => {
  const routes = {
    "labor-ops-list": () => ({
      laborOperations: [
        { applicationID: 10, assetName: "550032-1", position: { description: "Front", id: 22 }, positionID: 22 },
        { applicationID: 11, assetName: "550032-2", position: { description: "Rear", id: 30 }, positionID: 30 },
      ],
      vehAttrOptions: [],
    }),
    "labor-ops-details": () => ({
      laborOperation: {
        estimateTimeHour: 1.1,
        laborCategoryName: "Brake Pads R&R",
        applicationNote: "Does not include: Brake Hydraulic System Bleed.",
        applications: [
          { categoryCode: "N1069", categoryName: "Anti Rattle Spring / Clip" },
          { categoryCode: "N1010", categoryName: "Brake Pad Set" },
        ],
      },
    }),
    pna360_cat: () => ({
      applications: [],
      quotes: [{ productQuotes: [quote({}), quote({ listPrice: 185.84 }), quote({ listPrice: 99, position: { description: "Rear", id: 30 } })] }],
    }),
  };

  it("asks for a position when the service has several", async () => {
    const { api } = fakeApi(routes);
    const result = await quoteService(api, { ...camry, baseVehicleId: 900001 }, 800550032, null);
    expect(result).toEqual({ status: "need_position", positions: ["Front", "Rear"] });
  });

  it("prices the primary part for the chosen position", async () => {
    const { api, calls } = fakeApi(routes);
    const result = await quoteService(api, { ...camry, baseVehicleId: 900002 }, 800550032, "front");
    expect(result).toMatchObject({
      status: "ok",
      serviceName: "Brake Pads R&R",
      position: "Front",
      laborHours: 1.1,
      primaryPartName: "Brake Pad Set",
      otherPartNames: ["Anti Rattle Spring / Clip"],
    });
    if (result.status !== "ok") return;
    expect(result.partOptions.map((p) => p.listPrice)).toEqual([159.05, 185.84]);
    const pnaCall = calls.find((c) => c.path === "pna360_cat")!.data as { partTypes: Array<{ categoryCode: string }> };
    expect(pnaCall.partTypes[0].categoryCode).toBe("N1010");
    expect(calls.some((c) => c.path.startsWith("vehicle/history"))).toBe(false);
  });
});

describe("eval round 2 fixes", () => {
  const option = (description: string, listPrice: number) => ({
    description,
    series: "",
    listPrice,
    quantity: 1,
    inStockLocally: true,
    note: "",
  });

  it("drops bulk packaging and price outliers", async () => {
    const { filterRealisticOptions } = await import("@/lib/worldpac/catalog");
    const kept = filterRealisticOptions([
      option("CVT Fluid, ECO CVT - 1QT", 34.78),
      option("A/T Fluid - Drum, ECO CVT 55G", 2500),
      option("Brake Pad Set, Ceramic", 109.95),
      option("Brake Pad Set, OE", 132.5),
      option("Brake Pad Set, Premium", 159.05),
      option("Mislisted kit", 1999),
    ]);
    expect(kept.map((o) => o.listPrice)).toEqual([34.78, 109.95, 132.5, 159.05]);
  });

  it("prices fluid services as labor only, with a note", async () => {
    const { api } = fakeApi({
      "labor-ops-list": () => ({ laborOperations: [{ applicationID: 1, assetName: "a", positionID: -1 }] }),
      "labor-ops-details": () => ({
        laborOperation: {
          estimateTimeHour: 0.5,
          laborCategoryName: "Trans Fluid Drain & Refill",
          applications: [{ categoryCode: "N9", categoryName: "Auto Trans Fluid" }],
        },
      }),
    });
    const quote = await quoteService(api, { ...camry, baseVehicleId: 900003 }, 1, null);
    expect(quote).toMatchObject({ status: "ok", partOptions: [], primaryPartName: "Auto Trans Fluid" });
    if (quote.status === "ok") expect(quote.partsNote).toContain("billed by the amount used");
  });

  it("labels a VIN lookup with year, make and model", async () => {
    const { identifyByVin } = await import("@/lib/worldpac/catalog");
    const { api } = fakeApi({
      "vehicle/searchMultiVehicle": () => ({
        vehicles: [
          {
            baseVehicleID: 5986,
            vehicleAttributes: [
              { name: { key: "Year" }, value: { key: 2003, value: "2003" } },
              { name: { key: "Make" }, value: { key: 59, value: "Honda" } },
              { name: { key: "Model" }, value: { key: 751, value: "Accord" } },
              { name: { key: "SubModel" }, value: { key: 191, value: "EX" } },
            ],
          },
        ],
      }),
      "vehicle/refine": () => ({ recommendedVehAttrs: [] }),
    });
    const result = await identifyByVin(api, "1HGCM82633A004352");
    expect(result.status === "ok" && result.vehicle.label).toBe("2003 Honda Accord");
  });
});

describe("missing part prices", () => {
  it("asks for the trim instead of returning a labor-only card when parts depend on it", async () => {
    const { api } = fakeApi({
      "labor-ops-list": () => ({ laborOperations: [{ applicationID: 1, assetName: "a", positionID: 22, position: { description: "Front", id: 22 } }] }),
      "labor-ops-details": () => ({
        laborOperation: {
          estimateTimeHour: 0.9,
          laborCategoryName: "Brake Pads R&R",
          applications: [{ categoryCode: "N1010", categoryName: "Brake Pad Set" }],
        },
      }),
      pna360_cat: () => ({ quotes: [] }),
      "vehicle/refine": () => ({
        recommendedVehAttrs: [
          { attrName: "SubModel", attrDesc: "Sub Model", vehAttrs: [
            { isEnabled: true, value: { key: 1, value: "LX" } },
            { isEnabled: true, value: { key: 2, value: "EX" } },
          ] },
        ],
      }),
    });
    const quote = await quoteService(api, { baseVehicleId: 900004, label: "2018 Honda Civic", attributes: [] }, 800550032, null);
    expect(quote).toEqual({
      status: "need_details",
      questions: [{ attribute: "SubModel", label: "Sub Model", options: ["LX", "EX"] }],
    });
  });
});

describe("Canadian model names", () => {
  // speedDIAL decodes a Canadian RVR, but its labor guide files the car as the US Outlander Sport.
  // Each test uses its own RVR id: speedDIAL answers are cached per vehicle.
  const routes = (rvrHasServices: boolean, rvr = 100) => ({
    "vehicle/searchMultiVehicle": () => ({
      vehicles: [
        {
          baseVehicleID: rvr,
          vehicleAttributes: [
            { name: { key: "Year" }, value: { key: 2019, value: "2019" } },
            { name: { key: "Make" }, value: { key: 1, value: "Mitsubishi" } },
            { name: { key: "Model" }, value: { key: 2, value: "RVR" } },
            { name: { key: "EngineBase" }, value: { key: 777, value: "2.0 L4" } },
          ],
        },
      ],
    }),
    "vehicle/makesbyyear": () => ({ makes: [{ makeID: 31, makeDesc: "Mitsubishi" }] }),
    "vehicle/modelsbyyearmake": () => ({
      models: [
        { baseVehicleID: "200", modelDesc: "Outlander Sport", makeDesc: "Mitsubishi", yearID: 2019 },
        { baseVehicleID: "201", modelDesc: "Outlander", makeDesc: "Mitsubishi", yearID: 2019 },
      ],
    }),
    "vehicle/refine": (data: unknown) => {
      const base = (data as { baseVehicleID: string }).baseVehicleID;
      return {
        recommendedVehAttrs: [
          { attrName: "EngineBase", attrDesc: "Engine", vehAttrs: [{ isEnabled: true, value: { key: base === "200" ? 888 : 777, value: "2.0 L4" } }, { isEnabled: true, value: { key: 999, value: "2.4 L4" } }] },
        ],
      };
    },
    "category/details": (data: unknown) => {
      const d = data as { baseVehicleID: string; categoryCode: string };
      if (d.baseVehicleID === String(rvr) && !rvrHasServices) return {};
      if (!d.categoryCode) return { replacementParts: [{ code: "BR", description: "Brakes" }] };
      return { laborOperations: [{ acaPartTerminologyID: 1684, description: "Brake Pads R&R" }] };
    },
  });

  it("quotes an RVR as its US twin, keeping the engine and the name the customer knows", async () => {
    const { api } = fakeApi(routes(false));
    const result = await identifyByVin(api, "JA4AJ3AU2KU000000");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.vehicle).toEqual({ baseVehicleId: 200, label: "2019 Mitsubishi RVR", attributes: [{ name: "EngineBase", id: 888, label: "2.0 L4" }] });
  });

  it("keeps the RVR when speedDIAL has labor data for it", async () => {
    const { api } = fakeApi(routes(true, 101));
    const result = await identifyByVin(api, "JA4AJ3AU2KU000001");
    expect(result.status === "ok" && result.vehicle.baseVehicleId).toBe(101);
  });
});

describe("deep-test fixes", () => {
  it("lists a part once even when speedDIAL quotes it from several warehouses", () => {
    const response = {
      applications: [],
      quotes: [
        {
          productQuotes: [
            quote({ manufacturerPart: "ACT2076", availability: "multipleDays", qtyAvailable: 0, unitPrice: 75 }),
            quote({ manufacturerPart: "ACT2076", availability: "today-local", qtyAvailable: 4, unitPrice: 78.86 }),
            quote({ manufacturerPart: "AD2076", listPrice: 185.84, seriesDescription: "Ultra-Premium" }),
            quote({ manufacturerPart: "AD2076", listPrice: 185.84, seriesDescription: "Ultra-Premium" }),
          ],
        },
      ],
    };
    const staff = staffPartQuotes(response, 22);
    expect(staff.map((o) => o.partNumber)).toEqual(["ACT2076", "AD2076"]);
    // The copy in local stock wins over a cheaper one days away.
    expect(staff[0]).toMatchObject({ inStockLocally: true, prices: expect.objectContaining({ unitPrice: 78.86 }) });
    expect(sanitizePartQuotes(response, 22)).toHaveLength(2);
  });

  it("prices a service whose operations name no position instead of asking for one", async () => {
    const { api } = fakeApi({
      "labor-ops-list": () => ({
        laborOperations: [
          { applicationID: 1, assetName: "t-1", position: { description: "" }, positionID: -1 },
          { applicationID: 2, assetName: "t-2", position: { description: "" }, positionID: -1 },
        ],
        vehAttrOptions: [],
      }),
      "labor-ops-details": () => ({
        laborOperation: { estimateTimeHour: 0.9, laborCategoryName: "Engine Coolant Thermostat R&R", applications: [] },
      }),
    });
    const result = await quoteService(api, { ...camry, baseVehicleId: 900099 }, 5555, null);
    expect(result).toMatchObject({ status: "ok", serviceName: "Engine Coolant Thermostat R&R", laborHours: 0.9 });
  });
});
