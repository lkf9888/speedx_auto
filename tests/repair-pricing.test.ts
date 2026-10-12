import { describe, expect, it } from "vitest";
import { buildEstimate, laborCost, summarizeEstimateForModel } from "@/lib/repair-chat/pricing";

const quote = {
  status: "ok" as const,
  serviceName: "Brake Pads R&R",
  position: "Front",
  laborHours: 1.1,
  laborNote: "Does not include: Brake Hydraulic System Bleed.",
  primaryPartName: "Brake Pad Set",
  partOptions: [
    { description: "Akebono PRO-ACT", series: "PRO-ACT", listPrice: 159.05, quantity: 1, inStockLocally: true, note: "" },
    { description: "Advics OE", series: "Ultra-Premium", listPrice: 185.84, quantity: 1, inStockLocally: true, note: "" },
  ],
  otherPartNames: ["Brake Pad Shim"],
  partsNote: "",
};

describe("repair pricing", () => {
  it("bills $120/h for walk-ins and 80% of that for referrals", () => {
    expect(laborCost(1.1)).toBe(132);
    expect(laborCost(1.1, true)).toBe(105.6);
    expect(laborCost(0.9)).toBe(108);
  });

  it("builds walk-in and referral totals from list-priced options", () => {
    const card = buildEstimate("2019 Toyota Camry LE 2.5 L4", quote, "E-TEST", new Date("2026-10-11T00:00:00Z"));
    expect(card).toMatchObject({
      laborWalkIn: 132,
      laborReferral: 105.6,
      partsLow: 159.05,
      partsHigh: 185.84,
      totalLow: 291.05,
      totalHigh: 317.84,
      referralTotalLow: 264.65,
      referralTotalHigh: 291.44,
      createdAt: "2026-10-11T00:00:00.000Z",
    });
  });

  it("multiplies list price by quantity and supports labor-only estimates", () => {
    const rotors = buildEstimate("car", {
      ...quote,
      partOptions: [{ ...quote.partOptions[0], listPrice: 90, quantity: 2 }],
    }, "E-1");
    expect(rotors.partsLow).toBe(180);
    const laborOnly = buildEstimate("car", { ...quote, partOptions: [] }, "E-2");
    expect([laborOnly.totalLow, laborOnly.totalHigh]).toEqual([132, 132]);
  });

  it("gives the model the same numbers the card shows", () => {
    const summary = summarizeEstimateForModel(buildEstimate("2019 Toyota Camry", quote, "E-9"));
    expect(summary).toContain("1.1 h × $120/h = $132");
    expect(summary).toContain("$291.05–$317.84");
    expect(summary).toContain("Brake Hydraulic System Bleed");
  });
});

describe("referral pricing stays out of the model's view", () => {
  it("does not include referral figures in the estimate summary", () => {
    const summary = summarizeEstimateForModel(buildEstimate("2019 Toyota Camry", quote, "E-9"));
    expect(summary).not.toMatch(/referral/i);
    expect(summary).not.toContain("105.6");
    expect(summary).not.toContain("264.65");
  });
});
