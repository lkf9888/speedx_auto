import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { PriceChoiceCard } from "@/components/workbench/QuoteSheetSummary";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { priceTierNote } from "@/lib/workbench/assistant";
import { ConversationStore, newTurnId } from "@/lib/workbench/conversations";
import { handleConversation } from "@/lib/workbench/conversations-http";
import type { Turn } from "@/lib/workbench/conversation-types";
import { memoryKv } from "@/lib/workbench/kv";
import { atTier, customTotal, snapPricing, tierLabor, tierMarkup } from "@/lib/workbench/price-tier";
import { buildLaborQuote, buildPartsQuote } from "@/lib/workbench/quote";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-15: two sliders under the price choice. Parts: 0% = cost,
// 100% = suggested retail, 5% steps. Labor: $60 to $120, $5 steps. The three
// quick prices are positions on them; nothing goes on until confirm.

const env = {} as NodeJS.ProcessEnv;
const part = (listPrice: number, cost: number | null, quantity = 1): StaffPartOption => ({
  description: "Brake Disc",
  series: "",
  listPrice,
  quantity,
  inStockLocally: true,
  note: "",
  prices: cost === null ? {} : { unitPrice: cost },
  partNumber: "P-1",
  brand: "ACME",
  availability: "",
  qtyAvailable: 3,
  fields: {},
});
const quote = (parts: StaffPartOption[], hours = 1.5) =>
  buildLaborQuote("2019 Toyota Camry", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: hours, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: parts }, "W-1", env);

describe("slider prices", () => {
  it("parts run from cost (0%) to suggested retail (100%) and labor is hours × the chosen rate", () => {
    const q = quote([part(200, 80, 2)]); // list 400, cost 160
    const o = q.options[0];
    expect(customTotal(q, o, { partsPct: 0, laborRate: 60 })).toBe(160 + 90);
    expect(customTotal(q, o, { partsPct: 100, laborRate: 120 })).toBe(o.customerTotal);
    expect(customTotal(q, o, { partsPct: 50, laborRate: 90 })).toBe(280 + 135);
  });

  it("the retail quick price sits at 100% and $120; the options without a cost keep the retail parts price", () => {
    const q = quote([part(200, null)]);
    expect(customTotal(q, q.options[0], { partsPct: 0, laborRate: 120 })).toBe(q.options[0].customerTotal);
  });

  it("shows the custom totals, labor and markup on the card", () => {
    const q = quote([part(200, 80, 2)]);
    const custom = { partsPct: 50, laborRate: 90 };
    expect(atTier(q, "custom", custom).options[0].customerTotal).toBe(415);
    expect(atTier(q, "custom", null)).toBe(q); // no sliders saved: retail
    expect(tierLabor(q, "custom", custom)).toBe(135);
    expect(tierMarkup(q, q.options[0], "custom", custom)).toBe(120);
    render(<StaffQuoteCard quote={q} tier="custom" custom={custom} />);
    expect(screen.getByTestId("quote-tier")).toHaveTextContent("自定义价（零件 50% · 工时 $90/h）");
    expect(screen.getByText("$415.00")).toBeInTheDocument();
  });

  it("applies to tires between cost and retail, keeping the eco fee and mounting", () => {
    const q = {
      ...quote([]),
      kind: "tires" as const,
      labor: null,
      options: [{ ...quote([part(100, 80)]).options[0], unitPrice: 130, unitCost: 80, quantity: 4, prices: { eco: 6, mounting: 24 }, customerTotal: 520 }],
    };
    expect(customTotal(q, q.options[0], { partsPct: 100, laborRate: 120 })).toBe(520);
    expect(customTotal(q, q.options[0], { partsPct: 0, laborRate: 120 })).toBe((80 + 30) * 4);
  });

  it("a parts-only quote (no labor) still follows the parts slider", () => {
    const q = buildPartsQuote("2019 Toyota Camry", "Brake Disc", "Front", [part(4000, 2500)], "P-1", env);
    expect(atTier(q, "custom", { partsPct: 0, laborRate: 90 }).options[0].customerTotal).toBe(2500);
    expect(atTier(q, "custom", { partsPct: 100, laborRate: 90 }).options[0].customerTotal).toBe(4000);
  });

  it("snaps values onto the 5% and $5 grids and refuses nonsense", () => {
    expect(snapPricing({ partsPct: 47, laborRate: 96 })).toEqual({ partsPct: 45, laborRate: 96 });
    expect(snapPricing({ partsPct: 400, laborRate: 10 })).toEqual({ partsPct: 100, laborRate: 60 });
    expect(snapPricing({ partsPct: "50", laborRate: 90 })).toBeNull();
    expect(snapPricing(null)).toBeNull();
  });

  it("tells the model the card shows the custom totals", () => {
    expect(priceTierNote("custom", { partsPct: 55, laborRate: 90 })).toMatch(/parts 55%.*labor \$90\/h.*card/);
    expect(priceTierNote("custom", null)).toMatch(/call ask_price_tier/);
  });
});

