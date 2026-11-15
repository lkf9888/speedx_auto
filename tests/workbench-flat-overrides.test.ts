import { describe, expect, it, vi } from "vitest";
import { cleanRule } from "@/lib/repair-chat/house-rules";

// Staff quote the same flat prices as the website when the owner changed one.
const rules = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/lib/workbench/house-rules-store", () => ({ getHouseRulesStore: () => ({ list: async () => rules.list }) }));

const { runWorkbenchTool } = await import("@/lib/workbench/assistant");

describe("workbench flat prices", () => {
  it("uses the owner's new tire change price", async () => {
    rules.list = [cleanRule({ kind: "price", title: "换胎价", priceSlot: "tire_up_to_18", price: 20 }, { email: "o@x.com", at: "2026-11-14T00:00:00Z", id: "R-1" })];
    const result = await runWorkbenchTool({ get: async () => ({}) as never, post: async () => ({}) as never }, "get_flat_price", { service: "tire_change", tire_type: "up_to_18", tire_count: 4 }, () => "W-1", null);
    const quote = (result.events[0] as { quote: { options: Array<{ unitPrice: number; customerTotal: number }> } }).quote;
    expect(quote.options[0]).toMatchObject({ unitPrice: 20, customerTotal: 80 });
  });

  it("keeps the posted price when there's no rule", async () => {
    rules.list = [];
    const result = await runWorkbenchTool({ get: async () => ({}) as never, post: async () => ({}) as never }, "get_flat_price", { service: "tire_change", tire_type: "up_to_18", tire_count: 4 }, () => "W-2", null);
    expect((result.events[0] as { quote: { options: Array<{ unitPrice: number }> } }).quote.options[0].unitPrice).toBe(25);
  });
});
