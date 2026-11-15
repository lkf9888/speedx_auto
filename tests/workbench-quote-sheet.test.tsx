import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PriceChoiceCard, QuoteSheetSummary } from "@/components/workbench/QuoteSheetSummary";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { priceTierNote, runWorkbenchTool, WORKBENCH_TOOLS } from "@/lib/workbench/assistant";
import { newTurnId, ConversationStore } from "@/lib/workbench/conversations";
import { handleConversation } from "@/lib/workbench/conversations-http";
import type { Turn } from "@/lib/workbench/conversation-types";
import { handleWorkbenchChat } from "@/lib/workbench/http";
import { memoryKv } from "@/lib/workbench/kv";
import { atTier, tierLabor, tierMarkup, tierTotal } from "@/lib/workbench/price-tier";
import { buildLaborQuote, buildTireQuote, summarizeStaffQuote } from "@/lib/workbench/quote";
import type { CatalogApi, StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-14: one price per conversation, chosen before the first
// quote; only parts in local stock; markup in dollars; several jobs on one sheet.

const env = {} as NodeJS.ProcessEnv;

function part(partNumber: string, listPrice: number, cost: number, local = true): StaffPartOption {
  return {
    description: `Rotor ${partNumber}`,
    series: "",
    listPrice,
    quantity: 1,
    inStockLocally: local,
    note: "",
    prices: { unitPrice: cost },
    partNumber,
    brand: "ACME",
    availability: local ? "tomorrow-local" : "regional",
    qtyAvailable: local ? 4 : 0,
    fields: {},
  };
}

const job = (service: string, position: string, parts: StaffPartOption[], hours = 1) => ({
  serviceName: service,
  position,
  laborHours: hours,
  laborNote: "",
  primaryPartName: "Rotor",
  otherPartNames: [],
  partsNote: "",
  partOptions: parts,
});

const front = () => buildLaborQuote("2019 Toyota Camry", job("Brake Rotor R&R", "Front", [part("F-1", 200, 90), part("F-2", 150, 70), part("F-3", 120, 50, false)]), "W-F", env);
const rear = () => buildLaborQuote("2019 Toyota Camry", job("Brake Rotor R&R", "Rear", [part("R-1", 180, 80)], 0.9), "W-R", env);

describe("price tiers", () => {
  it("picks each option's total and labor for the chosen price", () => {
    const q = front();
    expect(tierTotal(q.options[0], "retail")).toBe(320);
    expect(tierTotal(q.options[0], "referral")).toBe(296);
    expect(tierTotal(q.options[0], "friend")).toBe(90 + 100 + 96);
    expect([tierLabor(q, "retail"), tierLabor(q, "friend")]).toEqual([120, 96]);
  });

  it("shows markup in dollars: parts price minus cost, without labor", () => {
    const q = front();
    expect(tierMarkup(q, q.options[0], "retail")).toBe(110);
    expect(tierMarkup(q, q.options[0], "friend")).toBe(100);
    const tires = buildTireQuote("Car", "225/65R17", [{ brand: "A", pattern: "W", size: "225/65R17", load: "", season: "winter", retail: 130, eco: 6.5, mounting: 25, cost: 100 }], 4, "W-T");
    // 137 + 25 = 162 per tire; tire part = 162 − 6.5 − 25 = 130.5; markup 30.5 × 4.
    expect(tierMarkup(tires, tires.options[0], "retail")).toBe(122);
  });

  it("prices the customer copy at the chosen price", () => {
    expect(atTier(front(), "friend").options[0].customerTotal).toBe(286);
  });
});

describe("only parts in local stock", () => {
  it("flags WorldPac options not in a local warehouse and keeps them out of what the model reads", () => {
    const q = front();
    expect(q.options.map((o) => Boolean(o.outOfStock))).toEqual([false, false, true]);
    const summary = summarizeStaffQuote(q);
    expect(summary).not.toContain("F-3");
    expect(summary).toContain("1 more option not in stock locally");
  });

  it("says so when nothing is in stock", () => {
    const none = buildLaborQuote("Car", job("Brake Rotor R&R", "Front", [part("X-1", 120, 50, false)]), "W-N", env);
    expect(summarizeStaffQuote(none)).toContain("No option is in stock at a local WorldPac warehouse");
    render(<StaffQuoteCard quote={none} />);
    expect(screen.getByTestId("no-stock")).toHaveTextContent("WorldPac 本地仓库没有现货");
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("the quote card", () => {
  it("shows one price, cost and markup in dollars, and no stock, margin or extra price columns", () => {
    render(<StaffQuoteCard quote={front()} tier="referral" />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["选项", "数量", "零件售价", "进价", "加价", "推荐价（零件+工时）"]);
    expect(screen.queryByText(/F-3/)).toBeNull();
    expect(screen.getAllByTestId("surcharge").map((c) => c.textContent)).toEqual(["+$110.00", "+$80.00"]);
    expect(screen.getByTestId("labor-line")).toHaveTextContent("1 h × $96.00 = $96.00");
    expect(screen.getByText("$296.00")).toBeInTheDocument();
  });
});

describe("the combined quote sheet", () => {
  it("adds the cheapest in-stock option of each job, and follows the staff's pick", async () => {
    render(<QuoteSheetSummary quotes={[front(), rear()]} tier="retail" />);
    // Front: F-2 $150 + $120 labor = $270; rear: $180 + $108 = $288.
    expect(screen.getByTestId("quote-sheet-total")).toHaveTextContent("$558.00");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Front/ }), screen.getByRole("option", { name: /F-1/ }));
    expect(screen.getByTestId("quote-sheet-total")).toHaveTextContent("$608.00");
    expect(within(screen.getByTestId("quote-sheet")).queryByText(/F-3/)).toBeNull();
  });

  it("copies one customer text with the grand total and no cost", async () => {
    const writeText = vi.fn(async (text: string) => void text);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<QuoteSheetSummary quotes={[front(), rear()]} tier="friend" />);
    await userEvent.click(screen.getByRole("button", { name: "复制合并报价给客人" }));
    const text = writeText.mock.calls[0][0];
    // Friend: front F-2 cost 70 + 100 = 170, capped at its $150 list, + $96 = 246; rear 80 + 100 = 180 (= list) + 86.4 = 266.4.
    expect(text).toContain("合计：$512.40");
    expect(text).not.toMatch(/进价|cost/i);
  });
});

describe("choosing the price", () => {
  it("has tools to ask and to record it, and tells the model what's chosen", async () => {
    expect(WORKBENCH_TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(["ask_price_tier", "set_price_tier"]));
    const api = {} as CatalogApi;
    expect((await runWorkbenchTool(api, "ask_price_tier", {}, () => "W-1", null)).events).toEqual([{ type: "price_choice" }]);
    expect((await runWorkbenchTool(api, "set_price_tier", { tier: "friend" }, () => "W-1", null)).events).toEqual([{ type: "price_tier", tier: "friend" }]);
    expect((await runWorkbenchTool(api, "set_price_tier", { tier: "vip" }, () => "W-1", null)).isError).toBe(true);
    expect(priceTierNote(undefined)).toMatch(/call ask_price_tier before the first quote/);
    expect(priceTierNote("friend")).toContain("朋友价");
  });

  it("shows three buttons and reports the pick", async () => {
    const onChoose = vi.fn();
    render(<PriceChoiceCard onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("button", { name: /^朋友价/ }));
    expect(onChoose).toHaveBeenCalledWith("friend");
  });

  it("explains each price in the chat card and marks the one in use", () => {
    render(<PriceChoiceCard current="referral" onChoose={() => {}} />);
    expect(screen.getByRole("button", { name: /^推荐价/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^朋友价/ })).toHaveTextContent("WorldPac 零件进价 + $100");
    expect(screen.getByText(/现在按推荐价/)).toBeInTheDocument();
  });

  it("is saved on the conversation from the page or from the chat, and sent to the model", async () => {
    const store = new ConversationStore(memoryKv());
    const turn = (role: "user" | "assistant", text: string): Turn => ({ id: newTurnId(), role, text, author: role === "user" ? "kevin@x" : "assistant", at: Date.now(), quotes: [] });
    await store.append("cabc1234", "kevin@x", [turn("user", "2019 Camry 前后刹车盘"), turn("assistant", "按哪个价报？")], undefined, "x");
    const patch = await handleConversation(
      new Request("https://repair.speedxrental.com/api/workbench/conversations/cabc1234", { method: "PATCH", body: JSON.stringify({ priceTier: "referral" }) }),
      "cabc1234",
      { user: async () => ({ email: "kevin@x" }), store: () => store, log: () => {} },
    );
    expect(patch.status).toBe(200);
    expect((await store.get("cabc1234"))?.priceTier).toBe("referral");

    const seen: string[] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "set_price_tier", input: { tier: "friend" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "好的，按朋友价。" }] },
    ];
    const response = await handleWorkbenchChat(
      new Request("https://repair.speedxrental.com/api/workbench/chat", { method: "POST", body: JSON.stringify({ conversationId: "cabc1234", message: "客户是朋友", vehicleKey: null }) }),
      {
        user: async () => ({ email: "kevin@x" }),
        configured: () => true,
        limiter: new RateLimiter(),
        log: () => {},
        catalog: () => ({}) as CatalogApi,
        client: () => ({ beta: { messages: { create: (async (params: unknown) => (seen.push(JSON.stringify(params)), replies.shift())) as never } } }),
        conversations: () => store,
      },
    );
    await response.text();
    expect(seen[0]).toContain("Price for this conversation: 推荐价");
    expect((await store.get("cabc1234"))?.priceTier).toBe("friend");
  });
});

