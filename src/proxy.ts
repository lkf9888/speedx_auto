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

/** The staff repair workbench is served only on its own subdomain (behind Cloudflare Access). */
const WORKBENCH_HOST = process.env.WORKBENCH_HOST || "repair.speedxrental.com";
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function workbenchRoute(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const isWorkbenchPath = pathname === "/workbench" || pathname.startsWith("/workbench/");
  // repair.speedxrental.com is a Cloudflare Worker that forwards to this
  // service and marks its requests. The mark only routes; what the page and
  // API show is still decided by the verified Cloudflare Access token.
  if (request.headers.get("x-speedx-workbench") === "1") {
    return isWorkbenchPath ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }
  if (host.split(":")[0] === WORKBENCH_HOST) {
    if (pathname === "/") return NextResponse.rewrite(new URL("/workbench", request.url));
    if (isWorkbenchPath) return NextResponse.next();
    return new NextResponse(null, { status: 404 });
  }
  if (isWorkbenchPath) {
    return LOCAL_HOST.test(host) ? NextResponse.next() : new NextResponse(null, { status: 404 });
  }
  return null;
}

export default function proxy(request: NextRequest) {
  const workbench = workbenchRoute(request);
  if (workbench) return workbench;

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
    "/((?!_next|api|favicon.ico|logo.png|robots.txt|sitemap.xml|llms.txt|indexnow-|images/).*)",
  ],
};
