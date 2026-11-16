import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HouseRulesPanel } from "@/components/workbench/HouseRulesPanel";
import { publicProfile, runChat } from "@/lib/repair-chat/agent";
import { quoteFlatService } from "@/lib/repair-chat/flat-price";
import { FLAT_PRICE_SLOTS } from "@/lib/repair-chat/flat-prices";
import { applyDiscounts, applyPriceOverrides, cleanRule, closedDays, houseNotesPrompt, priceOverrides, type HouseRule } from "@/lib/repair-chat/house-rules";
import { handleBooking, handleBookingSlots } from "@/lib/repair-chat/http";
import { buildFlatEstimate, summarizeEstimateForModel, type EstimateCard } from "@/lib/repair-chat/pricing";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore } from "@/lib/repair-chat/session";

// Kevin, 2026-11-14: change a posted flat price, and set closed days, from the workbench.

const who = { email: "owner@example.com", at: "2026-11-14T20:00:00.000Z", id: "R-1" };
const price = (slot: string, amount: number, fields: Partial<HouseRule> = {}) => cleanRule({ kind: "price", title: "十二月机油价", priceSlot: slot, price: amount, ...fields }, { ...who, id: fields.id ?? `R-${slot}` });
const closed = (start: string, end = "", text = "") => cleanRule({ kind: "closed", title: "休息", startDate: start, endDate: end, text }, { ...who, id: `R-${start}` });

const camry = { year: 2019, make: "Toyota", description: "2019 Toyota Camry LE 2.5 L4", cylinders: 4, diesel: false, electric: false, european: false, premium: false };
function oilCard(): EstimateCard {
  const quote = quoteFlatService(camry, { service: "oil_change", size: "car", fuel: "gasoline", oilGrade: null, tireType: null, tireCount: null, refrigerant: null, premiumClaimed: false });
  if (quote.status !== "ok") throw new Error("no quote");
  return buildFlatEstimate("2019 Toyota Camry", quote, "zh-CN", "E-1");
}

describe("price rules", () => {
  it("must name a known item and a sensible price, for everyone", () => {
    expect(price("oil_standard_regular", 89)).toMatchObject({ kind: "price", priceSlot: "oil_standard_regular", price: 89, percent: 0, labelZh: "" });
    expect(() => price("oil_gold", 89)).toThrow(/哪一项/);
    expect(() => price("oil_standard_regular", 0)).toThrow(/新价格/);
    expect(price("tire_up_to_18", 24.99).price).toBe(25);
    expect(() => price("oil_standard_regular", 89, { customerPhone: "604-555-0182" })).toThrow(/所有客人/);
  });

  it("puts the new price on the card as the price itself, only for that item", () => {
    const card = applyPriceOverrides(oilCard(), priceOverrides([price("oil_standard_regular", 89)]));
    expect(card.partOptions.map((o) => [o.slot, o.unitListPrice])).toEqual([
      ["oil_standard_regular", 89],
      ["oil_premium_regular", 120],
    ]);
    expect([card.totalLow, card.totalHigh]).toEqual([89, 120]);
    expect(card.discount).toBeUndefined();
    expect(summarizeEstimateForModel(card)).toContain("$89");
  });

  it("takes a discount off the new price, not the old one", () => {
    const rules = [price("oil_standard_regular", 89), cleanRule({ kind: "discount", title: "折扣", amount: 9, appliesTo: "oil_change", labelZh: "减九" }, { ...who, id: "R-D" })];
    const card = applyDiscounts(applyPriceOverrides(oilCard(), priceOverrides(rules)), rules, () => "减九");
    expect([card.totalLow, card.totalHigh]).toEqual([80, 111]);
  });

  it("covers every posted price", () => {
    expect(Object.keys(FLAT_PRICE_SLOTS)).toHaveLength(16);
    expect(oilCard().partOptions.every((o) => o.slot && o.slot in FLAT_PRICE_SLOTS)).toBe(true);
  });
});

