import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { summarizeEstimateForModel } from "@/lib/repair-chat/pricing";
import { runTool, type ChatEvent } from "@/lib/repair-chat/tools";
import {
  ecoFee,
  findTires,
  loadTireList,
  resetTireListCache,
  sizeKey,
  type TireListing,
} from "@/lib/repair-chat/tires";
import { encodeVehicleKey } from "@/lib/worldpac/catalog";

// Made-up prices: the real list never goes in this public repo.
const LIST: TireListing[] = [
  { category: "all_season", brand: "BrandA", size: "225/65R17", pattern: "AS1", load: "102H", price: 100 },
  { category: "all_season", brand: "BrandB", size: "225/65R17", pattern: "AS2", load: "102H", price: 120.4 },
  { category: "all_season", brand: "BrandC", size: "225/65R17", pattern: "AS3", load: "102H", price: 130 },
  { category: "all_season", brand: "BrandD", size: "225/65R17", pattern: "AS4", load: "102H", price: 150 },
  { category: "all_weather", brand: "BrandE", size: "225/65R17", pattern: "AW1", load: "106H", price: 110 },
  { category: "winter", brand: "BrandF", size: "225/65R17", pattern: "W1", load: "102H", price: 125 },
  { category: "off_road", brand: "BrandG", size: "LT245/75R16-10PR", pattern: "AT1", load: "120/116Q", price: 200 },
  { category: "all_season", brand: "BrandH", size: "255/45ZR20", pattern: "AS5", load: "105W", price: 160 },
  { category: "trailer", brand: "BrandI", size: "ST225/75R15-10PR", pattern: "TR1", load: "109/104L", price: 130 },
  { category: "off_road", brand: "BrandJ", size: "33*12.50R18LT-10PR", pattern: "MT1", load: "118Q", price: 300 },
];
const OCT = new Date("2026-10-13T20:00:00Z");

describe("tire sizes", () => {
  it("reads the common ways sizes are written", () => {
    expect(sizeKey("225/65R17")?.key).toBe("225/65R17");
    expect(sizeKey("P225/65 R17 102H")?.key).toBe("225/65R17");
    expect(sizeKey("225 65 17")?.key).toBe("225/65R17");
    expect(sizeKey("225-65-17")?.key).toBe("225/65R17");
    expect(sizeKey("LT245/75R16-10PR")).toEqual({ key: "245/75R16", rim: 16 });
    expect(sizeKey("235/45ZR18 XL")?.key).toBe("235/45R18");
    expect(sizeKey("33x12.5R18")?.key).toBe("33X12.50R18");
    expect(sizeKey("33*12.50R18LT-10PR")?.key).toBe("33X12.50R18");
    expect(sizeKey("my tires are worn")).toBeNull();
  });
});

describe("tire prices", () => {
  it("folds the eco fee in and switches it on Jan 1 2027", () => {
    expect(ecoFee(OCT)).toBe(6.5);
    expect(ecoFee(new Date("2027-01-01T09:00:00Z"))).toBe(7);
  });

  it("prices one all-in number per tire: tire + eco fee, rounded, + mounting", () => {
    const [cheapest] = findTires(LIST, "225/65R17", "all_season", 4, OCT);
    // 100 + 6.50 → 107 (rounded) + $25 mounting (17 in.)
    expect(cheapest).toMatchObject({ brand: "BrandA", perTire: 132, count: 4, total: 528 });
    // over 18 in. mounts at $30; off-road at $45 whatever the size
    expect(findTires(LIST, "255/45R20", "any", 4, OCT)[0].perTire).toBe(Math.round(160 + 6.5) + 30);
    expect(findTires(LIST, "245/75R16", "off_road", 2, OCT)[0]).toMatchObject({ perTire: 207 + 45, total: 504 });
    expect(findTires(LIST, "33x12.50R18", "off_road", 4, OCT)[0].perTire).toBe(307 + 45);
  });

  it("shows cheapest, middle and dearest for a season, and one per season for 'any'", () => {
    expect(findTires(LIST, "225/65R17", "all_season", 4, OCT).map((o) => o.brand)).toEqual(["BrandA", "BrandC", "BrandD"]);
    expect(findTires(LIST, "225/65R17", "any", 4, OCT).map((o) => o.season)).toEqual(["all_season", "all_weather", "winter"]);
    expect(findTires(LIST, "225/65R17", "off_road", 4, OCT)).toEqual([]);
  });

  it("keeps trailer tires apart from car tires", () => {
    expect(findTires(LIST, "ST225/75R15", "any", 2, OCT).map((o) => o.brand)).toEqual(["BrandI"]);
    expect(findTires(LIST, "225/75R15", "any", 2, OCT)).toEqual([]);
  });
});

