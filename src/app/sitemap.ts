import type { MetadataRoute } from "next";
import {
  CONTENT_LAST_MODIFIED,
  absoluteRouteUrl,
  localizedAlternates,
  locales,
  routePaths,
  type RouteKey,
} from "@/lib/site-routes";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = Object.keys(routePaths) as RouteKey[];

  return locales.flatMap((locale) =>
    routes.map((route) => {
      const isPrimaryPage = ["home", "hosting", "autoRepair"].includes(route);

      return {
        url: absoluteRouteUrl(locale, route),
        lastModified: CONTENT_LAST_MODIFIED,
        changeFrequency: "monthly",
        priority: route === "home" ? 1 : isPrimaryPage ? 0.9 : 0.8,
        alternates: {
          languages: localizedAlternates(route),
        },
      } satisfies MetadataRoute.Sitemap[number];
    }),
  );
}
