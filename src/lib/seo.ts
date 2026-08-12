import type { Metadata } from "next";
import {
  absoluteRouteUrl,
  localizedAlternates,
  type Locale,
  type RouteKey,
} from "@/lib/site-routes";

const openGraphLocale: Record<Locale, string> = {
  en: "en_CA",
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
};

export function buildPageMetadata({
  locale,
  route,
  title,
  description,
}: {
  locale: Locale;
  route: RouteKey;
  title: string;
  description: string;
}): Metadata {
  const canonical = absoluteRouteUrl(locale, route);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: localizedAlternates(route),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "SPEEDX AUTO",
      locale: openGraphLocale[locale],
      type: "website",
      images: [
        {
          url: "/logo.png",
          width: 1200,
          height: 1200,
          alt: "SPEEDX AUTO",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/logo.png"],
    },
  };
}
