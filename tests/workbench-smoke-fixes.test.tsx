import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import type { DtTireClient } from "@/lib/dt-tire/client";
import { runTool } from "@/lib/repair-chat/tools";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { describeFleetCar, runWorkbenchTool, type WorkbenchEvent } from "@/lib/workbench/assistant";
import { buildPartsQuote, summarizeStaffQuote, type StaffQuote } from "@/lib/workbench/quote";
import { encodeVehicleKey, staffPartQuotes, type CatalogApi, type VehicleRef } from "@/lib/worldpac/catalog";

// From Codex's smoke test of repair.speedxrental.com (2026-10-14), findings F01–F09 and D01.

const quotes = (events: WorkbenchEvent[]) => events.filter((e): e is { type: "quote"; quote: StaffQuote } => e.type === "quote").map((e) => e.quote);

function dt(tires: Array<Partial<{ sku: string; model: string; studding: string }>>): () => DtTireClient {
  const base = { productCode: "", brand: "Michelin", performance: "Ice and snow", season: "Winter", size: "225/65R17", serviceDescription: "106T XL", studding: "", cost: 205.22, msrp: 248, suggestedRetail: 248, localStock: "0", warehouseStock: "99+" };
  return () => ({ searchBySize: async () => ({ total: tires.length, tires: tires.map((t) => ({ ...base, sku: "1", model: "X-ICE SNOW", ...t })) }) }) as unknown as DtTireClient;
}
const tireInput = (extra: Record<string, unknown>) => ({ size: "225/65R17", season: "winter", brand: "Michelin", count: null, vehicle_key: null, studs: "any", skus: "", ...extra });

describe("F02: tire counts", () => {
  it("keeps 8 tires as 8 on the card and in the customer text", async () => {
    const out = await runWorkbenchTool({} as CatalogApi, "find_brand_tires", tireInput({ count: 8 }), () => "W-QA", null, dt([{ sku: "24387" }]));
    const [card] = quotes(out.events);
    expect(card.options[0]).toMatchObject({ quantity: 8, customerTotal: 280 * 8 });
    expect(card.customerText).toContain("× 8");
  });

  it("refuses a count it can't quote instead of quietly using 4", async () => {
    const out = await runWorkbenchTool({} as CatalogApi, "find_brand_tires", tireInput({ count: 25 }), () => "W-QA", null, dt([{ sku: "24387" }]));
    expect(out.isError).toBe(true);
    expect(out.events).toEqual([]);
    expect(out.content).toContain("1 to 20");
  });
});

describe("F06: narrowing a tire choice", () => {
  const three = dt([{ sku: "11291", model: "X-ICE NORTH 4 STUDDED", studding: "Pre-studded" }, { sku: "24387" }, { sku: "07567", model: "X-ICE SNOW+" }]);

  it("leaves studded tires off the card when staff exclude them", async () => {
    const [card] = quotes((await runWorkbenchTool({} as CatalogApi, "find_brand_tires", tireInput({ studs: "exclude" }), () => "W-QA", null, three)).events);
    expect(card.options.map((o) => o.partNumber)).toEqual(["24387", "07567"]);
    expect(card.customerText).not.toContain("STUDDED");
  });

  it("shows only the SKUs staff picked", async () => {
    const [card] = quotes((await runWorkbenchTool({} as CatalogApi, "find_brand_tires", tireInput({ skus: "#07567" }), () => "W-QA", null, three)).events);
    expect(card.options.map((o) => o.partNumber)).toEqual(["07567"]);
  });

  it("lets staff untick options before copying the customer text", async () => {
    const [card] = quotes((await runWorkbenchTool({} as CatalogApi, "find_brand_tires", tireInput({}), () => "W-QA", null, three)).events);
    const writeText = vi.fn(async (text: string) => void text);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<StaffQuoteCard quote={card} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /X-ICE NORTH 4 STUDDED/ }));
    await userEvent.click(screen.getByRole("button", { name: "复制客户报价（2 个选项）" }));
    const text = writeText.mock.calls[0][0];
    expect(text).toContain("X-ICE SNOW");
    expect(text).not.toContain("STUDDED");
    expect(within(screen.getByTestId("staff-quote")).getAllByRole("checkbox")).toHaveLength(3);
  });
});

describe("F03: parts for another position", () => {
  it("are left out instead of every part coming back", () => {
    const parts = staffPartQuotes({ quotes: [{ productQuotes: [{ partDescription: "Rear shock absorber", manufacturerPart: "REAR-QA", listPrice: 100, unitPrice: 50, position: { id: 2 } }] }] }, 1);
    expect(parts).toEqual([]);
  });
});

