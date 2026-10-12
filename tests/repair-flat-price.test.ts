import { describe, expect, it } from "vitest";
import {
  cylinderCount,
  likelyRefrigerants,
  quoteFlatService,
  vehicleFacts,
  type FlatRequest,
} from "@/lib/repair-chat/flat-price";
import { buildEstimate, summarizeEstimateForModel } from "@/lib/repair-chat/pricing";
import { matchScript } from "@/lib/repair-chat/script";
import { runTool, type ChatEvent } from "@/lib/repair-chat/tools";
import { encodeVehicleKey, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";

const vehicle = (label: string, engine?: string, extra: VehicleRef["attributes"] = []): VehicleRef => ({
  baseVehicleId: 1,
  label,
  attributes: [...(engine ? [{ name: "EngineBase", id: 9, label: engine }] : []), ...extra],
});

const ask = (overrides: Partial<FlatRequest> = {}): FlatRequest => ({
  service: "oil_change",
  size: "car",
  fuel: "gasoline",
  oilGrade: null,
  tireType: null,
  tireCount: null,
  refrigerant: null,
  premiumClaimed: false,
  ...overrides,
});

const prices = (quote: ReturnType<typeof quoteFlatService>) =>
  quote.status === "ok" ? quote.options.map((o) => o.unitPrice * o.quantity) : quote.status;

describe("vehicle facts", () => {
  it("reads the cylinder count from the engine label", () => {
    expect(cylinderCount("2.5 L4")).toBe(4);
    expect(cylinderCount("5.0 V8")).toBe(8);
    expect(cylinderCount("6.0L W12 GAS")).toBe(12);
    expect(cylinderCount("2.0 H4")).toBe(4);
    expect(cylinderCount("ELECTRIC")).toBeNull();
  });

  it("recognizes European, diesel, electric and premium vehicles", () => {
    expect(vehicleFacts(vehicle("2018 Volkswagen Golf", "2.0 L4", [{ name: "SubModel", id: 1, label: "TDI" }]))).toMatchObject({
      european: true,
      diesel: true,
    });
    expect(vehicleFacts(vehicle("2016 BMW X5", "3.0 L6", [{ name: "SubModel", id: 1, label: "xDrive35d" }])).diesel).toBe(true);
    expect(vehicleFacts(vehicle("2019 Mercedes-Benz C300", "2.0 L4")).european).toBe(true);
    expect(vehicleFacts(vehicle("2021 Tesla Model 3")).electric).toBe(true);
    expect(vehicleFacts(vehicle("2021 Tesla Model X")).premium).toBe(true);
    expect(vehicleFacts(vehicle("2020 Porsche 911", "3.0 H6")).premium).toBe(true);
    expect(vehicleFacts(vehicle("2020 Porsche Macan", "2.0 L4")).premium).toBe(false);
    expect(vehicleFacts(vehicle("2022 Land Rover Range Rover", "3.0 L6")).premium).toBe(true);
    expect(vehicleFacts(vehicle("2022 Land Rover Range Rover Sport", "3.0 L6")).premium).toBe(false);
    expect(vehicleFacts(vehicle("2019 Toyota Camry", "2.5 L4"))).toMatchObject({
      year: 2019,
      european: false,
      diesel: false,
      premium: false,
      cylinders: 4,
    });
  });
});

describe("flat prices", () => {
  const camry = vehicleFacts(vehicle("2019 Toyota Camry", "2.5 L4"));

  it("prices oil changes by size and grade", () => {
    expect(prices(quoteFlatService(camry, ask()))).toEqual([95, 120]);
    expect(prices(quoteFlatService(camry, ask({ size: "small_suv", oilGrade: "premium" })))).toEqual([120]);
    const tacoma = vehicleFacts(vehicle("2020 Toyota Tacoma", "3.5 V6"));
    expect(prices(quoteFlatService(tacoma, ask({ size: "large_suv_or_pickup" })))).toEqual([150, 180]);
  });

  it("uses OEM oil prices for diesels and European vehicles", () => {
    const golf = vehicleFacts(vehicle("2015 Volkswagen Golf", "2.0 L4", [{ name: "SubModel", id: 1, label: "TDI" }]));
    expect(prices(quoteFlatService(golf, ask()))).toEqual([280]);
    const ram = vehicleFacts(vehicle("2020 Ram 1500", "3.0 V6"));
    expect(prices(quoteFlatService(ram, ask({ size: "large_suv_or_pickup", fuel: "diesel" })))).toEqual([320]);
    const c300 = vehicleFacts(vehicle("2019 Mercedes-Benz C300", "2.0 L4"));
    expect(prices(quoteFlatService(c300, ask({ oilGrade: "standard" })))).toEqual([220]);
  });

  it("sends 8+ cylinder and premium vehicles to the team for a quote", () => {
    const f150 = vehicleFacts(vehicle("2020 Ford F-150", "5.0 V8"));
    expect(quoteFlatService(f150, ask({ size: "large_suv_or_pickup" }))).toMatchObject({
      status: "team_quote",
      reason: "eight_cylinders",
    });
    expect(quoteFlatService(f150, ask({ service: "tire_change" })).status).toBe("team_quote");
    expect(quoteFlatService(camry, ask({ premiumClaimed: true }))).toMatchObject({ status: "team_quote", reason: "premium" });
    const panamera = vehicleFacts(vehicle("2019 Porsche Panamera", "2.9 V6"));
    expect(quoteFlatService(panamera, ask()).status).toBe("team_quote");
  });

  it("has no oil change for electric vehicles", () => {
    const model3 = vehicleFacts(vehicle("2021 Tesla Model 3"));
    expect(quoteFlatService(model3, ask()).status).toBe("not_applicable");
    expect(prices(quoteFlatService(model3, ask({ service: "tire_change", tireType: "up_to_18" })))).toEqual([100]);
  });

  it("prices tire changes per tire, four by default", () => {
    expect(prices(quoteFlatService(camry, ask({ service: "tire_change" })))).toEqual([100, 120, 140, 180]);
    expect(prices(quoteFlatService(camry, ask({ service: "tire_change", tireType: "run_flat", tireCount: 2 })))).toEqual([70]);
  });

  it("prices A/C recharge by refrigerant, guessing it from the year", () => {
    expect(likelyRefrigerants(2010)).toEqual(["r134a"]);
    expect(likelyRefrigerants(2023)).toEqual(["r1234yf"]);
    expect(likelyRefrigerants(2017)).toEqual(["r134a", "r1234yf"]);
    expect(prices(quoteFlatService(camry, ask({ service: "ac_recharge" })))).toEqual([150, 230]);
    expect(prices(quoteFlatService(camry, ask({ service: "ac_recharge", refrigerant: "r1234yf" })))).toEqual([230]);
  });
});

describe("estimate summary for the model", () => {
  it("spells out each option's total with labor so the model never adds", () => {
    const card = buildEstimate(
      "2019 Toyota Camry LE",
      {
        status: "ok",
        serviceName: "Brake Pads R&R",
        position: "Front",
        laborHours: 1.1,
        laborNote: "",
        primaryPartName: "Brake Pad Set",
        partOptions: [
          { description: "Pads A", series: "", listPrice: 159.05, quantity: 1, inStockLocally: true, note: "" },
          { description: "Pads B", series: "", listPrice: 185.84, quantity: 1, inStockLocally: true, note: "" },
        ],
        otherPartNames: [],
        partsNote: "",
      },
      "E-1",
    );
    const summary = summarizeEstimateForModel(card);
    expect(summary).toContain("Pads A $159.05 → total $291.05");
    expect(summary).toContain("Pads B $185.84 → total $317.84");
    expect(summary).not.toMatch(/referral|105\.6|264\.65/i);
  });
});

describe("script clean-up", () => {
  it("converts the reply to the customer's script", () => {
    expect(matchScript("前刹车片这个价格大约 $291。", "Traditional Chinese")).toBe("前剎車片這個價格大約 $291。");
    expect(matchScript("前煞車片這個價格大約 $291。", "Simplified Chinese")).toBe("前煞车片这个价格大约 $291。");
    expect(matchScript("Front pads are $291.", "Traditional Chinese")).toBe("Front pads are $291.");
    expect(matchScript("混用的回覆", "English")).toBe("混用的回覆");
  });
});

// ------------------------------------------------------------------ tools

function catalogWithEngines(engines: string[]): CatalogApi {
  return {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string) {
      if (path === "vehicle/refine") {
        return {
          recommendedVehAttrs: [
            {
              attrName: "EngineBase",
              attrDesc: "Engine",
              vehAttrs: engines.map((value, key) => ({ isEnabled: true, value: { key: key + 1, value } })),
            },
          ],
        } as T;
      }
      if (path === "labor-ops-list") return { laborOperations: [] } as T;
      if (path === "category/details") return { replacementParts: [] } as T;
      throw new Error(`unexpected ${path}`);
    },
  };
}

