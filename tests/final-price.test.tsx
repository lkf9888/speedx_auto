import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const made: Array<{ id: string; totals: number[] }> = [];
vi.mock("@/lib/workbench/quote-pdf", async (original) => ({
  ...(await original<typeof import("@/lib/workbench/quote-pdf")>()),
  quotePdf: vi.fn(async (quote: { id: string; options: Array<{ customerTotal: number }> }) => {
    made.push({ id: quote.id, totals: quote.options.map((o) => o.customerTotal) });
    return new File(["%PDF"], `SPEEDX-Estimate-${quote.id}.pdf`, { type: "application/pdf" });
  }),
  downloadFile: vi.fn(),
}));

import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { finalCustomerText, readFinalTotals, withFinalPrices } from "@/lib/workbench/final-price";
import { buildQuotePage } from "@/lib/workbench/quote-pdf";
import { toEnglish } from "@/lib/workbench/pdf-english";
import { buildTireQuote, type StaffQuote } from "@/lib/workbench/quote";
import { ConversationStore, newTurnId } from "@/lib/workbench/conversations";
import { handleConversation } from "@/lib/workbench/conversations-http";
import { historyFromTurns } from "@/lib/workbench/http";
import { memoryKv } from "@/lib/workbench/kv";
import { ASSISTANT } from "@/lib/workbench/conversation-types";

function tireQuote(): StaffQuote {
  const option = (brand: string, retail: number, cost: number) => ({ brand, pattern: "W1", size: "225/65R17", load: "102H", season: "winter", retail, eco: 6.5, mounting: 25, cost, sku: `SKU-${brand}` });
  return buildTireQuote("2019 Toyota RAV4", "225/65R17", [option("Lanvigator", 114, 87.7), option("Delinte", 130, 100)], 4, "W-TEST1", new Date("2026-10-15T12:00:00Z"));
}

describe("final prices", () => {
  it("keeps only real amounts for options that exist", () => {
    expect(readFinalTotals({ 0: "520", 1: -3, 5: 100, x: 1 }, 2)).toEqual({ "0": 520 });
    expect(readFinalTotals({ 0: "abc" }, 2)).toBeNull();
    expect(readFinalTotals(null, 2)).toBeNull();
  });

  it("moves the per-tire price, profit and margin with the agreed total", () => {
    const quote = { ...tireQuote(), final: { totals: { "0": 520 }, by: "kevin@speedx.ca", at: 1 } };
    const [first, second] = withFinalPrices(quote).options;
    expect(first).toMatchObject({ customerTotal: 520, unitPrice: 130, originalTotal: 584 });
    expect(first.profit).toBeCloseTo(520 - (87.7 + 6.5) * 4, 2);
    expect(second.originalTotal).toBeNull();
    const text = finalCustomerText(quote);
    expect(text).toContain("每条 $130.00 × 4：$520.00");
    expect(text).not.toContain("584");
  });
});

describe("saving final prices", () => {
  async function storeWithQuote() {
    const store = new ConversationStore(memoryKv());
    const quote = tireQuote();
    await store.append("cquote1", "amy@speedx.ca", [
      { id: newTurnId(), role: "user", text: "RAV4 冬季胎", author: "amy@speedx.ca", at: 1, quotes: [] },
      { id: newTurnId(), role: "assistant", text: "这是报价", author: ASSISTANT, at: 2, quotes: [quote] },
    ]);
    return { store, quote };
  }
  const deps = (store: ConversationStore) => ({ user: async () => ({ email: "kevin@speedx.ca" }), store: () => store, log: vi.fn() });
  const patch = (body: unknown) => new Request("https://repair.speedxrental.com/api/workbench/conversations/cquote1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("saves them for everyone with who set them, updates the customer text, and can put the assistant's back", async () => {
    const { store, quote } = await storeWithQuote();
    const response = await handleConversation(patch({ card: { kind: "quote", itemId: quote.id, totals: { 0: 500 } } }), "cquote1", deps(store));
    expect(response.status).toBe(200);
    const saved = (await store.get("cquote1"))!.turns[1].quotes[0];
    expect(saved.final).toMatchObject({ totals: { "0": 500 }, by: "kevin@speedx.ca" });
    expect(saved.customerText).toContain("$500.00");
    // The assistant is told to use the agreed price from now on.
    expect(historyFromTurns((await store.get("cquote1"))!.turns)[1].text).toContain("改成了最终价：Lanvigator W1 225/65R17 102H $500（原 $584）");

    await handleConversation(patch({ card: { kind: "quote", itemId: quote.id, totals: null } }), "cquote1", deps(store));
    const restored = (await store.get("cquote1"))!.turns[1].quotes[0];
    expect(restored.final).toBeUndefined();
    expect(restored.customerText).toContain("$584.00");
  });

  it("refuses prices that aren't numbers and quotes that aren't there", async () => {
    const { store, quote } = await storeWithQuote();
    expect((await handleConversation(patch({ card: { kind: "quote", itemId: quote.id, totals: { 0: "lots" } } }), "cquote1", deps(store))).status).toBe(400);
    expect((await handleConversation(patch({ card: { kind: "quote", itemId: "W-NOPE", totals: { 0: 1 } } }), "cquote1", deps(store))).status).toBe(404);
  });
});

