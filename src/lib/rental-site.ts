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

/** Ad-click parameters the booking site needs to credit a booking to an ad. */
function isAdParam(name: string): boolean {
  return name === "gclid" || name === "gbraid" || name === "wbraid" || name.startsWith("utm_");
}

/**
 * The frame's address with the ad-click parameters (gclid, gbraid, wbraid,
 * utm_*) from this page's own query string added, so a booking made inside
 * the frame can still be traced to the ad that brought the visitor. Nothing
 * else is passed on; with no such parameters the address is unchanged.
 */
export function withAdParams(href: string, search: string): string {
  const params = [...new URLSearchParams(search)].filter(([name, value]) => isAdParam(name) && value);
  if (params.length === 0) return href;
  const url = new URL(href);
  for (const [name, value] of params) url.searchParams.append(name, value);
  return url.href;
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