const flatInput = (key: string, overrides: Record<string, unknown> = {}) => ({
  vehicle_key: key,
  service: "oil_change",
  vehicle_size: "large_suv_or_pickup",
  fuel: "gasoline",
  oil_grade: null,
  tire_type: null,
  tire_count: null,
  refrigerant: null,
  new_price_over_120k: false,
  ...overrides,
});

const estimates = (events: ChatEvent[]) =>
  events.flatMap((e) => (e.type === "estimate" ? [e.estimate] : []));

describe("get_flat_price tool", () => {
  const f150 = encodeVehicleKey({ baseVehicleId: 5, label: "2020 Ford F-150", attributes: [] });

  it("asks for the engine when some versions have 8 cylinders", async () => {
    const out = await runTool(catalogWithEngines(["3.5 V6", "5.0 V8"]), "get_flat_price", flatInput(f150), () => "E-1", "zh-CN");
    expect(JSON.parse(out.content)).toMatchObject({ status: "need_details", questions: [{ attribute: "EngineBase" }] });
    expect(out.events).toEqual([]);
  });

  it("shows a flat-price card in the page language", async () => {
    const v6 = encodeVehicleKey({
      baseVehicleId: 5,
      label: "2020 Ford F-150",
      attributes: [{ name: "EngineBase", id: 1, label: "3.5 V6" }],
    });
    const out = await runTool(catalogWithEngines([]), "get_flat_price", flatInput(v6), () => "E-2", "zh-CN");
    const [card] = estimates(out.events);
    expect(card).toMatchObject({ kind: "flat", service: "换机油", position: "大型 SUV / 皮卡", totalLow: 150, totalHigh: 180 });
    expect(card.partOptions.map((p) => p.description)).toEqual(["普通机油 0W-20", "高级机油 0W-30"]);
    expect(JSON.parse(out.content).summary).toContain("$150–$180");
  });

  it("shows a team-quote card with no price for a V8", async () => {
    const v8 = encodeVehicleKey({
      baseVehicleId: 5,
      label: "2020 Ford F-150",
      attributes: [{ name: "EngineBase", id: 2, label: "5.0 V8" }],
    });
    const out = await runTool(catalogWithEngines([]), "get_flat_price", flatInput(v8), () => "E-3", "en");
    const [card] = estimates(out.events);
    expect(card).toMatchObject({ kind: "team_quote", service: "Oil change", totalLow: 0, totalHigh: 0 });
    expect(JSON.parse(out.content).status).toBe("team_quote");
  });
});

