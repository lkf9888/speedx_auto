import type { Locale } from "@/lib/site-routes";
import { readConsent } from "@/lib/consent";
import { queueGoogleCommand } from "@/lib/google-tag";

// Verified in the SpeedX Google Ads account. These public labels are not credentials.
const contactConversionDestinations = {
  whatsapp: "AW-625073096/wlyICOy7lo4dEMi3h6oC",
  phone: "AW-625073096/w6GCCO-7lo4dEMi3h6oC",
  wechat: "AW-625073096/iUGYCKifn44dEMi3h6oC",
} as const;

export type ContactMethod = "whatsapp" | "phone" | "wechat" | "email";
export type ContactIntent = "hosting" | "auto_repair" | "general";
export type ContactPlacement = "hero" | "middle" | "footer" | "sticky_mobile";

export interface ContactClickEvent {
  method: ContactMethod;
  intent: ContactIntent;
  locale: Locale;
  placement: ContactPlacement;
  pagePath: string;
}

export function contactIntentForPath(pagePath: string): ContactIntent {
  if (/\/(?:en|zh-CN|zh-TW)\/hosting(?:\/|$)/.test(pagePath)) {
    return "hosting";
  }
  if (/\/(?:en|zh-CN|zh-TW)\/auto-repair(?:\/|$)/.test(pagePath)) {
    return "auto_repair";
  }
  return "general";
}

export function emitContactClick(event: ContactClickEvent): void {
  if (typeof window === "undefined") return;

  const parameters = {
    method: event.method,
    intent: event.intent,
    locale: event.locale,
    placement: event.placement,
    page_path: event.pagePath,
  };

  if (window.gtag) {
    window.gtag("event", "contact_click", parameters);
  } else {
    window.dataLayer ??= [];
    window.dataLayer.push({ event: "contact_click", ...parameters });
  }

  // A button click is observation only, never a confirmed lead or sale. Do not
  // send Ads conversions before consent, or replay earlier clicks afterward.
  if (readConsent() !== "granted" || event.method === "email") return;
  const conversion = {
    send_to: contactConversionDestinations[event.method],
    value: 0,
    currency: "CAD",
    transport_type: "beacon",
  };
  if (window.gtag) {
    window.gtag("event", "conversion", conversion);
  } else {
    queueGoogleCommand("event", "conversion", conversion);
  }
}