describe("choice card with sliders", () => {
  it("starts on the retail position; a quick button moves both sliders; confirm sends it", async () => {
    const onChoose = vi.fn();
    render(<PriceChoiceCard onChoose={onChoose} />);
    expect(screen.getByTestId("parts-value")).toHaveTextContent("100%");
    expect(screen.getByTestId("labor-value")).toHaveTextContent("$120/h");
    await userEvent.click(screen.getByRole("button", { name: /^推荐价/ }));
    expect(screen.getByTestId("labor-value")).toHaveTextContent("$96/h");
    await userEvent.click(screen.getByTestId("price-confirm"));
    expect(onChoose).toHaveBeenCalledWith({ tier: "referral" });
  });

  it("moving a slider turns the choice into a custom price, sent only on confirm", () => {
    const onChoose = vi.fn();
    render(<PriceChoiceCard onChoose={onChoose} />);
    fireEvent.change(screen.getByTestId("parts-slider"), { target: { value: "55" } });
    fireEvent.change(screen.getByTestId("labor-slider"), { target: { value: "90" } });
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^零售价/ })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("price-confirm"));
    expect(onChoose).toHaveBeenCalledWith({ tier: "custom", pricing: { partsPct: 55, laborRate: 90 } });
  });

  it("friend price keeps its own rule and shows it instead of a percentage", async () => {
    render(<PriceChoiceCard onChoose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /^朋友价/ }));
    expect(screen.getByTestId("parts-value")).toHaveTextContent("进价 + $100/零件号");
  });

  it("opens on the saved custom position", () => {
    render(<PriceChoiceCard current="custom" currentPricing={{ partsPct: 30, laborRate: 80 }} onChoose={() => {}} />);
    expect(screen.getByTestId("parts-value")).toHaveTextContent("30%");
    expect(screen.getByTestId("labor-value")).toHaveTextContent("$80/h");
    expect(screen.getByText(/现在按自定义价：零件 30% · 工时 \$80\/h/)).toBeInTheDocument();
  });
});

describe("saving the sliders", () => {
  const turn = (role: "user" | "assistant", text: string): Turn => ({ id: newTurnId(), role, text, author: role === "user" ? "kevin@x" : "assistant", at: Date.now(), quotes: [] });
  const patch = (store: ConversationStore, body: unknown) =>
    handleConversation(new Request("https://repair.speedxrental.com/api/workbench/conversations/cabc1234", { method: "PATCH", body: JSON.stringify(body) }), "cabc1234", {
      user: async () => ({ email: "kevin@x" }),
      store: () => store,
      log: () => {},
    });

  it("keeps the snapped positions on the conversation, and drops them for a quick price", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cabc1234", "kevin@x", [turn("user", "q"), turn("assistant", "按哪个价报？")], undefined, "x");
    expect((await patch(store, { priceTier: "custom", pricing: { partsPct: 47, laborRate: 96 } })).status).toBe(200);
    expect(await store.get("cabc1234")).toMatchObject({ priceTier: "custom", pricing: { partsPct: 45, laborRate: 96 } });
    expect((await patch(store, { priceTier: "friend" })).status).toBe(200);
    expect((await store.get("cabc1234"))?.pricing).toBeUndefined();
  });

  it("refuses a custom price without sliders", async () => {
    const store = new ConversationStore(memoryKv());
    await store.append("cabc1234", "kevin@x", [turn("user", "q"), turn("assistant", "按哪个价报？")], undefined, "x");
    expect((await patch(store, { priceTier: "custom" })).status).toBe(400);
    expect((await patch(store, { priceTier: "custom", pricing: { partsPct: "x", laborRate: 90 } })).status).toBe(400);
    expect((await store.get("cabc1234"))?.priceTier).toBeUndefined();
  });
});