describe("unpriceable jobs", () => {
  const camry = encodeVehicleKey({
    baseVehicleId: 7,
    label: "2019 Toyota Camry",
    attributes: [{ name: "EngineBase", id: 1, label: "2.5 L4" }],
  });

  it("points oil, tire and A/C queries at get_flat_price instead of the labor guide", async () => {
    for (const query of ["oil change", "winter tires", "A/C recharge"]) {
      const out = await runTool(catalogWithEngines([]), "find_services", { vehicle_key: camry, query }, () => "E");
      expect(JSON.parse(out.content)).toMatchObject({ services: [], note: expect.stringContaining("get_flat_price") });
    }
  });

  it("turns a job with no labor time into a team-quote card", async () => {
    const out = await runTool(
      catalogWithEngines([]),
      "get_estimate",
      { vehicle_key: camry, service_id: 123, position: null },
      () => "E-4",
    );
    const [card] = estimates(out.events);
    expect(card).toMatchObject({ kind: "team_quote", vehicle: "2019 Toyota Camry 2.5 L4", service: "Requested service" });
    expect(JSON.parse(out.content).summary).toMatch(/Do not give or guess any price/);
  });

  it("lets the model ask for a team quote for a vehicle the catalog doesn't have", async () => {
    const out = await runTool(
      catalogWithEngines([]),
      "request_team_quote",
      { vehicle_key: null, vehicle_description: "2023 BYD Atto 3 <script>", service: "Front brake pads" },
      () => "E-5",
    );
    const [card] = estimates(out.events);
    expect(card).toMatchObject({ kind: "team_quote", vehicle: "2023 BYD Atto 3 script", service: "Front brake pads" });
  });
});
