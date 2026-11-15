import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/site-routes";

export default function robots(): MetadataRoute.Robots {
  return {
    // Shared workbench conversations are private links, never for search engines.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/share/"] }],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