describe("F01/F05: both sides", () => {
  let base = 920000;
  const car = (): VehicleRef => ({ baseVehicleId: (base += 1), label: "2016 Honda CR-V EX", attributes: [] });
  const catalog: CatalogApi = {
    async get() {
      throw new Error("unused");
    },
    async post<T>(path: string) {
      if (path === "labor-ops-list") return { laborOperations: [{ applicationID: 1, assetName: "s", position: { description: "Front", id: 22 }, positionID: 22 }] } as T;
      if (path === "labor-ops-details") {
        return { laborOperation: { estimateTimeHour: 1.6, laborCategoryName: "Strut Assembly R&R", applications: [{ categoryCode: "N1", categoryName: "Strut Assembly" }] } } as T;
      }
      if (path === "pna360_cat") {
        return {
          applications: [{ appID: "a1", qtyPerCar: 1 }, { appID: "a2", qtyPerCar: 2 }],
          quotes: [
            {
              productQuotes: [
                { appID: "a1", partDescription: "Strut Assembly", manufacturerPart: "22-214089", listPrice: 678.16, unitPrice: 173.46, position: { id: 22 } },
                { appID: "a2", partDescription: "Shock Absorber", manufacturerPart: "340115", listPrice: 260.49, unitPrice: 116.66, position: { id: 22 } },
              ],
            },
          ],
        } as T;
      }
      throw new Error(path);
    },
  };
  const input = (vehicle: VehicleRef, both: boolean) => ({ vehicle_key: encodeVehicleKey(vehicle), service_id: 9, position: "Front", done_with_service_id: 0, done_with_position: "", both_sides: both });

  it("puts labor × 2 and both sides' parts on the staff card and in the customer text", async () => {
    const [card] = quotes((await runWorkbenchTool(catalog, "get_estimate", input(car(), true), () => "W-1", null)).events);
    expect(card.labor).toMatchObject({ hours: 3.2, walkIn: 384 });
    expect(card.position).toBe("Front, both sides");
    const strut = card.options.find((o) => o.partNumber === "22-214089")!;
    const shock = card.options.find((o) => o.partNumber === "340115")!;
    // One per car becomes two; a part already listed two per car is not doubled again.
    expect([strut.quantity, strut.customerTotal]).toEqual([2, 678.16 * 2 + 384]);
    expect(shock.quantity).toBe(2);
    expect(card.customerText).toContain("（Front，左右两边）");
    expect(card.customerText).toContain("× 2：$1740.32");
  });

  it("does the same on the public assistant's card", async () => {
    const out = await runTool(catalog, "get_estimate", input(car(), true), () => "E-1", "zh-CN", null);
    const card = (out.events.find((e) => e.type === "estimate") as { estimate: EstimateCard }).estimate;
    expect([card.laborHours, card.laborWalkIn]).toEqual([3.2, 384]);
    expect(card.partOptions.find((p) => p.description === "Strut Assembly")!.quantity).toBe(2);
  });

  it("leaves a one-side job alone", async () => {
    const [card] = quotes((await runWorkbenchTool(catalog, "get_estimate", input(car(), false), () => "W-1", null)).events);
    expect(card.labor!.hours).toBe(1.6);
  });
});

describe("F08/F09: what the model and staff are told", () => {
  it("names the supplier and the link buttons in the model's summary", () => {
    const quote = buildPartsQuote("2019 Toyota Camry", "Brake Pad Set", "Front", [], "W-QA");
    expect(quote.supplier).toBe("worldpac");
    const summary = summarizeStaffQuote(quote);
    expect(summary).toContain("Source: WorldPac");
    expect(summary).toContain("search entry points, not checked listings");
  });

  it("doesn't claim the labor guide lacks the job on a parts-only card", () => {
    const quote = buildPartsQuote("2019 Toyota Camry", "Brake Pad Set", "Front", [], "W-QA");
    expect(quote.notes.join(" ")).not.toContain("工时库没有对应的项目");
  });
});

describe("D01: stale TATO trips", () => {
  it("doesn't call a car out on a trip when the trip's return time has passed", () => {
    const now = new Date("2026-10-14T20:00:00Z");
    const car = { id: "v", plate: "XD242A", nickname: "", year: 2024, brand: "Mitsubishi", model: "Mirage", vin: "", status: "available", owner: null };
    const text = describeFleetCar(car, [{ status: "ongoing", pickup: "2026-08-15T17:00:00Z", return: "2026-08-20T05:30:00Z" }], now);
    expect(text).not.toContain("On a trip now");
    expect(text).toContain("Stale in TATO");
    expect(text).toContain("55 days ago");
  });
});
