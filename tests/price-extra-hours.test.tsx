import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PriceChoiceCard } from "@/components/workbench/QuoteSheetSummary";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { priceTierNote } from "@/lib/workbench/assistant";
import { ConversationStore, newTurnId } from "@/lib/workbench/conversations";
import { handleConversation } from "@/lib/workbench/conversations-http";
import type { Turn } from "@/lib/workbench/conversation-types";
import { memoryKv } from "@/lib/workbench/kv";
import { atTier, laborWithExtra, snapPricing, TIER_LABEL, tierLabor, tierMarkup, totalAt } from "@/lib/workbench/price-tier";
import { buildLaborQuote } from "@/lib/workbench/quote";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-16: the prices were renamed (原价, 原价+8折人工, 基础价+8折人工), a fourth one was added
// (成本价+8折人工: parts at purchase cost, labor at $96/h) and the labor hours can be extended by 0-100% in 10% steps.

const env = {} as NodeJS.ProcessEnv;
const part: StaffPartOption = { description: "Brake Disc", series: "", listPrice: 200, quantity: 2, inStockLocally: true, note: "", prices: { unitPrice: 80 }, partNumber: "P-1", brand: "ACME", availability: "", qtyAvailable: 3, fields: {} };
// parts: list 400, cost 160; labor 1.5 h: $180 walk-in, $144 referral
const q = buildLaborQuote("2019 Toyota Camry", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 1.5, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [part] }, "W-1", env);
const o = q.options[0];

describe("the cost price and extra labor hours", () => {
  it("names the four prices", () => {
    expect([TIER_LABEL.retail, TIER_LABEL.referral, TIER_LABEL.friend, TIER_LABEL.cost]).toEqual(["原价", "原价+8折人工", "基础价+8折人工", "成本价+8折人工"]);
  });

  it("cost price: parts at purchase cost, labor at $96/h, so no markup on the parts", () => {
    expect(totalAt(q, o, "cost")).toBe(160 + 144);
    expect(tierLabor(q, "cost")).toBe(144);
    expect(tierMarkup(q, o, "cost")).toBe(0);
    expect(atTier(q, "cost").options[0].customerTotal).toBe(304);
  });

  it("extra hours are added to the labor of any price", () => {
    expect(totalAt(q, o, "retail", { partsPct: 100, laborRate: 120, laborExtraPct: 50 })).toBe(o.customerTotal + 90);
    expect(tierLabor(q, "retail", { partsPct: 100, laborRate: 120, laborExtraPct: 50 })).toBe(270);
    expect(totalAt(q, o, "referral", { partsPct: 100, laborRate: 96, laborExtraPct: 30 })).toBe(587.2);
    expect(totalAt(q, o, "cost", { partsPct: 0, laborRate: 96, laborExtraPct: 100 })).toBe(160 + 288);
    expect(totalAt(q, o, "custom", { partsPct: 50, laborRate: 90, laborExtraPct: 20 })).toBe(280 + 162);
    expect(tierMarkup(q, o, "retail", { partsPct: 100, laborRate: 120, laborExtraPct: 50 })).toBe(240);
    expect(atTier(q, "retail", { partsPct: 100, laborRate: 120 })).toBe(q);
    expect(atTier(q, "retail", { partsPct: 100, laborRate: 120, laborExtraPct: 10 }).options[0].customerTotal).toBe(o.customerTotal + 18);
    expect(laborWithExtra(q.labor!, { partsPct: 100, laborRate: 120, laborExtraPct: 20 })).toEqual({ hours: 1.8, list: 216 });
  });

  it("snaps the extra hours to 10% steps up to 100% and leaves them out at 0", () => {
    expect(snapPricing({ partsPct: 100, laborRate: 120, laborExtraPct: 47 })).toEqual({ partsPct: 100, laborRate: 120, laborExtraPct: 50 });
    expect(snapPricing({ partsPct: 100, laborRate: 120, laborExtraPct: 150 })).toEqual({ partsPct: 100, laborRate: 120, laborExtraPct: 100 });
    expect(snapPricing({ partsPct: 100, laborRate: 120, laborExtraPct: -5 })).toEqual({ partsPct: 100, laborRate: 120 });
    expect(snapPricing({ partsPct: 100, laborRate: 120 })).toEqual({ partsPct: 100, laborRate: 120 });
  });

  it("the card names the price and the extra hours", () => {
    render(<StaffQuoteCard quote={q} tier="cost" custom={{ partsPct: 0, laborRate: 96, laborExtraPct: 20 }} />);
    expect(screen.getByTestId("quote-tier")).toHaveTextContent("按成本价+8折人工（工时加时 20%）");
  });

  it("tells the assistant about the cost price and the extra hours", () => {
    expect(priceTierNote("cost")).toContain("成本价+8折人工");
    expect(priceTierNote("referral", { partsPct: 100, laborRate: 96, laborExtraPct: 20 })).toContain("20% extra labor hours");
  });
});

