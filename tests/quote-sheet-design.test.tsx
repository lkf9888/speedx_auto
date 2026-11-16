import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuoteSheetSummary } from "@/components/workbench/QuoteSheetSummary";
import { withFinalPrices } from "@/lib/workbench/final-price";
import { buildLaborQuote } from "@/lib/workbench/quote";
import { buildQuotePage } from "@/lib/workbench/quote-pdf";
import type { StaffPartOption } from "@/lib/worldpac/catalog";
import { writeFileSync } from "node:fs";

// Kevin, 2026-11-15: the estimate shows labor at the $120/h list price with the
// discount and its amount, is laid out like an ALLDATA estimate, and can be
// saved as an image.

const env = {} as NodeJS.ProcessEnv;
const part = (listPrice: number, cost: number): StaffPartOption => ({ description: "Brake Disc", series: "", listPrice, quantity: 1, inStockLocally: true, note: "", prices: { unitPrice: cost }, partNumber: "P-1", brand: "ACME", availability: "", qtyAvailable: 3, fields: {} });
const rotors = buildLaborQuote("2019 Toyota Camry", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 2, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [part(200, 100)] }, "W-1", env);

describe("labor discount on the estimate", () => {
  it("shows the list labor, the discount and its amount on the sheet and in the copy", () => {
    render(<QuoteSheetSummary quotes={[rotors]} tier="custom" custom={{ partsPct: 100, laborRate: 90 }} />);
    expect(screen.getByTestId("labor-discount")).toHaveTextContent("原价 $240.00 → 优惠 −$60.00（25% off）→ $180.00");
    expect(screen.getByTestId("labor-discount-total")).toHaveTextContent("−$60.00");
  });

  it("shows nothing at the list rate", () => {
    render(<QuoteSheetSummary quotes={[rotors]} tier="retail" />);
    expect(screen.queryByTestId("labor-discount")).toBeNull();
  });

  it("lays the page out with parts, labor at the list rate, the discount and totals", () => {
    const quote = withFinalPrices(rotors);
    const total = quote.options[0].customerTotal - 60; // labor 2 h at $90 instead of $120
    const page = buildQuotePage({ ...quote, options: [{ ...quote.options[0], customerTotal: total }] }, new Date("2026-11-15T20:00:00Z"), undefined, undefined, { hours: 2, list: 240, charged: 180 });
    const text = page.textContent ?? "";
    expect(text).toContain("Repair Estimate");
    expect(text).toContain("Labor · 2.0 h at $120.00/h");
    expect(text).toContain("$240.00");
    expect(text).toContain("Labor discount (25% off)");
    expect(text).toContain("−$60.00");
    expect(text).toContain("Job total");
    expect(text).not.toMatch(/[　-〿一-鿿＀-￯]/);
    if (process.env.DUMP_QUOTE_PAGE) writeFileSync(process.env.DUMP_QUOTE_PAGE, "<meta charset=utf-8>" + page.outerHTML);
  });

  it("shows no labor discount once a final price replaces the total", () => {
    const final = { ...rotors, final: { totals: { "0": 340 }, by: "k@x", at: 1 } };
    render(<QuoteSheetSummary quotes={[final]} tier="custom" custom={{ partsPct: 100, laborRate: 90 }} />);
    expect(screen.queryByTestId("labor-discount")).toBeNull();
  });

  it("the image button saves a PNG", async () => {
    const made: string[] = [];
    vi.doMock("@/lib/workbench/quote-pdf", () => ({
      quoteImage: vi.fn(async (q: { id: string }) => {
        made.push(q.id);
        return new File(["x"], "a.png", { type: "image/png" });
      }),
      downloadFile: vi.fn(),
    }));
    render(<QuoteSheetSummary quotes={[rotors]} tier="retail" />);
    await userEvent.click(screen.getByRole("button", { name: "下载图片报价单" }));
    await vi.waitFor(() => expect(made).toEqual(["W-1"]));
    vi.doUnmock("@/lib/workbench/quote-pdf");
  });
});
