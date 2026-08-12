import { locales, type Locale } from "@/i18n/config";

export { locales };
export type { Locale };

export const BASE_URL = "https://speedxrental.com";
export const CONTENT_LAST_MODIFIED = "2026-08-11";

export const repairServiceSlugs = [
  "maintenance",
  "brakes",
  "diagnostics",
  "suspension",
] as const;

export type RepairServiceSlug = (typeof repairServiceSlugs)[number];

export const routePaths = {
  home: "",
  hosting: "/hosting",
  autoRepair: "/auto-repair",
  repairMaintenance: "/auto-repair/maintenance",
  repairBrakes: "/auto-repair/brakes",
  repairDiagnostics: "/auto-repair/diagnostics",
  repairSuspension: "/auto-repair/suspension",
  services: "/services",
  about: "/about",
  contact: "/contact",
  privacy: "/privacy",
} as const;

export type RouteKey = keyof typeof routePaths;

const hreflangByLocale: Record<Locale, string> = {
  en: "en",
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
};

export function routePath(locale: Locale, route: RouteKey): string {
  return `/${locale}${routePaths[route]}`;
}

export function absoluteRouteUrl(locale: Locale, route: RouteKey): string {
  return `${BASE_URL}${routePath(locale, route)}`;
}

export function localizedAlternates(
  route: RouteKey,
): Record<string, string> {
  const languages = Object.fromEntries(
    locales.map((locale) => [
      hreflangByLocale[locale],
      absoluteRouteUrl(locale, route),
    ]),
  );

  return {
    ...languages,
    "x-default": absoluteRouteUrl("en", route),
  };
}
