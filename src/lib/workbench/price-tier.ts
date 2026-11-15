/**
 * Which price a workbench conversation quotes (Kevin, 2026-11-14): staff pick
 * one before the first quote — retail (walk-in), referral or friend — and the
 * cards show only that price. Types and arithmetic only, safe for the browser.
 */
import type { StaffQuote, StaffQuoteOption } from "./quote";

export type PriceTier = "retail" | "referral" | "friend";
export const PRICE_TIERS: readonly PriceTier[] = ["retail", "referral", "friend"];

export const TIER_LABEL: Record<PriceTier, string> = { retail: "零售价", referral: "推荐价", friend: "朋友价" };
export const TIER_HINT: Record<PriceTier, string> = {
  retail: "零件按 WorldPac 建议零售价（其他供货商进价 ×1.3），工时 $120/h",
  referral: "零件同零售价，工时 $96/h",
  friend: "WorldPac 零件进价 + $100（每个零件号），其他供货商进价 ×1.3，工时 $96/h",
};

export function isPriceTier(value: unknown): value is PriceTier {
  return typeof value === "string" && (PRICE_TIERS as readonly string[]).includes(value);
}

/** The option's total at this price; the friend price falls back to retail where there is none. */
export function tierTotal(option: Pick<StaffQuoteOption, "customerTotal" | "referralTotal" | "friendTotal">, tier: PriceTier): number {
  if (tier === "referral") return option.referralTotal;
  if (tier === "friend") return option.friendTotal ?? option.customerTotal;
  return option.customerTotal;
}

/** Whether the friend price had to fall back to retail for this option. */
export function noFriendPrice(option: Pick<StaffQuoteOption, "friendTotal">, tier: PriceTier): boolean {
  return tier === "friend" && option.friendTotal == null;
}

/** The labor in each option's total at this price, or null when the quote has none. */
export function tierLabor(quote: Pick<StaffQuote, "labor">, tier: PriceTier): number | null {
  if (!quote.labor) return null;
  return tier === "retail" ? quote.labor.walkIn : quote.labor.referral;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * Markup in dollars at this price: what the customer pays for the parts
 * (tires: the tire itself, without eco fee and mounting) minus their cost.
 * Null without a cost.
 */
export function tierMarkup(quote: Pick<StaffQuote, "kind" | "labor">, option: StaffQuoteOption, tier: PriceTier): number | null {
  if (option.unitCost === null || option.costTotal === null) return null;
  const total = tierTotal(option, tier);
  if (quote.kind === "tires") {
    const eco = option.prices.eco ?? 0;
    const mounting = option.prices.mounting ?? 0;
    const perTire = option.quantity > 0 ? total / option.quantity : 0;
    return cents((perTire - eco - mounting - option.unitCost) * option.quantity);
  }
  return cents(total - (tierLabor(quote, tier) ?? 0) - option.costTotal);
}

/** The quote with every total at this price, for the customer copy. */
export function atTier<Q extends Omit<StaffQuote, "customerText">>(quote: Q, tier: PriceTier): Q {
  if (tier === "retail") return quote;
  return {
    ...quote,
    options: quote.options.map((o) => {
      const total = tierTotal(o, tier);
      return { ...o, customerTotal: total, unitPrice: quote.kind === "tires" && o.quantity > 0 ? cents(total / o.quantity) : o.unitPrice };
    }),
  };
}
