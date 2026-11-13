"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/config";
import {
  RENTAL_SITE_OPEN_MESSAGE,
  isAllowedDestination,
  rentalOrigin,
  rentalSiteHref,
  withAdParams,
} from "@/lib/rental-site";

// The query string never changes while the page is open, so there is
// nothing to subscribe to. On the server and while hydrating it reads as
// null: the static HTML has no frame address at all, and the browser sets
// the final one (with any ad parameters) once, right after hydration. A
// frame given a plain address first and the ad address later would load
// the booking site twice and count the visit twice.
const noSubscription = () => () => {};
const pageSearch = () => window.location.search;
const notHydrated = () => null;

/**
 * The booking site (TATO) in a frame that fills the window below the
 * nav. The frame scrolls on its own so the booking site's sticky bars
 * stay where it put them. Booking happens inside; only payment, which
 * Stripe will not show in a frame, takes the whole window. Ad-click
 * parameters on this page's address are passed on to the frame.
 */
export function RentalSiteFrame({
  locale,
  title,
  loadingLabel,
}: {
  locale: Locale;
  title: string;
  loadingLabel: string;
}) {
  const search = useSyncExternalStore(noSubscription, pageSearch, notHydrated);
  const src = search === null ? undefined : withAdParams(rentalSiteHref(locale), search);
  const [loaded, setLoaded] = useState(false);

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
    // The box has its final height from the first paint, so nothing below
    // it moves when the booking site arrives.
    <div data-rent-frame className="relative w-full" style={{ height: "calc(100dvh - 4rem)" }}>
      {!loaded && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-neutral-500"
        >
          <span
            aria-hidden="true"
            className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600"
          />
          {loadingLabel}
        </div>
      )}
      <iframe
        src={src}
        title={title}
        allow="payment"
        className="absolute inset-0 block h-full w-full border-0"
        // A frame with no address fires load for its empty page; only the
        // booking site's own load ends the waiting state.
        onLoad={(event) => {
          if (event.currentTarget.getAttribute("src")) setLoaded(true);
        }}
      />
    </div>
  );
}
