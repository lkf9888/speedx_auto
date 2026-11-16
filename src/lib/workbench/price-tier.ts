/**
 * Which price a workbench conversation quotes (Kevin, 2026-11-14): staff pick
 * one before the first quote — retail (walk-in), referral or friend — and the
 * cards show only that price. Types and arithmetic only, safe for the browser.
 */
import type { StaffQuote, StaffQuoteOption } from "./quote";

export type PriceTier = "retail" | "referral" | "friend" | "cost" | "custom";
export const PRICE_TIERS: readonly PriceTier[] = ["retail", "referral", "friend", "cost", "custom"];
/** The quick-pick buttons; "custom" is whatever the sliders say. */
export const QUICK_TIERS: readonly PriceTier[] = ["retail", "referral", "friend", "cost"];

// Kevin, 2026-11-16: renamed. "8折人工" = the referral labor rate, $96/h (80% of $120).
export const TIER_LABEL: Record<PriceTier, string> = { retail: "原价", referral: "原价+8折人工", friend: "基础价+8折人工", cost: "成本价+8折人工", custom: "自定义价" };
export const TIER_HINT: Record<PriceTier, string> = {
  retail: "零件按 WorldPac 建议零售价（其他供货商进价 ×1.3），工时 $120/h",
  referral: "零件同原价，工时 8 折（$96/h）",
  friend: "WorldPac 零件进价 + $100（每个零件号），其他供货商进价 ×1.3，工时 8 折（$96/h）",
  cost: "零件按采购进价，不加价，工时 8 折（$96/h）",
  custom: "零件和工时按滑轨",
};

/**
 * Sliders (Kevin, 2026-11-15). Parts: 0% = cost, 100% = suggested retail
 * (other suppliers: cost x 1.3), one step = 5% of that spread. Labor: $60 to
 * $120 an hour in $1 steps. The quick buttons are positions on them.
 * Extra hours (Kevin, 2026-11-16): the guide's labor hours plus 0-100% in 10%
 * steps, on top of whichever price is chosen.
 */
export interface CustomPricing {
  partsPct: number;
  laborRate: number;
  /** Extra labor hours on top of the guide's, in percent (0-100, steps of 10). Absent = 0. */
  laborExtraPct?: number;
}
export const PARTS_STEP = 5;
export const LABOR_MIN = 60;
export const LABOR_MAX = 120;
export const LABOR_STEP = 1;
export const EXTRA_MAX = 100;
export const EXTRA_STEP = 10;
/** Slider positions the quick buttons stand for; friend parts are cost + $100 per part number, not a percentage. */
export const PRESET_PRICING: Record<"retail" | "referral" | "friend" | "cost", CustomPricing> = {
  retail: { partsPct: 100, laborRate: 120 },
  referral: { partsPct: 100, laborRate: 96 },
  friend: { partsPct: 0, laborRate: 96 },
  cost: { partsPct: 0, laborRate: 96 },
};

const snapExtra = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.min(EXTRA_MAX, Math.max(0, Math.round(value / EXTRA_STEP) * EXTRA_STEP)) : 0);
export const extraPctOf = (pricing?: CustomPricing | null): number => snapExtra(pricing?.laborExtraPct);

/** Slider values from anywhere (a request body, saved data) snapped onto the grid; null when they aren't numbers. */
export function snapPricing(raw: unknown): CustomPricing | null {
  if (!raw || typeof raw !== "object") return null;
  const { partsPct, laborRate, laborExtraPct } = raw as Record<string, unknown>;
  if (typeof partsPct !== "number" || typeof laborRate !== "number" || !Number.isFinite(partsPct) || !Number.isFinite(laborRate)) return null;
  const parts = Math.min(100, Math.max(0, Math.round(partsPct / PARTS_STEP) * PARTS_STEP));
  // Whole dollars, not the slider grid: the friend and referral buttons stand for $96, which sits between two steps.
  const labor = Math.min(LABOR_MAX, Math.max(LABOR_MIN, Math.round(laborRate)));
  const extra = snapExtra(laborExtraPct);
  return { partsPct: parts, laborRate: labor, ...(extra > 0 ? { laborExtraPct: extra } : {}) };
}

export const describePricing = (p: CustomPricing) => `零件 ${p.partsPct}% · 工时 $${p.laborRate}/h${extraPctOf(p) > 0 ? ` · 加时 ${extraPctOf(p)}%` : ""}`;

/** The price's name for the header and the chat line, with the extra hours when there are any. */
export function priceLabel(tier: PriceTier, pricing?: CustomPricing | null): string {
  if (tier === "custom") return pricing ? `${TIER_LABEL.custom}：${describePricing(pricing)}` : TIER_LABEL.custom;
  return extraPctOf(pricing) > 0 ? `${TIER_LABEL[tier]}，工时加时 ${extraPctOf(pricing)}%` : TIER_LABEL[tier];
}

export function isPriceTier(value: unknown): value is PriceTier {
  return typeof value === "string" && (PRICE_TIERS as readonly string[]).includes(value);
}

