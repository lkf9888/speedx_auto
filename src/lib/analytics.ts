import type { Locale } from "@/lib/site-routes";
import { readConsent } from "@/lib/consent";
import { queueGoogleCommand } from "@/lib/google-tag";
import { trackMetaEvent } from "@/lib/meta-pixel";

// Verified in the SpeedX Google Ads account. These public labels are not credentials.
const contactConversionDestinations = {
  whatsapp: "AW-625073096/wlyICOy7lo4dEMi3h6oC",
  phone: "AW-625073096/w6GCCO-7lo4dEMi3h6oC",
  wechat: "AW-625073096/iUGYCKifn44dEMi3h6oC",
} as const;

// "Repair – estimate lead" and "Repair – booking request", created 2026-10-21.
const repairLeadConversionDestinations = {
  estimate_lead: "AW-625073096/--kTCJeh_aQdEMi3h6oC",
  booking_request: "AW-625073096/5zNnCMym_aQdEMi3h6oC",
} as const;

export type RepairLeadKind = keyof typeof repairLeadConversionDestinations;

/**
 * "Hosting – estimate lead" in Google Ads (marketing task SX-03, secondary,
 * counted once). Set to null to stop sending it: the lead is then still
 * recorded as generate_lead and a Meta Lead. Do not reuse a repair label:
 * that would count owners as repair customers.
 */
export const HOSTING_LEAD_CONVERSION_DESTINATION: string | null = "AW-625073096/Emp3CLW_-rcdEMi3h6oC";

export type ContactMethod = "whatsapp" | "phone" | "wechat" | "email";
export type ContactIntent = "hosting" | "auto_repair" | "general";
export type ContactPlacement = "hero" | "middle" | "footer" | "sticky_mobile" | "chat";

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
  trackMetaEvent("Contact", { content_category: event.intent, content_name: event.method });
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

/**
 * A confirmed hosting lead: the hosting page's income estimate accepted the
 * owner's name and phone. Call it once per visit, after the server answered
 * OK. Like a repair lead, the analytics event goes out regardless of consent;
 * Meta and Google Ads only after the visitor grants it. No name, phone or chat
 * text is ever passed on.
 */
export function emitHostingLead(locale: Locale, destination: string | null = HOSTING_LEAD_CONVERSION_DESTINATION): void {
  if (typeof window === "undefined") return;

  const parameters = { lead_type: "hosting_estimate", intent: "hosting", locale };
  if (window.gtag) {
    window.gtag("event", "generate_lead", parameters);
  } else {
    window.dataLayer ??= [];
    window.dataLayer.push({ event: "generate_lead", ...parameters });
  }

  if (readConsent() !== "granted") return;
  trackMetaEvent("Lead", { content_category: "hosting" });
  if (!destination) return;
  const conversion = { send_to: destination, currency: "CAD", transport_type: "beacon" };
  if (window.gtag) {
    window.gtag("event", "conversion", conversion);
  } else {
    queueGoogleCommand("event", "conversion", conversion);
  }
}

/**
 * A confirmed repair lead: the estimate assistant accepted the customer's name
 * and phone, or a booking request was saved. Call it once, after the server
 * answered OK. Unlike a button click this is a real lead, so it is the
 * conversion the repair search campaigns optimize for.
 */
export function emitRepairLead(kind: RepairLeadKind, locale: Locale): void {
  if (typeof window === "undefined") return;

  const parameters = { lead_type: kind, intent: "auto_repair", locale };
  if (window.gtag) {
    window.gtag("event", "generate_lead", parameters);
  } else {
    window.dataLayer ??= [];
    window.dataLayer.push({ event: "generate_lead", ...parameters });
  }

  if (readConsent() !== "granted") return;
  trackMetaEvent(kind === "booking_request" ? "Schedule" : "Lead", { content_category: "auto_repair" });
  const conversion = {
    send_to: repairLeadConversionDestinations[kind],
    currency: "CAD",
    transport_type: "beacon",
  };
  if (window.gtag) {
    window.gtag("event", "conversion", conversion);
  } else {
    queueGoogleCommand("event", "conversion", conversion);
  }
}