describe("tire price file", () => {
  afterEach(() => {
    resetTireListCache();
    delete process.env.TIRE_PRICES_FILE;
  });

  it("loads only the fields it needs and ignores bad rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "tires-"));
    const path = join(dir, "tires.json");
    writeFileSync(path, JSON.stringify([{ ...LIST[0], cost: 77, supplier: "X" }, { brand: "broken" }]));
    expect(loadTireList(path)).toEqual([LIST[0]]);
  });

  it("returns null when there is no file", () => {
    expect(loadTireList(join(tmpdir(), "no-such-tires.json"))).toBeNull();
  });
});

describe("find_tires tool", () => {
  const api = { get: async () => ({}) as never, post: async () => ({}) as never };
  const ask = (input: Record<string, unknown>) =>
    runTool(
      api,
      "find_tires",
      { size: "225/65R17", season: "any", count: null, vehicle_key: null, new_price_over_120k: false, ...input },
      () => "E-T1",
      "zh-CN",
    );
  const cards = (events: ChatEvent[]) => events.flatMap((e) => (e.type === "estimate" ? [e.estimate] : []));

  function useList(list: unknown[]) {
    const dir = mkdtempSync(join(tmpdir(), "tires-"));
    process.env.TIRE_PRICES_FILE = join(dir, "tires.json");
    writeFileSync(process.env.TIRE_PRICES_FILE, JSON.stringify(list));
    resetTireListCache();
  }

  afterEach(() => {
    resetTireListCache();
    delete process.env.TIRE_PRICES_FILE;
  });

  it("shows a tire card with one price per tire and tells the model not to split it", async () => {
    useList(LIST);
    const out = await ask({ season: "winter" });
    const [card] = cards(out.events);
    expect(card).toMatchObject({ kind: "tires", service: "新轮胎（含安装） · 225/65R17", vehicle: "—" });
    expect(card.partOptions[0]).toMatchObject({ description: "BrandF W1 225/65R17 102H", quantity: 4 });
    expect(card.partsNote).toContain("库存和到货时间以店里确认为准");
    const summary = JSON.parse(out.content).summary as string;
    expect(summary).toContain("per tire × 4");
    expect(summary).toMatch(/do not split them/);
    expect(summarizeEstimateForModel(card)).not.toMatch(/eco|6\.5/i);
  });

  it("says which seasons exist when the asked one doesn't", async () => {
    useList(LIST);
    const out = await ask({ season: "off_road" });
    expect(JSON.parse(out.content)).toEqual({ status: "not_in_this_season", available_seasons: ["all_season", "all_weather", "winter"] });
  });

  it("hands unknown sizes, missing lists and V8 trucks to the team", async () => {
    useList(LIST);
    expect(cards((await ask({ size: "195/65R15" })).events)[0].kind).toBe("team_quote");
    const v8 = encodeVehicleKey({
      baseVehicleId: 5,
      label: "2020 Ford F-150",
      attributes: [{ name: "EngineBase", id: 2, label: "5.0 V8" }],
    });
    expect(cards((await ask({ vehicle_key: v8 })).events)[0].kind).toBe("team_quote");
    expect((await ask({ size: "worn out" })).isError).toBe(true);

    resetTireListCache();
    process.env.TIRE_PRICES_FILE = join(tmpdir(), "no-such-tires.json");
    expect(cards((await ask({})).events)[0].kind).toBe("team_quote");
  });
});
