import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";

const BASE = "https://speedxrental.com";
const paths = ["", "/hosting", "/services", "/about", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    for (const path of paths) {
      entries.push({
        url: `${BASE}/${locale}${path}`,
        changeFrequency: "monthly",
        priority: path === "" ? 1.0 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${BASE}/${l}${path}`]),
          ),
        },
      });
    }
  }
  return entries;
}
