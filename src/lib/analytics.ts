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

export function emitContactClick(event: ContactClickEvent): void {
  if (typeof window === "undefined") return;

  window.dataLayer ??= [];
  window.dataLayer.push({
    event: "contact_click",
    method: event.method,
    intent: event.intent,
    locale: event.locale,
    placement: event.placement,
    page_path: event.pagePath,
  });
}