// Kevin, 2026-11-16: labor moves in $1 steps; after a price is confirmed the
// sliders stay live and re-price the quotes without asking the assistant again.
describe("live sliders after confirm", () => {
  it("moves labor in $1 steps", () => {
    render(<PriceChoiceCard onChoose={() => {}} />);
    expect(screen.getByTestId("labor-slider")).toHaveAttribute("step", "1");
  });

  it("before the first confirm a move changes nothing outside the card", () => {
    const onAdjust = vi.fn();
    render(<PriceChoiceCard onChoose={() => {}} onAdjust={onAdjust} />);
    fireEvent.change(screen.getByTestId("labor-slider"), { target: { value: "97" } });
    expect(onAdjust).not.toHaveBeenCalled();
  });

  it("after a price is chosen each move is applied at once", () => {
    const onAdjust = vi.fn();
    const onChoose = vi.fn();
    render(<PriceChoiceCard current="retail" onChoose={onChoose} onAdjust={onAdjust} />);
    fireEvent.change(screen.getByTestId("labor-slider"), { target: { value: "97" } });
    expect(onAdjust).toHaveBeenLastCalledWith({ tier: "custom", pricing: { partsPct: 100, laborRate: 97 } });
    fireEvent.change(screen.getByTestId("parts-slider"), { target: { value: "40" } });
    expect(onAdjust).toHaveBeenLastCalledWith({ tier: "custom", pricing: { partsPct: 40, laborRate: 97 } });
    fireEvent.click(screen.getByRole("button", { name: "朋友价 WorldPac 零件进价 + $100（每个零件号），其他供货商进价 ×1.3，工时 $96/h" }));
    expect(onAdjust).toHaveBeenLastCalledWith({ tier: "friend" });
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.getByTestId("price-live")).toBeInTheDocument();
  });

  it("follows a price saved elsewhere, so the next move keeps the other slider", () => {
    const onAdjust = vi.fn();
    const { rerender } = render(<PriceChoiceCard current="retail" onChoose={() => {}} onAdjust={onAdjust} />);
    rerender(<PriceChoiceCard current="custom" currentPricing={{ partsPct: 40, laborRate: 80 }} onChoose={() => {}} onAdjust={onAdjust} />);
    fireEvent.change(screen.getByTestId("labor-slider"), { target: { value: "97" } });
    expect(onAdjust).toHaveBeenLastCalledWith({ tier: "custom", pricing: { partsPct: 40, laborRate: 97 } });
  });
});

describe("the assistants always leave one question", () => {
  it("both prompts say so", async () => {
    const { WORKBENCH_PROMPT } = await import("@/lib/workbench/assistant");
    const { SYSTEM_PROMPT } = await import("@/lib/repair-chat/prompt");
    for (const prompt of [WORKBENCH_PROMPT, SYSTEM_PROMPT]) {
      expect(prompt).toContain("End every reply with ONE short question");
      expect(prompt).toContain("When the request is vague");
    }
  });
});

