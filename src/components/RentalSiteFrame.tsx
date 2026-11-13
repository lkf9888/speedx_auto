"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import {
  RENTAL_SITE_OPEN_MESSAGE,
  isAllowedDestination,
  rentalOrigin,
  rentalSiteHref,
  withAdParams,
} from "@/lib/rental-site";

// The query string never changes while the page is open, so there is
// nothing to subscribe to. On the server (and while hydrating) it reads as
// empty, which keeps the first render identical to the static HTML.
const noSubscription = () => () => {};
const pageSearch = () => window.location.search;
const noSearch = () => "";

/**
 * The booking site (TATO) in a frame that fills the window below the
 * nav. The frame scrolls on its own so the booking site's sticky bars
 * stay where it put them. Booking happens inside; only payment, which
 * Stripe will not show in a frame, takes the whole window. Ad-click
 * parameters on this page's address are passed on to the frame.
 */
export function RentalSiteFrame({ locale, title }: { locale: Locale; title: string }) {
  const search = useSyncExternalStore(noSubscription, pageSearch, noSearch);
  const src = withAdParams(rentalSiteHref(locale), search);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== rentalOrigin) return;
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type !== RENTAL_SITE_OPEN_MESSAGE || !isAllowedDestination(data.url)) return;
      window.location.href = data.url;
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      src={src}
      title={title}
      allow="payment"
      className="block w-full border-0"
      style={{ height: "calc(100dvh - 4rem)" }}
    />
  );
}
