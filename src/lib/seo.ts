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

type ShareImage = { url: string; width: number; height: number; alt: string };

const defaultShareImage: ShareImage = {
  url: "/logo.png",
  width: 1200,
  height: 1200,
  alt: "SPEEDX AUTO",
};

/** The repair share card rendered by app/[locale]/auto-repair/opengraph-image.tsx. */
export function repairShareImage(locale: Locale): ShareImage {
  return {
    url: `/${locale}/auto-repair/opengraph-image`,
    width: 1200,
    height: 630,
    alt: "SPEEDX AUTO: auto repair and Tesla/EV service in Richmond, BC",
  };
}

export function buildPageMetadata({
  locale,
  route,
  title,
  description,
  image = defaultShareImage,
}: {
  locale: Locale;
  route: RouteKey;
  title: string;
  description: string;
  image?: ShareImage;
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
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}
