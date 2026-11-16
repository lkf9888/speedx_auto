import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuoteSheetSummary } from "@/components/workbench/QuoteSheetSummary";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { buildLaborQuote } from "@/lib/workbench/quote";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-16: copy the order and open the supplier's page; staff add to the cart and order themselves.

const part = (partNumber: string, cost: number): StaffPartOption => ({ description: "Brake Disc", series: "", listPrice: 300, quantity: 2, inStockLocally: true, note: "", prices: { unitPrice: cost }, partNumber, brand: "Brembo", availability: "", qtyAvailable: 3, fields: {} });
const quote = (id: string, service: string, partNumber: string) =>
  buildLaborQuote("2021 Porsche Cayenne GTS", { serviceName: service, position: "Front", laborHours: 0.8, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [part(partNumber, 150)] }, id, {} as NodeJS.ProcessEnv);

function clipboard() {
  const writeText = vi.fn(async (text: string) => void text);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

describe("ordering helpers on the workbench", () => {
  it("copies one order line from a part on the card, saying it carries the cost", async () => {
    const writeText = clipboard();
    render(<StaffQuoteCard quote={quote("W-1", "Brake Rotor R&R", "P-100")} tier="retail" />);
    await userEvent.click(screen.getByTestId("copy-order"));
    expect(writeText).toHaveBeenCalledWith("WorldPac · 本地有货｜2021 Porsche Cayenne GTS｜Brembo Brake Disc #P-100 × 2｜进价 $150.00/个");
    expect(await screen.findByText("已复制（内部，含进价）")).toBeInTheDocument();
  });

  it("copies an order list from the quote sheet, grouped by supplier, never in the customer copy", async () => {
    const writeText = clipboard();
    render(<QuoteSheetSummary quotes={[quote("W-1", "Brake Rotor R&R", "P-100"), quote("W-2", "Brake Pads R&R", "P-200")]} tier="retail" />);
    await userEvent.click(screen.getByTestId("copy-order-list"));
    const text = writeText.mock.calls[0][0];
    expect(text).toContain("订货单（内部，含进价，别发给客人）");
    expect(text).toContain("■ WorldPac");
    expect(text).toContain("#P-100 × 2");
    expect(text).toContain("#P-200 × 2");
    expect(text).toContain("这里不会替你下单");
    writeText.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "复制报价给客人" }));
    expect(writeText.mock.calls[0][0]).not.toMatch(/进价|P-100|订货|WorldPac/);
  });
});
