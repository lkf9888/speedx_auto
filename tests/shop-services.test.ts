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

describe("review fixes", () => {
  it("defaults to one tire in the workbench and refuses bad counts everywhere", async () => {
    const one = quotes((await runWorkbenchTool(api, "get_shop_service_price", { service: "tire_repair", tire_kind: "standard" }, () => "W-3", null)).events)[0];
    expect(one.options[0]).toMatchObject({ quantity: 1, customerTotal: 20 });
    const nulled = quotes((await runWorkbenchTool(api, "get_shop_service_price", { service: "tire_repair", tire_kind: "standard", tire_count: null }, () => "W-4", null)).events)[0];
    expect(nulled.options[0].customerTotal).toBe(20);
    expect((await runWorkbenchTool(api, "get_shop_service_price", { service: "tire_repair", tire_count: 21 }, () => "W-5", null)).isError).toBe(true);
    expect((await runTool(api, "get_shop_service_price", { service: "tire_repair", tire_count: 8 }, () => "E-5", "en")).isError).toBe(true);
    expect(cards((await runTool(api, "get_shop_service_price", { service: "tire_repair", tire_kind: "standard" }, () => "E-6", "en")).events)[0].totalLow).toBe(20);
  });

  it("the copy for the customer says how many tires the price is for", async () => {
    const { customerText } = await import("@/lib/workbench/customer-text");
    const patch = quotes((await runWorkbenchTool(api, "get_shop_service_price", { service: "tire_repair", tire_kind: "standard", tire_count: 3 }, () => "W-6", null)).events)[0];
    expect(customerText(patch)).toContain("每条 $20.00 × 3：$60.00");
  });

  it("a follow-up offer on an inspection applies to inspections only", async () => {
    const { DISCOUNT_TARGETS } = await import("@/lib/repair-chat/house-rules");
    expect(DISCOUNT_TARGETS).toContain("inspection");
    expect(DISCOUNT_TARGETS).toContain("tire_repair");
  });

  it("the workbench prompt points the new services at the right tool", async () => {
    const { WORKBENCH_PROMPT } = await import("@/lib/workbench/assistant");
    expect(WORKBENCH_PROMPT).toContain("get_shop_service_price");
  });
});
