import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuoteSheetSummary } from "@/components/workbench/QuoteSheetSummary";
import { withFinalPrices } from "@/lib/workbench/final-price";
import { buildLaborQuote } from "@/lib/workbench/quote";
import { buildQuotePage, type SheetPdf } from "@/lib/workbench/quote-pdf";
import { taxOn } from "@/lib/workbench/tax";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-16: staff sheet = list on the left and a dark summary panel on the right (design C); customer
// estimate = design B with the regular price struck through to the left of the new total.

const env = {} as NodeJS.ProcessEnv;
const part = (list: number, cost: number): StaffPartOption => ({ description: "Brake Disc", series: "", listPrice: list, quantity: 1, inStockLocally: true, note: "", prices: { unitPrice: cost }, partNumber: "P-1", brand: "ACME", availability: "", qtyAvailable: 3, fields: {} });
const job = (service: string, position: string, hours: number, id: string) =>
  buildLaborQuote("2019 Toyota Camry", { serviceName: service, position, laborHours: hours, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [part(200, 80)] }, id, env);
const front = job("Brake Rotor R&R", "Front", 2, "W-1");
const rear = job("Brake Rotor R&R", "Rear", 1, "W-2");

describe("the staff quote sheet", () => {
  it("lists the jobs on the left and sums parts, list labor, the discount and tax on the right", () => {
    render(<QuoteSheetSummary quotes={[front, rear]} tier="referral" />);
    const total = screen.getByTestId("quote-sheet-total");
    // parts 400 + labor 3 h x $96 = 288, so 688; the labor at the $120/h list price is 360
    expect(total).toHaveTextContent("$688.00");
    const aside = total.closest("aside")!;
    expect(aside).toHaveTextContent("零件");
    expect(aside).toHaveTextContent("$400.00");
    expect(aside).toHaveTextContent("$360.00");
    expect(screen.getByTestId("labor-discount-total")).toHaveTextContent("−$72.00");
    expect(screen.getByTestId("quote-sheet-after-tax")).toHaveTextContent(`$${taxOn(688).total.toFixed(2)}`);
    // The buttons live in the panel.
    expect(aside).toContainElement(screen.getByRole("button", { name: "复制报价给客人" }));
    expect(aside).toContainElement(screen.getByRole("button", { name: "下载 PDF 报价单" }));
    expect(screen.getAllByTestId("labor-discount")).toHaveLength(2);
  });

  it("at the list labor price there is no discount line", () => {
    render(<QuoteSheetSummary quotes={[front, rear]} tier="retail" />);
    expect(screen.queryByTestId("labor-discount-total")).toBeNull();
    expect(screen.getByTestId("quote-sheet-total").closest("aside")).toHaveTextContent("$360.00");
  });
});

describe("the customer estimate", () => {
  const sheet = (discount: boolean): SheetPdf => ({
    rows: [
      { label: "Brake Rotor R&R – Front", amount: discount ? 440 : 480, labor: { hours: 2, list: 240, charged: discount ? 200 : 240 } },
      { label: "Brake Rotor R&R – Rear", amount: discount ? 320 : 340, labor: { hours: 1, list: 120, charged: discount ? 100 : 120 } },
    ],
    total: discount ? 760 : 820,
  });
  const page = (s: SheetPdf) => buildQuotePage(withFinalPrices(front), new Date("2026-11-16T20:00:00Z"), "/x.png", s);

  it("shows the regular price struck through before the new total, with what was saved", () => {
    const root = page(sheet(true));
    const text = root.textContent ?? "";
    const regular = taxOn(760 + 60).total.toFixed(2);
    const now = taxOn(760).total.toFixed(2);
    expect(text).toContain("REGULAR PRICE");
    expect(text).toContain(`$${regular}`);
    expect(text).toContain("YOUR PRICE");
    expect(text).toContain(`$${now}`);
    expect(text).toContain("You save on labor (");
    expect(text).toContain(`$${(taxOn(820).total - taxOn(760).total).toFixed(2)}`);
    // The regular price comes first, left of the new one, and carries a slash element.
    expect(text.indexOf("REGULAR PRICE")).toBeLessThan(text.indexOf("YOUR PRICE"));
    const slashes = [...root.querySelectorAll<HTMLElement>("div")].filter((d) => d.style.transform === "rotate(-9deg)");
    expect(slashes).toHaveLength(1);
  });

  it("shows just the total when nothing was discounted", () => {
    const text = page(sheet(false)).textContent ?? "";
    expect(text).not.toContain("REGULAR PRICE");
    expect(text).toContain("TOTAL INCLUDING TAX");
    expect(text).toContain(`$${taxOn(820).total.toFixed(2)}`);
  });

  it("carries the large logo, the shop line and the contact details", () => {
    const root = page(sheet(true));
    const logo = root.querySelector("img")!;
    expect(logo.getAttribute("src")).toBe("/x.png");
    expect(logo.style.width).toBe("250px");
    expect(root.textContent).toContain("Repair Estimate");
    expect(root.textContent).toContain("WhatsApp");
  });
});
