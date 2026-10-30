import type { Locale } from "@/i18n/config";
import { company } from "@/lib/company";

/** Message the booking site posts when a page must take the whole window. */
export const RENTAL_SITE_OPEN_MESSAGE = "tato-site:open";

const rentalBase = company.rentalSiteUrl.replace(/\/+$/, "");
export const rentalOrigin = new URL(rentalBase).origin;

/** The booking site's address for each language. */
export function rentalSiteHref(locale: Locale): string {
  return locale === "en" ? `${rentalBase}/` : `${rentalBase}/${locale}`;
}

/**
 * Where the booking site may send this window: its own pages and Stripe
 * Checkout. Anything else is ignored, so a message cannot turn the
 * company site into a redirect to somewhere unknown.
 */
export function isAllowedDestination(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return url.origin === rentalOrigin || url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}
