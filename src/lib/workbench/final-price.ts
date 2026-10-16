/**
 * Final prices staff agree with a customer (after bargaining) on top of the
 * assistant's quote. The quote keeps the assistant's numbers; `final` holds
 * the agreed total per option, and everything shown to the customer (copied
 * text, PDF) and the card's margin use those totals. Safe for the browser.
 */
import { customerText } from "./customer-text";
import type { StaffQuote, StaffQuoteOption } from "./quote";

export interface FinalPrices {
  /** Agreed customer total by option index ("0", "1", …). */
  totals: Record<string, number>;
  /** Staff email of whoever set them. */
  by: string;
  at: number;
}

export interface PricedOption extends StaffQuoteOption {
  /** The assistant's total, when staff changed it. */
  originalTotal: number | null;
}

const cents = (value: number) => Math.round(value * 100) / 100;

export const MAX_FINAL_TOTAL = 100_000;

/** Only real amounts for options that exist; null when nothing valid is left. */
export function readFinalTotals(raw: unknown, optionCount: number): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const totals: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const index = Number(key);
    const amount = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= optionCount) continue;
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_FINAL_TOTAL) continue;
    totals[String(index)] = cents(amount);
  }
  return Object.keys(totals).length > 0 ? totals : null;
}

/** One option at the agreed price: total, per-tire price, profit and margin follow it. */
export function priceOption(quote: Pick<StaffQuote, "kind">, option: StaffQuoteOption, final: number | undefined): PricedOption {
  if (final === undefined || cents(final) === cents(option.customerTotal)) return { ...option, originalTotal: null };
  const profit = option.costTotal === null ? null : cents(final - option.costTotal);
  return {
    ...option,
    customerTotal: cents(final),
    referralTotal: cents(final),
    // Tires are quoted per tire installed, so the per-tire price follows the agreed total.
    unitPrice: quote.kind === "tires" && option.quantity > 0 ? cents(final / option.quantity) : option.unitPrice,
    profit,
    margin: profit === null || final <= 0 ? null : Math.round((profit / final) * 1000) / 1000,
    originalTotal: option.customerTotal,
  };
}

export type PricedQuote = Omit<StaffQuote, "options"> & { options: PricedOption[] };

/** The quote as the customer should see it: agreed totals where staff set them. */
export function withFinalPrices(quote: StaffQuote): PricedQuote {
  const totals = quote.final?.totals ?? {};
  return { ...quote, options: quote.options.map((o, i) => priceOption(quote, o, totals[String(i)])) };
}

/** Customer text for the ticked options at the agreed prices. */
export function finalCustomerText(quote: StaffQuote, include: (index: number) => boolean = () => true): string {
  const priced = withFinalPrices(quote);
  return customerText({ ...priced, options: priced.options.filter((_, i) => include(i)) });
}