/**
 * The option's total at this price. Without a friend price (no cost known,
 * shop flat prices) the friend price falls back to the referral price, so a
 * friend never pays the walk-in labor rate. (The cost price is worked out by
 * `totalAt`, from the slider arithmetic.)
 */
export function tierTotal(option: Pick<StaffQuoteOption, "customerTotal" | "referralTotal" | "friendTotal">, tier: PriceTier): number {
  if (tier === "referral") return option.referralTotal;
  if (tier === "friend") return option.friendTotal ?? option.referralTotal;
  return option.customerTotal;
}

const money = (value: number) => Math.round(value * 100) / 100;

/** The slider positions a price is worked out from: the custom sliders, or the cost price's fixed ones. Null for the stored prices. */
function sliderPricing(tier: PriceTier, custom?: CustomPricing | null): CustomPricing | null {
  if (tier === "custom") return custom ?? null;
  if (tier === "cost") return PRESET_PRICING.cost;
  return null;
}

/** Labor before any extra hours. */
function baseLabor(quote: Pick<StaffQuote, "labor">, tier: PriceTier, custom?: CustomPricing | null): number | null {
  if (!quote.labor) return null;
  const sliders = sliderPricing(tier, custom);
  if (sliders) return money(quote.labor.hours * sliders.laborRate);
  return tier === "retail" || tier === "custom" ? quote.labor.walkIn : quote.labor.referral;
}

/** The labor hours once the extra is in, to 0.01 h so that hours × rate is exactly what is charged. */
const hoursAt = (hours: number, extraPct: number): number => (extraPct > 0 ? money(hours * (1 + extraPct / 100)) : hours);

/** The extra hours at this price, in dollars (0 when none, or the quote has no labor). */
function extraLabor(quote: Pick<StaffQuote, "labor">, tier: PriceTier, custom?: CustomPricing | null): number {
  const base = baseLabor(quote, tier, custom);
  const extra = extraPctOf(custom);
  if (base === null || extra === 0 || !quote.labor || quote.labor.hours <= 0) return 0;
  return money((hoursAt(quote.labor.hours, extra) * base) / quote.labor.hours - base);
}

/** The labor hours and their list value ($120/h) once the extra hours are in. */
export function laborWithExtra(labor: { hours: number; walkIn: number }, custom?: CustomPricing | null): { hours: number; list: number } {
  const hours = hoursAt(labor.hours, extraPctOf(custom));
  return { hours, list: labor.hours > 0 ? money((hours * labor.walkIn) / labor.hours) : labor.walkIn };
}

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
  const hours = hoursAt(quote.labor?.hours ?? 0, extraPctOf(pricing));
  const list = option.unitPrice * option.quantity;
  const low = option.costTotal === null ? list : Math.min(option.costTotal, list);
  const high = option.costTotal === null ? list : Math.max(option.costTotal, list);
  return money(low + (high - low) * share + hours * pricing.laborRate);
}

/** The option's total at the chosen price, extra hours included. */
export function totalAt(quote: Pick<StaffQuote, "kind" | "labor">, option: StaffQuoteOption, tier: PriceTier, custom?: CustomPricing | null): number {
  const sliders = sliderPricing(tier, custom);
  if (tier === "cost" && quote.kind !== "tires" && option.costTotal !== null) {
    // Parts at the purchase cost exactly, even where the list price is below it.
    return money(option.costTotal + (quote.labor ? hoursAt(quote.labor.hours, extraPctOf(custom)) * PRESET_PRICING.cost.laborRate : 0));
  }
  if (sliders) return customTotal(quote, option, { ...sliders, laborExtraPct: custom?.laborExtraPct });
  return money(tierTotal(option, tier) + extraLabor(quote, tier, custom));
}

/** Whether the friend price had to fall back to the referral price for this option. */
export function noFriendPrice(option: Pick<StaffQuoteOption, "friendTotal">, tier: PriceTier): boolean {
  return tier === "friend" && option.friendTotal == null;
}

/** The labor in each option's total at this price, or null when the quote has none. */
export function tierLabor(quote: Pick<StaffQuote, "labor">, tier: PriceTier, custom?: CustomPricing | null): number | null {
  const base = baseLabor(quote, tier, custom);
  return base === null ? null : money(base + extraLabor(quote, tier, custom));
}

const cents = money;

/**
 * Markup in dollars at this price: what the customer pays for the parts
 * (tires: the tire itself, without eco fee and mounting) minus their cost.
 * Null without a cost.
 */
export function tierMarkup(quote: Pick<StaffQuote, "kind" | "labor">, option: StaffQuoteOption, tier: PriceTier, custom?: CustomPricing | null): number | null {
  if (option.unitCost === null || option.costTotal === null) return null;
  const total = totalAt(quote, option, tier, custom);
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
  const sliders = sliderPricing(tier, custom);
  if (tier === "custom" && !sliders) return quote;
  if (tier === "retail" && extraPctOf(custom) === 0) return quote;
  return {
    ...quote,
    options: quote.options.map((o) => {
      const total = totalAt(quote, o, tier, custom);
      return { ...o, customerTotal: total, unitPrice: quote.kind === "tires" && o.quantity > 0 ? cents(total / o.quantity) : o.unitPrice };
    }),
  };
}