describe("review fixes", () => {
  it("treats cards for the same job as alternatives, not extras", () => {
    const engine = (label: string, id: string, list: number) => buildLaborQuote(`2019 Camry (${label})`, job("Brake Rotor R&R", "Front", [part(`${id}-P`, list, 60)]), id, env);
    render(<QuoteSheetSummary quotes={[engine("2.5 L4", "W-E1", 150), engine("3.5 V6", "W-E2", 210), rear()]} tier="retail" />);
    // Cheapest front ($150 + $120) + rear ($180 + $108), not both engines.
    expect(screen.getByTestId("quote-sheet-total")).toHaveTextContent("$558.00");
    expect(screen.getByRole("option", { name: /3\.5 V6/ })).toBeInTheDocument();
  });

  it("leaves part numbers out of the customer copy", async () => {
    const writeText = vi.fn(async (text: string) => void text);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<QuoteSheetSummary quotes={[front(), rear()]} tier="retail" />);
    await userEvent.click(screen.getByRole("button", { name: "复制合并报价给客人" }));
    expect(writeText.mock.calls[0][0]).not.toMatch(/#F-2|#R-1/);
  });

  it("charges a friend the referral price where there's no friend price", () => {
    expect(tierTotal({ customerTotal: 300, referralTotal: 276, friendTotal: null }, "friend")).toBe(276);
  });

  it("makes only the prices staff changed final", async () => {
    const onSaveFinal = vi.fn(async (totals: Record<string, number> | null) => Boolean(totals));
    render(<StaffQuoteCard quote={front()} onSaveFinal={onSaveFinal} />);
    await userEvent.click(screen.getByRole("button", { name: "✎ 改价" }));
    const input = screen.getByRole("spinbutton", { name: /F-1/ });
    await userEvent.clear(input);
    await userEvent.type(input, "300");
    await userEvent.click(screen.getByRole("button", { name: "保存最终价" }));
    expect(onSaveFinal).toHaveBeenCalledWith({ "0": 300 });
  });
});