describe("quote card", () => {
  it("lets staff type the agreed prices and save them", async () => {
    const onSaveFinal = vi.fn(async () => true);
    render(<StaffQuoteCard quote={tireQuote()} onSaveFinal={onSaveFinal} />);
    await userEvent.click(screen.getByRole("button", { name: "✎ 改价" }));
    const input = screen.getByRole("spinbutton", { name: /最终价 Lanvigator/ });
    await userEvent.clear(input);
    await userEvent.type(input, "520");
    // The margin follows what's typed, before saving.
    expect(screen.getByText("$584.00", { selector: ".line-through" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "保存最终价" }));
    expect(onSaveFinal).toHaveBeenCalledWith({ "0": 520, "1": 648 });
    expect(await screen.findByText(/最终价已保存/)).toBeInTheDocument();
  });

  it("shows agreed prices with the assistant's struck through, and copies and makes the PDF at those prices", async () => {
    const quote = { ...tireQuote(), final: { totals: { "0": 520 }, by: "kevin@speedx.ca", at: 1 } };
    const writeText = vi.fn(async (text: string) => void text);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<StaffQuoteCard quote={quote} onSaveFinal={async () => true} />);
    expect(screen.getByTestId("final-badge")).toHaveTextContent("最终价 · kevin 修改");
    await userEvent.click(screen.getByRole("button", { name: "复制客户报价" }));
    expect(writeText.mock.calls[0][0]).toContain("$520.00");
    // Only the ticked option goes in the PDF.
    await userEvent.click(screen.getByRole("checkbox", { name: /Delinte/ }));
    await userEvent.click(screen.getByRole("button", { name: "下载 PDF 报价单" }));
    expect(await screen.findByText(/已下载 SPEEDX-Estimate-W-TEST1\.pdf/)).toBeInTheDocument();
    expect(made.at(-1)).toEqual({ id: "W-TEST1", totals: [520] });
  });
});

describe("PDF page", () => {
  it("is in English only, with the shop, the quote and customer prices only", () => {
    const quote = withFinalPrices({ ...tireQuote(), final: { totals: { "0": 520 }, by: "kevin@speedx.ca", at: 1 } });
    const page = buildQuotePage(quote, new Date("2026-10-15T20:00:00Z"));
    const text = page.textContent ?? "";
    expect(text).toContain("SPEEDX AUTO");
    expect(text).toContain("2980 Number 3 Rd");
    expect(text).toContain("Repair Estimate");
    expect(text).toContain("W-TEST1");
    expect(text).toContain("2026-10-15");
    expect(text).toContain("2019 Toyota RAV4");
    expect(text).toContain("New tires, installed · 225/65R17");
    expect(text).toContain("$520.00");
    expect(text).toContain("$130.00");
    expect(text).toContain("choose one");
    expect(text).not.toMatch(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/);
    // Nothing staff-only.
    expect(text).not.toMatch(/87\.7|SKU-|winter|cost|margin/i);
  });
});

describe("English for PDFs", () => {
  it.each([
    ["新轮胎（含安装）· 225/65R17", "New tires, installed · 225/65R17"],
    ["换机油", "Oil change"],
    ["普通轿车 / 小 SUV", "Car / small SUV"],
    ["Michelin X-ICE NORTH 4 (带钉) 225/65R17 106T XL · 现货", "Michelin X-ICE NORTH 4 (studded) 225/65R17 106T XL · in stock"],
    ["换胎（客人自带轮胎）", "Tire change (customer's own tires)"],
    ["普通胎（18 寸及以下）", 'Standard tire, up to 18"'],
    ["Front，左右两边", "Front, both sides"],
    ["Brake Pads R&R", "Brake Pads R&R"],
    ["刹车片 Brake pads", "Brake pads"],
  ])("%s", (chinese, english) => {
    expect(toEnglish(chinese)).toBe(english);
  });
});