describe("closed days", () => {
  it("need a start date, default to one day, and are for everyone", () => {
    expect(closed("2026-12-24")).toMatchObject({ startDate: "2026-12-24", endDate: "2026-12-24" });
    expect(() => cleanRule({ kind: "closed", title: "x" }, who)).toThrow(/哪天/);
    expect(() => cleanRule({ kind: "closed", title: "x", startDate: "2026-12-24", customerPhone: "6045550182" }, who)).toThrow(/不能指定客人/);
    expect(() => closed("2026-01-01", "2026-06-01")).toThrow(/最多 60 天/);
    expect(closed("2026-12-01", "2026-01-29".replace("2026-01", "2027-01"))).toBeTruthy();
    expect(() => closed("2026-12-01", "2027-01-30")).toThrow(/最多 60 天/);
  });

  it("lists each closed day from today on", () => {
    const days = closedDays([closed("2026-12-24", "2026-12-26"), closed("2026-11-01")], "2026-11-14");
    expect([...days]).toEqual(["2026-12-24", "2026-12-25", "2026-12-26"]);
  });

  it("tells the assistant about closed days ahead of time", () => {
    const prompt = houseNotesPrompt([], [closed("2026-12-24", "2026-12-26", "Christmas")]);
    expect(prompt).toContain("2026-12-24 to 2026-12-26 (Christmas)");
    expect(prompt).toMatch(/never offer them/);
  });

  it("takes them out of the booking card and refuses a booking on one", async () => {
    const now = new Date("2026-11-14T20:00:00Z");
    const deps = { houseRules: async () => [closed("2026-11-16")] };
    const days = ((await (await handleBookingSlots(now, deps)).json()) as { days: Array<{ date: string }> }).days.map((d) => d.date);
    expect(days).not.toContain("2026-11-16");
    expect(days).toContain("2026-11-17");
    const booking = await handleBooking(
      new Request("https://speedxrental.com/api/repair-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" },
        body: JSON.stringify({ locale: "en", lead: { name: "Test", phone: "604-555-0100" }, date: "2026-11-16", time: "11:00" }),
      }),
      { configured: () => true, notify: async () => {}, sessions: new SessionStore(async () => {}), limiter: new RateLimiter(), mailer: async () => {}, ...deps },
      now,
    );
    expect(booking.status).toBe(409);
  });

  it("keeps the chat's appointment tool off closed days and tells the model", async () => {
    const requests: string[] = [];
    const replies = [
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "request_appointment", input: { date: "2026-11-16", time: "11:00" } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "We're closed that day." }] },
    ];
    const client = { beta: { messages: { create: async (params: unknown) => (requests.push(JSON.stringify(params)), replies.shift() as never) } } };
    const events: Array<{ type: string }> = [];
    vi.useFakeTimers({ now: new Date("2026-11-14T20:00:00Z"), toFake: ["Date"] });
    try {
      await runChat(client, { get: async () => ({}) as never, post: async () => ({}) as never }, { history: [], message: "Monday 11am?", locale: "en", vehicleKey: null }, (e) => void events.push(e), () => "E-1", publicProfile({ rules: [closed("2026-11-16", "", "staff training")], customerPhone: null }));
    } finally {
      vi.useRealTimers();
    }
    expect(events.some((e) => e.type === "appointment")).toBe(false);
    expect(requests[0]).toContain("2026-11-16 (staff training)");
    expect(requests[1]).toContain("not_available");
  });
});

describe("the rules panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows price changes and closed days in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ rules: [price("oil_standard_regular", 89), closed("2026-12-24", "2026-12-26", "圣诞")], canEdit: true, today: "2026-11-14" })));
    render(<HouseRulesPanel onClose={() => {}} />);
    expect(await screen.findByText("换机油 · 普通机油 0W-20 · 轿车/小中型 SUV：$95 → $89")).toBeInTheDocument();
    expect(screen.getByText("2026-12-24 到 2026-12-26 不营业，网上预约跳过这几天（圣诞）")).toBeInTheDocument();
    expect(screen.getByText("改价")).toBeInTheDocument();
    expect(screen.getByText("休息日")).toBeInTheDocument();
  });
});
