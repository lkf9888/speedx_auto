import { describe, expect, it } from "vitest";
import { validatePageDocument, validateSitemap } from "../scripts/verify-production.mjs";

const validHtml = `<!doctype html>
<html lang="en"><head>
<link rel="canonical" href="https://speedxrental.com/en/hosting" />
<link rel="alternate" hreflang="en" href="https://speedxrental.com/en/hosting" />
<link rel="alternate" hreflang="zh-Hans" href="https://speedxrental.com/zh-CN/hosting" />
<link rel="alternate" hreflang="zh-Hant" href="https://speedxrental.com/zh-TW/hosting" />
<link rel="alternate" hreflang="x-default" href="https://speedxrental.com/en/hosting" />
<meta property="og:url" content="https://speedxrental.com/en/hosting" />
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Service"}]}</script>
</head><body>
<p>SPEEDX AUTO provides Turo fleet management for qualifying vehicle owners.</p>
<a href="tel:+17789170710">Call</a><a href="https://wa.me/17789170710">WhatsApp</a>
</body></html>`;

describe("production verifier", () => {
  it("accepts a complete localized page", () => {
    expect(
      validatePageDocument(validHtml, {
        path: "/en/hosting",
        lang: "en",
        marker: "provides Turo fleet management",
        canonicalOrigin: "https://speedxrental.com",
      }),
    ).toEqual([]);
  });

  it("reports missing discovery and conversion signals", () => {
    const errors = validatePageDocument("<html lang=\"en\"><body></body></html>", {
      path: "/en/hosting",
      lang: "en",
      marker: "fleet management",
      canonicalOrigin: "https://speedxrental.com",
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("canonical"),
        expect.stringContaining("hreflang"),
        expect.stringContaining("JSON-LD"),
        expect.stringContaining("phone"),
        expect.stringContaining("WhatsApp"),
        expect.stringContaining("answer marker"),
      ]),
    );
  });

  it("checks representative routes in the sitemap", () => {
    const sitemap = `<?xml version="1.0"?><urlset>
      <url><loc>https://speedxrental.com/en</loc></url>
      <url><loc>https://speedxrental.com/en/hosting</loc></url>
    </urlset>`;

    expect(
      validateSitemap(sitemap, ["/en", "/en/hosting"], "https://speedxrental.com"),
    ).toEqual([]);
    expect(
      validateSitemap(sitemap, ["/en/auto-repair"], "https://speedxrental.com"),
    ).toEqual(["sitemap missing https://speedxrental.com/en/auto-repair"]);
  });
});