// Kevin, 2026-11-16, after reading two weeks of real website chats.
describe("public assistant: fixes from the chat review", () => {
  it("asks one question, checks impossible engines, takes photos in chat", async () => {
    const { SYSTEM_PROMPT } = await import("@/lib/repair-chat/prompt");
    expect(SYSTEM_PROMPT).toContain("only ONE question per reply");
    expect(SYSTEM_PROMPT).not.toContain("a couple of questions at a time");
    expect(SYSTEM_PROMPT).toContain("The shop quotes new parts only");
    expect(SYSTEM_PROMPT).toContain("doesn't exist for that model and year");
    expect(SYSTEM_PROMPT).toContain("right here in this chat");
    expect(SYSTEM_PROMPT).toContain("Don't call request_team_quote again for the same vehicle and job");
    expect(SYSTEM_PROMPT).toContain("Don't state the minimum's own dollar amount");
  });
});

// Kevin, 2026-11-16, from a shared Cayenne chat: the sheet in the chat didn't say which supplier a part comes from,
// the typing line was generic, and the assistant only re-asked which option to use.
describe("supplier on the chat quote sheet and cards", () => {
  it("names the supplier for each kind of option", async () => {
    const { supplierLabel } = await import("@/lib/workbench/quote");
    const w = { supplier: "worldpac" as const };
    expect(supplierLabel(w, {})).toBe("WorldPac · 本地有货");
    expect(supplierLabel(w, { eta: "明天到" })).toBe("WorldPac · 调货");
    expect(supplierLabel(w, { source: "westcan" })).toBe("Westcan · Richmond 有货");
    expect(supplierLabel(w, { source: "lordco", eta: "明天到" })).toBe("Lordco · 其他分店调货");
    expect(supplierLabel({ supplier: "dt" }, {})).toBe("DT Tire Hub");
    expect(supplierLabel({ supplier: "shop" }, {})).toBe("店内一口价");
  });

  it("shows it on the staff card and the sheet but never in the customer copy", async () => {
    const { QuoteSheetSummary } = await import("@/components/workbench/QuoteSheetSummary");
    const quote = buildLaborQuote("2019 Toyota Camry", { serviceName: "Brake Rotor R&R", position: "Front", laborHours: 1, laborNote: "", primaryPartName: "Brake Disc", otherPartNames: [], partsNote: "", partOptions: [part(200, 100)] }, "W-1", env);
    render(<StaffQuoteCard quote={quote} tier="retail" />);
    expect(screen.getByTestId("supplier-badge")).toHaveTextContent("供应商：WorldPac · 本地有货");
    render(<QuoteSheetSummary quotes={[quote]} tier="retail" />);
    expect(screen.getByTestId("sheet-supplier")).toHaveTextContent("WorldPac · 本地有货");
    expect(quote.customerText).not.toMatch(/WorldPac|Westcan|Lordco/);
  });
});

describe("the typing line", () => {
  it("says what each lookup is doing", async () => {
    const { toolStatusDetail, WORKBENCH_PROFILE } = await import("@/lib/workbench/assistant");
    expect(toolStatusDetail("get_estimate")).toContain("WorldPac");
    expect(toolStatusDetail("find_tires", { size: "225/65R17" })).toContain("225/65R17");
    expect(toolStatusDetail("find_brand_tires")).toContain("DT Tire Hub");
    expect(toolStatusDetail("something_else")).toBeUndefined();
    expect(WORKBENCH_PROFILE.statusEvent("get_estimate", {}, "Westcan：没有可用零件")).toEqual({ type: "status", status: "estimate", detail: "Westcan：没有可用零件" });
  });

  it("the prompts ask for a question one step past the quote", async () => {
    const { WORKBENCH_PROMPT } = await import("@/lib/workbench/assistant");
    const { SYSTEM_PROMPT } = await import("@/lib/repair-chat/prompt");
    expect(WORKBENCH_PROMPT).toContain("Think one step past the quote");
    expect(WORKBENCH_PROMPT).toContain("pads");
    expect(SYSTEM_PROMPT).toContain("Think one step past the answer");
  });
});
