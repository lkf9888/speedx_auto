import { describe, expect, it } from "vitest";
import type { DtTireClient } from "@/lib/dt-tire/client";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { runTool } from "@/lib/repair-chat/tools";
import type { CatalogApi } from "@/lib/worldpac/catalog";

const tire = (over: Record<string, unknown>) => ({
  sku: "1",
  productCode: "",
  brand: "Michelin",
  model: "X-ICE SNOW",
  performance: "Ice and snow",
  season: "Winter",
  size: "225/65R17",
  serviceDescription: "106T XL",
  studding: "",
  cost: 205.22,
  msrp: 248,
  suggestedRetail: 248,
  localStock: "4",
  warehouseStock: "99+",
  ...over,
});

const dt = (tires: unknown[]) => () => ({ searchBySize: async () => ({ total: tires.length, tires }) }) as unknown as DtTireClient;
const input = (extra: Record<string, unknown> = {}) => ({ size: "225/65r17", season: "winter", brand: "Michelin", count: null, vehicle_key: null, new_price_over_120k: false, ...extra });
const api = {} as CatalogApi;

async function card(tires: unknown[], extra: Record<string, unknown> = {}, locale = "zh-CN") {
  const out = await runTool(api, "find_brand_tires", input(extra), () => "E-1", locale, null, dt(tires));
  return { out, card: (out.events.find((e) => e.type === "estimate") as { estimate: EstimateCard } | undefined)?.estimate };
}

describe("brand-name tires on the public assistant", () => {
  it("quotes the installed price per tire with stock, and never names the supplier", async () => {
    const { out, card: c } = await card([
      tire({ sku: "24387" }),
      tire({ sku: "07567", model: "X-ICE SNOW+", msrp: 256, localStock: "0" }),
      tire({ sku: "11291", model: "X-ICE NORTH 4 STUDDED", studding: "Pre-studded", msrp: 259 }),
    ]);
    expect(c!.kind).toBe("tires");
    // MSRP 248 + eco 6.50, rounded, + $25 mounting = $280 a tire, 4 tires.
    expect(c!.partOptions[0]).toMatchObject({ unitListPrice: 280, quantity: 4, total: 1120 });
    expect(c!.partOptions.map((p) => p.description)).toEqual([
      "Michelin X-ICE SNOW 225/65R17 106T XL · 现货",
      "Michelin X-ICE SNOW+ 225/65R17 106T XL · 需调货，约 1–3 天",
      "Michelin X-ICE NORTH 4 (带钉) 225/65R17 106T XL · 现货",
    ]);
    const everything = JSON.stringify(out);
    expect(everything).not.toMatch(/DT|Tire Hub|205\.22|cost/i);
    expect(everything).toContain("Never say where the shop buys these tires");
  });

  it("speaks the customer's language", async () => {
    const { card: en } = await card([tire({ localStock: "0" })], {}, "en");
    expect(en!.partOptions[0].description).toContain("about 1–3 days to arrive");
  });

  it("leaves out tires nobody has in stock and other brands DT adds", async () => {
    const { card: c } = await card([tire({ sku: "a", localStock: "0", warehouseStock: "0" }), tire({ sku: "b", brand: "Laufenn", model: "I FIT ICE" }), tire({ sku: "c" })]);
    expect(c!.partOptions).toHaveLength(1);
  });

  it("sends premium vehicles, an unset DT and an empty search to the team", async () => {
    expect((await card([tire({})], { new_price_over_120k: true })).card!.kind).toBe("team_quote");
    const unset = await runTool(api, "find_brand_tires", input(), () => "E-1", "zh-CN", null, () => null);
    expect((unset.events[0] as { estimate: EstimateCard }).estimate.kind).toBe("team_quote");
    expect((await card([])).card!.kind).toBe("team_quote");
  });

  it("keeps the count it was given and refuses one it can't quote", async () => {
    expect((await card([tire({})], { count: 2 })).card!.partOptions[0]).toMatchObject({ quantity: 2, total: 560 });
    expect((await card([tire({})], { count: 30 })).out.isError).toBe(true);
  });
});
