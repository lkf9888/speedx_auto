/**
 * Which price a workbench conversation quotes (Kevin, 2026-11-14): staff pick
 * one before the first quote — retail (walk-in), referral or friend — and the
 * cards show only that price. Types and arithmetic only, safe for the browser.
 */
import type { StaffQuote, StaffQuoteOption } from "./quote";

export type PriceTier = "retail" | "referral" | "friend" | "custom";
export const PRICE_TIERS: readonly PriceTier[] = ["retail", "referral", "friend", "custom"];
/** The three quick-pick buttons; "custom" is whatever the sliders say. */
export const QUICK_TIERS: readonly PriceTier[] = ["retail", "referral", "friend"];

export const TIER_LABEL: Record<PriceTier, string> = { retail: "零售价", referral: "推荐价", friend: "朋友价", custom: "自定义价" };
export const TIER_HINT: Record<PriceTier, string> = {
  retail: "零件按 WorldPac 建议零售价（其他供货商进价 ×1.3），工时 $120/h",
  referral: "零件同零售价，工时 $96/h",
  friend: "WorldPac 零件进价 + $100（每个零件号），其他供货商进价 ×1.3，工时 $96/h",
  custom: "零件和工时按滑轨",
};

/**
 * Sliders (Kevin, 2026-11-15). Parts: 0% = cost, 100% = suggested retail
 * (other suppliers: cost x 1.3), one step = 5% of that spread. Labor: $60 to
 * $120 an hour in $1 steps. The quick buttons are three positions on them.
 */
export interface CustomPricing {
  partsPct: number;
  laborRate: number;
}
export const PARTS_STEP = 5;
export const LABOR_MIN = 60;
export const LABOR_MAX = 120;
export const LABOR_STEP = 1;
/** Slider positions the quick buttons stand for; friend parts are cost + $100 per part number, not a percentage. */
export const PRESET_PRICING: Record<"retail" | "referral" | "friend", CustomPricing> = {
  retail: { partsPct: 100, laborRate: 120 },
  referral: { partsPct: 100, laborRate: 96 },
  friend: { partsPct: 0, laborRate: 96 },
};

/** Slider values from anywhere (a request body, saved data) snapped onto the grid; null when they aren't numbers. */
export function snapPricing(raw: unknown): CustomPricing | null {
  if (!raw || typeof raw !== "object") return null;
  const { partsPct, laborRate } = raw as Record<string, unknown>;
  if (typeof partsPct !== "number" || typeof laborRate !== "number" || !Number.isFinite(partsPct) || !Number.isFinite(laborRate)) return null;
  const parts = Math.min(100, Math.max(0, Math.round(partsPct / PARTS_STEP) * PARTS_STEP));
  // Whole dollars, not the slider grid: the friend and referral buttons stand for $96, which sits between two steps.
  const labor = Math.min(LABOR_MAX, Math.max(LABOR_MIN, Math.round(laborRate)));
  return { partsPct: parts, laborRate: labor };
}

export const describePricing = (p: CustomPricing) => `零件 ${p.partsPct}% · 工时 $${p.laborRate}/h`;

export function isPriceTier(value: unknown): value is PriceTier {
  return typeof value === "string" && (PRICE_TIERS as readonly string[]).includes(value);
}

/**
 * The option's total at this price. Without a friend price (no cost known,
 * shop flat prices) the friend price falls back to the referral price, so a
 * friend never pays the walk-in labor rate.
 */
export function tierTotal(option: Pick<StaffQuoteOption, "customerTotal" | "referralTotal" | "friendTotal">, tier: PriceTier): number {
  if (tier === "referral") return option.referralTotal;
  if (tier === "friend") return option.friendTotal ?? option.referralTotal;
  return option.customerTotal;
}

const money = (value: number) => Math.round(value * 100) / 100;

/** The option's total at the sliders' positions; options without a cost keep the retail parts price. */
export function customTotal(quote: Pick<StaffQuote, "kind" | "labor">, option: StaffQuoteOption, pricing: CustomPricing): number {
  const share = pricing.partsPct / 100;
  if (quote.kind === "tires") {
    if (option.unitCost === null) return option.customerTotal;
    const eco = option.prices.eco ?? 0;
    const mounting = option.prices.mounting ?? 0;
    const retail = Math.max(option.unitPrice - eco - mounting, option.unitCost);
    return money((option.unitCost + (retail - option.unitCost) * share + eco + mounting) * option.quantity);
  }
  const hours = quote.labor?.hours ?? 0;
  const list = option.unitPrice * option.quantity;
  const low = option.costTotal === null ? list : Math.min(option.costTotal, list);
  const high = option.costTotal === null ? list : Math.max(option.costTotal, list);
  return money(low + (high - low) * share + hours * pricing.laborRate);
}

/** Whether the friend price had to fall back to the referral price for this option. */
export function noFriendPrice(option: Pick<StaffQuoteOption, "friendTotal">, tier: PriceTier): boolean {
  return tier === "friend" && option.friendTotal == null;
}

/** The labor in each option's total at this price, or null when the quote has none. */
export function tierLabor(quote: Pick<StaffQuote, "labor">, tier: PriceTier, custom?: CustomPricing | null): number | null {
  if (!quote.labor) return null;
  if (tier === "custom" && custom) return money(quote.labor.hours * custom.laborRate);
  return tier === "retail" || tier === "custom" ? quote.labor.walkIn : quote.labor.referral;
}

const cents = money;

/**
 * Markup in dollars at this price: what the customer pays for the parts
 * (tires: the tire itself, without eco fee and mounting) minus their cost.
 * Null without a cost.
 */
export function tierMarkup(quote: Pick<StaffQuote, "kind" | "labor">, option: StaffQuoteOption, tier: PriceTier, custom?: CustomPricing | null): number | null {
  if (option.unitCost === null || option.costTotal === null) return null;
  const total = tier === "custom" && custom ? customTotal(quote, option, custom) : tierTotal(option, tier);
  if (quote.kind === "tires") {
    const eco = option.prices.eco ?? 0;
    const mounting = option.prices.mounting ?? 0;
    const perTire = option.quantity > 0 ? total / option.quantity : 0;
    return cents((perTire - eco - mounting - option.unitCost) * option.quantity);
  }
  return cents(total - (tierLabor(quote, tier, custom) ?? 0) - option.costTotal);
}

/** The quote with every total at this price, for the customer copy. */
export function atTier<Q extends Omit<StaffQuote, "customerText">>(quote: Q, tier: PriceTier, custom?: CustomPricing | null): Q {
  if (tier === "retail" || (tier === "custom" && !custom)) return quote;
  return {
    ...quote,
    options: quote.options.map((o) => {
      const total = tier === "custom" && custom ? customTotal(quote, o, custom) : tierTotal(o, tier);
      return { ...o, customerTotal: total, unitPrice: quote.kind === "tires" && o.quantity > 0 ? cents(total / o.quantity) : o.unitPrice };
    }),
  };
}
