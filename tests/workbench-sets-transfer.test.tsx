import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuoteSheetSummary } from "@/components/workbench/QuoteSheetSummary";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { WORKBENCH_PROMPT } from "@/lib/workbench/assistant";
import { buildLaborQuote, etaLabel, summarizeStaffQuote } from "@/lib/workbench/quote";
import { forBothSides, pairSides, staffPartQuotes, type StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-14 (2021 Cayenne GTS, front + rear rotors at the friend price):
// left and right rotors are different part numbers and both are needed; parts
// not in local stock are quoted as ordered in; a job with no price can still go out.

const env = {} as NodeJS.ProcessEnv;

const rotorQuote = (partNumber: string, side: "Front Left" | "Front Right", availability = "Monday-local", qty = 3) => ({
  appID: partNumber,
  partDescription: "Brake Disc, Lightweight Pin Drive Design",
  manufacturerPart: partNumber,
  brandName: "Lightweight Pin Drive Design",
  listPrice: 484.5,
  unitPrice: 342.54,
  availability,
  qtyAvailable: qty,
  position: { id: 30, description: side },
});

const pna = (quotes: Array<Record<string, unknown>>) => ({ applications: quotes.map((q) => ({ appID: String(q.appID), qtyPerCar: 1 })), quotes: [{ productQuotes: quotes }] });

const job = (parts: StaffPartOption[], position = "Front", hours = 0.8) => ({
  serviceName: "Brake Rotor R&R",
  position,
  laborHours: hours,
  laborNote: "",
  primaryPartName: "Brake Disc",
  otherPartNames: [],
  partsNote: "",
  partOptions: parts,
});

describe("left and right part numbers", () => {
  it("become one left + right set with both prices and one labor charge", () => {
    const parts = pairSides(staffPartQuotes(pna([rotorQuote("PFL47533", "Front Left"), rotorQuote("PFR47534", "Front Right")]), 30, "Front"));
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ partNumber: "PFL47533 + PFR47534", listPrice: 969, partCount: 2, inStockLocally: true });
    expect(parts[0].prices.unitPrice).toBe(685.08);
    const quote = buildLaborQuote("2021 Porsche Cayenne GTS", job(parts), "W-1", env);
    // Friend: cost 685.08 + $100 per part number × 2 + labor 0.8 h × $96.
    expect(quote.options[0].friendTotal).toBe(961.88);
    expect(quote.options[0].customerTotal).toBe(969 + 96);
  });

  it("are paired on both-sides jobs instead of doubling one side", () => {
    const left = { description: "Strut Assembly Left", series: "", listPrice: 300, quantity: 1, inStockLocally: true, note: "", side: "L" as const };
    const right = { ...left, description: "Strut Assembly Right", side: "R" as const };
    const plain = { ...left, description: "Strut Mount", side: undefined, listPrice: 40 };
    const doubled = forBothSides({ laborHours: 1.6, laborNote: "", position: "Front", partOptions: [left, right, plain] });
    expect(doubled.partOptions.map((p) => [p.description, p.quantity, p.listPrice])).toEqual([
      ["Strut Mount", 2, 40],
      ["Strut Assembly (left + right set)", 1, 600],
    ]);
  });
});

describe("parts not in local stock", () => {
  it("are quoted as ordered in, with the day they arrive, only when nothing is local", () => {
    const parts = pairSides(staffPartQuotes(pna([rotorQuote("PRL1", "Front Left", "Wednesday", 0), rotorQuote("PRR2", "Front Right", "Wednesday", 0)]), 30, "Front"));
    const quote = buildLaborQuote("Car", job(parts, "Rear"), "W-2", env);
    expect(quote.options[0]).toMatchObject({ eta: "周三到" });
    expect(quote.options[0].outOfStock).toBeUndefined();
    expect(summarizeStaffQuote(quote)).toContain("ordered in, 周三到");
    render(<StaffQuoteCard quote={quote} tier="friend" />);
    expect(screen.getByTestId("eta")).toHaveTextContent("本地没货，调货 · 周三到");
  });

  it("aren't offered next to a local one", () => {
    const local = staffPartQuotes(pna([rotorQuote("A1", "Front Left")]), 30, "Front")[0];
    const later = { ...local, partNumber: "B2", listPrice: 300, inStockLocally: false, availability: "Wednesday" };
    const quote = buildLaborQuote("Car", job([local, later]), "W-3", env);
    expect(quote.options.map((o) => Boolean(o.outOfStock))).toEqual([false, true]);
  });

  it("reads WorldPac's availability", () => {
    expect(etaLabel("tomorrow")).toBe("明天到");
    expect(etaLabel("Friday-local")).toBe("周五到");
    expect(etaLabel("2-3 days")).toBe("约 2–3 天到");
    expect(etaLabel("2-day")).toBe("约 2 天到");
    expect(etaLabel("notAvailable")).toBeNull();
  });
});

describe("the quote sheet", () => {
  const front = () =>
    buildLaborQuote("2021 Porsche Cayenne GTS", job(pairSides(staffPartQuotes(pna([rotorQuote("PFL47533", "Front Left"), rotorQuote("PFR47534", "Front Right")]), 30, "Front"))), "W-F", env);
  const rearNone = () => {
    const none = { ...staffPartQuotes(pna([rotorQuote("X", "Front Left")]), 30, "Front")[0], inStockLocally: false, availability: "notAvailable" };
    return buildLaborQuote("2021 Porsche Cayenne GTS", job([none], "Rear"), "W-R", env);
  };

  it("adds both front rotors and sends the rear as 待补价", async () => {
    const writeText = vi.fn(async (text: string) => void text);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<QuoteSheetSummary quotes={[front(), rearNone()]} tier="friend" />);
    expect(screen.getByTestId("quote-sheet-total")).toHaveTextContent("已报价合计 $961.88");
    expect(screen.getByText(/待补价（WorldPac 本地和调货都没有/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载 PDF 报价单" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "复制报价给客人" }));
    const text = writeText.mock.calls[0][0];
    expect(text).toContain("$961.88");
    expect(text).toContain("Brake Rotor R&R · Rear：待补价");
    expect(text).toContain("已报价部分合计：$961.88");
    expect(text).not.toMatch(/PFL|PFR|342/);
  });
});

describe("the workbench AI", () => {
  it("writes for a beginner and repeats the sheet's numbers", () => {
    expect(WORKBENCH_PROMPT).toContain("even a beginner should be able to quote");
    expect(WORKBENCH_PROMPT).toContain("Never add up totals yourself");
    expect(WORKBENCH_PROMPT).toMatch(/Don't mention cost, profit, margin, markup, stock counts or part numbers unless staff ask/);
  });
});
