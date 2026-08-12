import type { Locale } from "@/lib/site-routes";

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
    return;
  }

  window.dataLayer ??= [];
  window.dataLayer.push({ event: "contact_click", ...parameters });
}
