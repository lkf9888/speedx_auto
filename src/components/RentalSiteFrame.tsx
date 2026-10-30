"use client";

import { useEffect } from "react";
import type { Locale } from "@/i18n/config";
import {
  RENTAL_SITE_OPEN_MESSAGE,
  isAllowedDestination,
  rentalOrigin,
  rentalSiteHref,
} from "@/lib/rental-site";

/**
 * The booking site (TATO) in a frame that fills the window below the
 * nav. The frame scrolls on its own so the booking site's sticky bars
 * stay where it put them. Booking happens inside; only payment, which
 * Stripe will not show in a frame, takes the whole window.
 */
export function RentalSiteFrame({ locale, title }: { locale: Locale; title: string }) {
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
      src={rentalSiteHref(locale)}
      title={title}
      allow="payment"
      className="block w-full border-0"
      style={{ height: "calc(100dvh - 4rem)" }}
    />
  );
}
