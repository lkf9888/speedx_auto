import { describe, expect, it } from "vitest";
import { FLAT_PRICE_SLOTS, quoteShopService } from "@/lib/repair-chat/flat-price";
import { SYSTEM_PROMPT } from "@/lib/repair-chat/prompt";
import { runTool, TOOLS, type ChatEvent } from "@/lib/repair-chat/tools";
import { runWorkbenchTool, WORKBENCH_TOOLS, type WorkbenchEvent } from "@/lib/workbench/assistant";
import type { StaffQuote } from "@/lib/workbench/quote";
import type { CatalogApi } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-16: a quick vehicle inspection is $80 (waived if the repair is done here);
// a tire puncture repair is $20 a tire, $30 for AT tires.

const api = { get: async () => ({}), post: async () => ({}) } as unknown as CatalogApi;
const cards = (events: ChatEvent[]) => events.filter((e): e is Extract<ChatEvent, { type: "estimate" }> => e.type === "estimate").map((e) => e.estimate);
const quotes = (events: WorkbenchEvent[]) => events.filter((e): e is { type: "quote"; quote: StaffQuote } => e.type === "quote").map((e) => e.quote);

describe("the posted prices", () => {
  it("are $80 for the inspection and $20 / $30 per tire for a patch", () => {
    expect(FLAT_PRICE_SLOTS.inspection_quick.price).toBe(80);
    expect(FLAT_PRICE_SLOTS.tire_patch_standard.price).toBe(20);
    expect(FLAT_PRICE_SLOTS.tire_patch_at.price).toBe(30);
    expect(quoteShopService("inspection", null, null).options).toMatchObject([{ unitPrice: 80, quantity: 1 }]);
    expect(quoteShopService("tire_repair", "at", 2).options).toMatchObject([{ unitPrice: 30, quantity: 2 }]);
    expect(quoteShopService("tire_repair", null, null).options.map((o) => [o.unitPrice, o.quantity])).toEqual([[20, 1], [30, 1]]);
  });
});

describe("on the website", () => {
  it("quotes the inspection without a vehicle, saying it is waived with a repair", async () => {
    const out = await runTool(api, "get_shop_service_price", { service: "inspection" }, () => "E-1", "en");
    const [card] = cards(out.events);
    expect(card).toMatchObject({ kind: "flat", flatService: "inspection", service: "Quick vehicle inspection", totalLow: 80, totalHigh: 80 });
    expect(card.partsNote).toContain("waived");
    expect(JSON.parse(out.content).summary).toContain("$80");
  });

  it("quotes a patch per tire, in the customer's language", async () => {
    const out = await runTool(api, "get_shop_service_price", { service: "tire_repair", tire_kind: "at", tire_count: 2 }, () => "E-2", "zh-CN");
    const [card] = cards(out.events);
    expect(card).toMatchObject({ service: "补胎", totalLow: 60, totalHigh: 60 });
    expect(card.partOptions[0]).toMatchObject({ description: "AT 胎，每条", quantity: 2, unitListPrice: 30 });
    const both = await runTool(api, "get_shop_service_price", { service: "tire_repair" }, () => "E-3", "en");
    expect([cards(both.events)[0].totalLow, cards(both.events)[0].totalHigh]).toEqual([20, 30]);
  });

  it("refuses an unknown service and is offered to the assistant", async () => {
    expect((await runTool(api, "get_shop_service_price", { service: "alignment" }, () => "E-4", "en")).isError).toBe(true);
    expect(TOOLS.some((t) => t.name === "get_shop_service_price")).toBe(true);
    expect(SYSTEM_PROMPT).toContain("get_shop_service_price");
    expect(SYSTEM_PROMPT).toContain("$80");
    expect(SYSTEM_PROMPT).toContain("waived");
  });
});

describe("in the workbench", () => {
  it("quotes the inspection and the patch for staff", async () => {
    expect(WORKBENCH_TOOLS.some((t) => t.name === "get_shop_service_price")).toBe(true);
    const inspection = quotes((await runWorkbenchTool(api, "get_shop_service_price", { service: "inspection" }, () => "W-1", null)).events)[0];
    expect(inspection).toMatchObject({ kind: "flat", options: [expect.objectContaining({ customerTotal: 80 })] });
    expect(inspection.notes.join(" ")).toContain("免收");
    const patch = quotes((await runWorkbenchTool(api, "get_shop_service_price", { service: "tire_repair", tire_kind: "at", tire_count: 3 }, () => "W-2", null)).events)[0];
    expect(patch.options.map((o) => [o.unitPrice, o.quantity, o.customerTotal])).toEqual([[30, 3, 90]]);
  });
});