describe("the choice card", () => {
  it("has the cost price as a fourth button, and its sliders sit at cost and $96", async () => {
    const onChoose = vi.fn();
    render(<PriceChoiceCard onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("button", { name: /^成本价\+8折人工/ }));
    expect(screen.getByTestId("parts-value")).toHaveTextContent("0%");
    expect(screen.getByTestId("labor-value")).toHaveTextContent("$96/h");
    await userEvent.click(screen.getByTestId("price-confirm"));
    expect(onChoose).toHaveBeenCalledWith({ tier: "cost" });
  });

  it("the extra-hours slider goes 0-100% in 10% steps and rides along with a quick price", async () => {
    const onChoose = vi.fn();
    render(<PriceChoiceCard onChoose={onChoose} />);
    const slider = screen.getByTestId("extra-slider");
    expect(slider).toHaveAttribute("step", "10");
    expect(slider).toHaveAttribute("max", "100");
    expect(screen.getByTestId("extra-value")).toHaveTextContent("不加时");
    fireEvent.change(slider, { target: { value: "30" } });
    expect(screen.getByTestId("extra-value")).toHaveTextContent("+30%");
    await userEvent.click(screen.getByRole("button", { name: /^原价\+8折人工/ }));
    // The quick price keeps the extra hours that were already chosen.
    expect(screen.getByTestId("extra-value")).toHaveTextContent("+30%");
    await userEvent.click(screen.getByTestId("price-confirm"));
    expect(onChoose).toHaveBeenCalledWith({ tier: "referral", pricing: { partsPct: 100, laborRate: 96, laborExtraPct: 30 } });
  });

  it("after a price is chosen, moving the extra slider re-prices at once, and a saved value moves it", () => {
    const onAdjust = vi.fn();
    const { rerender } = render(<PriceChoiceCard current="retail" onChoose={() => {}} onAdjust={onAdjust} />);
    fireEvent.change(screen.getByTestId("extra-slider"), { target: { value: "50" } });
    expect(onAdjust).toHaveBeenCalledWith({ tier: "retail", pricing: { partsPct: 100, laborRate: 120, laborExtraPct: 50 } });
    rerender(<PriceChoiceCard current="cost" currentPricing={{ partsPct: 0, laborRate: 96, laborExtraPct: 80 }} onChoose={() => {}} onAdjust={onAdjust} />);
    expect(screen.getByTestId("extra-value")).toHaveTextContent("+80%");
    expect(screen.getByText(/现在按成本价\+8折人工，工时加时 80%/)).toBeInTheDocument();
  });
});

describe("saving the extra hours", () => {
  const turn = (role: "user" | "assistant", text: string): Turn => ({ id: newTurnId(), role, text, author: role === "user" ? "kevin@x" : "assistant", at: Date.now(), quotes: [] });
  const patch = (store: ConversationStore, body: unknown) =>
    handleConversation(new Request("https://repair.speedxrental.com/api/workbench/conversations/cabc1234", { method: "PATCH", body: JSON.stringify(body) }), "cabc1234", { user: async () => ({ email: "kevin@x" }), store: () => store, log: () => {} });

  it("a quick price keeps only the extra hours; none means nothing is stored; the cost price is accepted", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cabc1234", "kevin@x", [turn("user", "q"), turn("assistant", "按哪个价报？")], undefined, "x");
    expect((await patch(store, { priceTier: "cost", pricing: { partsPct: 0, laborRate: 96, laborExtraPct: 33 } })).status).toBe(200);
    expect(await store.get("cabc1234")).toMatchObject({ priceTier: "cost", pricing: { partsPct: 0, laborRate: 96, laborExtraPct: 30 } });
    expect((await patch(store, { priceTier: "cost" })).status).toBe(200);
    expect((await store.get("cabc1234"))?.pricing).toBeUndefined();
    expect((await patch(store, { priceTier: "referral", pricing: { partsPct: 100, laborRate: 96 } })).status).toBe(200);
    expect((await store.get("cabc1234"))?.pricing).toBeUndefined();
  });
});
