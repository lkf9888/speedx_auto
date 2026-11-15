import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuoteSheetSummary } from "@/components/workbench/QuoteSheetSummary";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { PUBLIC_PROFILE } from "@/lib/repair-chat/agent";
import { runWorkbenchTool, WORKBENCH_TOOLS } from "@/lib/workbench/assistant";
import { optionLinks } from "@/lib/workbench/links";
import { buildLaborQuote } from "@/lib/workbench/quote";
import { buildUsedQuote, usedSearchLinks } from "@/lib/workbench/used-part";
import { encodeVehicleKey, type CatalogApi, type StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-15: used parts (engines, transmissions, driveshafts...) only
// when staff ask; yard price × 1.3 + shipping; warranty only as the seller
// states; workbench only, never in the public assistant.

const env = {} as NodeJS.ProcessEnv;
const input = { vehicle: "2019 Toyota Camry", service: "Engine R&R", laborHours: 8, part: "Engine assembly 2.5L" };
const found = { ...input, yard: "ABC Auto Recyclers", grade: "A", mileageKm: 82000, warranty: "90 days", partCost: 1200, shipping: 80, eta: "3 days" };

describe("used part quote", () => {
  it("without a price gives the labor, search links and a note", () => {
    const q = buildUsedQuote(input, "U-1", env)!;
    expect(q.options).toHaveLength(1);
    expect(q.options[0].partNumber).toBe("");
    expect(q.used?.links.map((l) => l.label)).toEqual(["Car-Part Pro", "eBay.ca 二手", "LKQ Canada"]);
    expect(q.used?.links[1].url).toContain("LH_ItemCondition=3000");
    expect(q.used?.links[1].url).toContain("2019+Toyota+Camry+Engine+assembly+2.5L");
    expect(q.notes.join(" ")).toMatch(/二手件/);
  });

  it("prices the part at the yard's price × 1.3 plus shipping, plus labor", () => {
    const q = buildUsedQuote(found, "U-2", env)!;
    const o = q.options[0];
    expect(o.source).toBe("used");
    expect(o.unitCost).toBe(1280); // cost + shipping
    expect(o.costTotal).toBe(1280);
    expect(o.unitPrice).toBe(1640); // 1200 × 1.3 + 80
    expect(o.customerTotal).toBe(1640 + 8 * 120);
    expect(o.referralTotal).toBe(1640 + 8 * 96);
    expect(o.friendTotal).toBe(1640 + 8 * 96);
    expect(o.profit).toBe(1640 + 960 - 1280);
    expect(o.eta).toBe("3 days");
  });

  it("multiplies the part but ships once", () => {
    const o = buildUsedQuote({ ...found, quantity: 2 }, "U-3", env)!.options[0];
    expect(o.costTotal).toBe(2480);
    expect(o.customerTotal).toBe(1200 * 2 * 1.3 + 80 + 960);
  });

  it("needs labor hours and a part name", () => {
    expect(buildUsedQuote({ ...input, laborHours: null }, "U-4", env)).toBeNull();
    expect(buildUsedQuote({ ...input, part: " " }, "U-5", env)).toBeNull();
  });

  it("tells the customer it is used with the seller's warranty, and nothing about the yard or the cost", () => {
    const q = buildUsedQuote(found, "U-6", env)!;
    expect(q.customerText).toContain("二手件，质保以卖家陈述为准");
    expect(q.customerText).not.toMatch(/ABC|拆车场|90 days|1200|1280|warranty/i);
    expect(q.notes.join(" ")).toContain("质保只按卖家的说法");
  });

  it("builds the same search links on the option, from the vehicle and part", () => {
    const q = buildUsedQuote(found, "U-7", env)!;
    expect(optionLinks(q, q.options[0]).map((l) => l.label)).toEqual(["Car-Part Pro", "eBay.ca 二手", "LKQ Canada"]);
    expect(usedSearchLinks("2019 Toyota Camry", "Engine")[0].copy).toBe("2019 Toyota Camry Engine");
  });
});

describe("used part on the card and the quote sheet", () => {
  it("shows the search links before anything is found, then the badge and the seller's details", () => {
    const { unmount } = render(<StaffQuoteCard quote={buildUsedQuote(input, "U-8", env)!} />);
    expect(screen.getByTestId("used-search")).toHaveTextContent("Engine assembly 2.5L");
    expect(screen.getByRole("link", { name: /Car-Part Pro/ })).toHaveAttribute("href", "https://pro.car-part.com/");
    unmount();
    render(<StaffQuoteCard quote={buildUsedQuote(found, "U-9", env)!} />);
    expect(screen.queryByTestId("used-search")).toBeNull();
    expect(screen.getByTestId("used-badge")).toBeInTheDocument();
    expect(screen.getByText(/拆车场 ABC Auto Recyclers/)).toBeInTheDocument();
    expect(screen.getByText(/卖家质保：90 days/)).toBeInTheDocument();
  });

  it("does not pick the used part for the sheet by default, unless it is all there is", () => {
    const part: StaffPartOption = { description: "Engine assembly", series: "", listPrice: 4000, quantity: 1, inStockLocally: true, note: "", prices: { unitPrice: 2500 }, partNumber: "E-1", brand: "ACME", availability: "", qtyAvailable: 1, fields: {} };
    const fresh = buildLaborQuote("2019 Toyota Camry", { serviceName: "Engine R&R", position: "", laborHours: 8, laborNote: "", primaryPartName: "Engine", otherPartNames: [], partsNote: "", partOptions: [part] }, "N-1", env);
    const used = buildUsedQuote(found, "U-10", env)!;
    const both = render(<QuoteSheetSummary quotes={[fresh, used]} tier="retail" />);
    expect(screen.getByTestId("quote-sheet-total")).toHaveTextContent("4,960"); // new part 4000 + 960 labor, not the cheaper used one
    both.unmount();
    render(<QuoteSheetSummary quotes={[used]} tier="retail" />);
    expect(screen.getByTestId("quote-sheet-total")).toHaveTextContent("2,600");
  });

  it("a search card with no price yet never replaces the new-part price on the sheet", () => {
    const part: StaffPartOption = { description: "Engine assembly", series: "", listPrice: 4000, quantity: 1, inStockLocally: true, note: "", prices: { unitPrice: 2500 }, partNumber: "E-1", brand: "ACME", availability: "", qtyAvailable: 1, fields: {} };
    const fresh = buildLaborQuote("2019 Toyota Camry", { serviceName: "Engine R&R", position: "", laborHours: 8, laborNote: "", primaryPartName: "Engine", otherPartNames: [], partsNote: "", partOptions: [part] }, "N-2", env);
    render(<QuoteSheetSummary quotes={[fresh, buildUsedQuote(input, "U-11", env)!]} tier="retail" />);
    expect(screen.getByTestId("quote-sheet-total")).toHaveTextContent("4,960");
  });
});

describe("used part tool", () => {
  const vehicle = { baseVehicleId: 1, label: "2019 Toyota Camry", attributes: [] };
  const api = {} as CatalogApi;
  const args: Record<string, unknown> = { vehicle_key: encodeVehicleKey(vehicle), service: "Engine R&R", labor_hours: 8, part: "Engine assembly 2.5L", yard: "ABC", warranty: "90 days", part_cost: 1200, shipping: 80 };

  it("builds a card from what staff found", async () => {
    const result = await runWorkbenchTool(api, "used_part", args, () => "W-1", null);
    expect(result.isError).toBe(false);
    expect(result.events[0]).toMatchObject({ type: "quote", quote: { options: [{ source: "used", customerTotal: 2600 }] } });
    const search = await runWorkbenchTool(api, "used_part", { ...args, part_cost: undefined }, () => "W-2", null);
    expect(search.events[0]).toMatchObject({ type: "quote", quote: { used: { part: "Engine assembly 2.5L" } } });
  });

  it("refuses without labor hours or an unknown vehicle", async () => {
    expect((await runWorkbenchTool(api, "used_part", { ...args, labor_hours: undefined }, () => "W-3", null)).isError).toBe(true);
    expect((await runWorkbenchTool(api, "used_part", { ...args, vehicle_key: "nope" }, () => "W-4", null)).isError).toBe(true);
  });

  it("is in the staff workbench only, never the public assistant", () => {
    expect(WORKBENCH_TOOLS.map((t) => t.name)).toContain("used_part");
    expect(PUBLIC_PROFILE.tools.map((t) => t.name)).not.toContain("used_part");
    expect(PUBLIC_PROFILE.system).not.toMatch(/used part|二手/i);
  });
});
