/** The surcharge on a staff quote's part price; safe for the browser. */
import type { StaffQuote, StaffQuoteOption } from "./quote";

/**
 * How much the part's customer price is above its cost, e.g. 0.3 for "+30%":
 * WorldPac's suggested retail over the account price, or the shop's markup
 * on a supplier with no suggested price. Null when either is unknown.
 */
export function surchargeOf(quote: Pick<StaffQuote, "kind">, option: Pick<StaffQuoteOption, "unitPrice" | "unitCost" | "prices">): number | null {
  const sell = quote.kind === "tires" ? option.prices.retail : quote.kind === "labor" ? option.unitPrice : undefined;
  const cost = quote.kind === "tires" ? option.prices.cost : option.unitCost;
  if (typeof sell !== "number" || typeof cost !== "number" || sell <= 0 || cost <= 0) return null;
  return Math.round((sell / cost - 1) * 1000) / 1000;
}
