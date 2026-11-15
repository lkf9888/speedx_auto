import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { WORKBENCH_PROMPT } from "@/lib/workbench/assistant";
import { askRulesAssistant } from "@/lib/workbench/house-rules-agent";
import { buildLaborQuote, buildPartsQuote, buildTireQuote, summarizeStaffQuote } from "@/lib/workbench/quote";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-14: friend price = WorldPac parts at cost + $100 per part
// number, other suppliers at cost × 1.3, labor at $96/h. Workbench only.

const env = {} as NodeJS.ProcessEnv;

function part(partNumber: string, listPrice: number, cost: number | null, quantity = 1): StaffPartOption {
  return {
    description: `Part ${partNumber}`,
    series: "",
    listPrice,
    quantity,
    inStockLocally: true,
    note: "",
    prices: cost === null ? {} : { unitPrice: cost },
    partNumber,
    brand: "ACME",
    availability: "",
    qtyAvailable: 3,
    fields: {},
  };
}

const job = (parts: StaffPartOption[], hours = 1) => ({
  serviceName: "Spark Plug R&R",
  position: "",
  laborHours: hours,
  laborNote: "",
  primaryPartName: "Spark Plug",
  otherPartNames: [],
  partsNote: "",
  partOptions: parts,
});

describe("friend price on staff quotes", () => {
  it("adds $100 once per WorldPac part number, not per unit, plus labor at $96/h", () => {
    const quote = buildLaborQuote("2019 Toyota Camry", job([part("SP-1", 45, 12, 4), part("PAD-1", 250, 80)]), "W-1", env);
    expect(quote.options[0].friendTotal).toBe(12 * 4 + 100 + 96);
    expect(quote.options[1].friendTotal).toBe(80 + 100 + 96);
    expect(quote.options[0].customerTotal).toBe(180 + 120);
  });

  it("never charges a friend more than the list price for a cheap part", () => {
    // Cost $10 + $100 would be $110, above the $20 list price.
    expect(buildLaborQuote("Car", job([part("CLIP-1", 20, 10)]), "W-9", env).options[0].friendTotal).toBe(20 + 96);
    const tires = buildTireQuote("Car", "205/55R16", [{ brand: "B", pattern: "P", size: "205/55R16", load: "", season: "all_season", retail: 90, eco: 6.5, mounting: 25, cost: 80 }], 4, "W-10");
    // 80 × 1.3 + 6.5 = 110.5 → 111 + 25 = 136, above the normal 97 + 25 = 122.
    expect(tires.options[0].friendTotal).toBe(122 * 4);
  });

  it("has no friend price for a part with no cost, and the labor alone when there are no parts", () => {
    expect(buildLaborQuote("Car", job([part("X", 50, null)]), "W-2", env).options[0].friendTotal).toBeNull();
    expect(buildLaborQuote("Car", job([], 1.5), "W-3", env).options[0].friendTotal).toBe(144);
  });

  it("prices parts-only WorldPac quotes at cost + $100", () => {
    expect(buildPartsQuote("Car", "Rotor", "Front", [part("R-1", 120, 55, 2)], "W-4", env).options[0].friendTotal).toBe(210);
  });

  it("prices tires at cost × 1.3, keeping the eco fee and mounting", () => {
    const quote = buildTireQuote("Car", "225/65R17", [{ brand: "A", pattern: "W1", size: "225/65R17", load: "102H", season: "winter", retail: 196, eco: 6.5, mounting: 25, cost: 100 }], 4, "W-5");
    // 100 × 1.3 + 6.5 = 136.5 → 137, + 25 mounting = 162 per tire.
    expect(quote.options[0].friendTotal).toBe(162 * 4);
  });

  it("tells the model the friend total, and the prompt says when to use it", () => {
    const quote = buildLaborQuote("Car", job([part("PAD-1", 250, 80)]), "W-6", env);
    expect(summarizeStaffQuote(quote)).toContain("friend $276");
    expect(WORKBENCH_PROMPT).toContain("朋友价 (friend: WorldPac parts at cost + $100 per part number, not per unit and never above the list price");
    expect(WORKBENCH_PROMPT).toMatch(/客户是朋友.*set_price_tier/);
  });
});

describe("the staff quote card", () => {
  it("shows the friend price when the conversation quotes it", () => {
    render(<StaffQuoteCard quote={buildLaborQuote("Car", job([part("PAD-1", 250, 80)]), "W-7", env)} tier="friend" />);
    expect(screen.getByTestId("quote-tier")).toHaveTextContent("按朋友价");
    expect(screen.getByRole("columnheader", { name: "朋友价（零件+工时）" })).toBeInTheDocument();
    expect(screen.getByText("$276.00")).toBeInTheDocument();
  });
});

describe("the website rules AI", () => {
  it("answers in plain text, without markdown stars", async () => {
    const client = {
      beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "**朋友价**在工作台里设置。\n## 说明\n请在工作台说“客户是朋友”。" }] }) as never } },
    };
    const reply = await askRulesAssistant(client, [], [], "朋友价怎么设", "2026-11-14");
    expect(reply.text).toBe("朋友价在工作台里设置。\n说明\n请在工作台说“客户是朋友”。");
  });
});
