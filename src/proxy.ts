import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, locales } from "./i18n/config";

function detectLocaleFromAcceptLanguage(accept: string | null): string {
  if (!accept) return defaultLocale;
  const lower = accept.toLowerCase();
  if (lower.includes("zh-tw") || lower.includes("zh-hk") || lower.includes("zh-hant")) {
    return "zh-TW";
  }
  if (lower.includes("zh")) {
    return "zh-CN";
  }
  return defaultLocale;
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );
  if (pathnameHasLocale) return NextResponse.next();

  const locale = detectLocaleFromAcceptLanguage(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next|api|favicon.ico|logo.png|robots.txt|sitemap.xml|images/).*)",
  ],
};
