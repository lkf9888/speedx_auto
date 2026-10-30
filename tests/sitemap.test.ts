import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("publishes every route in every locale exactly once", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(entries).toHaveLength(42);
    expect(new Set(urls).size).toBe(42);
    expect(urls).toContain(
      "https://speedxrental.com/zh-TW/auto-repair/suspension",
    );
    expect(urls).toContain("https://speedxrental.com/en/privacy");
  });

  it("connects each URL to all localized alternatives", () => {
    const brakePage = sitemap().find(
      (entry) =>
        entry.url === "https://speedxrental.com/en/auto-repair/brakes",
    );

    expect(brakePage).toMatchObject({
      lastModified: "2026-10-13",
      alternates: {
        languages: {
          en: "https://speedxrental.com/en/auto-repair/brakes",
          "zh-Hans": "https://speedxrental.com/zh-CN/auto-repair/brakes",
          "zh-Hant": "https://speedxrental.com/zh-TW/auto-repair/brakes",
          "x-default": "https://speedxrental.com/en/auto-repair/brakes",
        },
      },
    });
  });

  it("dates the auto repair pages by their own last content change", () => {
    const repairPages = sitemap().filter(
      (entry) => entry.url.includes("/auto-repair") && !entry.url.endsWith("/prices"),
    );
    const priceGuides = sitemap().filter((entry) => entry.url.endsWith("/auto-repair/prices"));

    expect(repairPages).toHaveLength(18);
    expect(repairPages.every((entry) => entry.lastModified === "2026-10-13")).toBe(true);
    expect(priceGuides.map((entry) => entry.lastModified)).toEqual(["2026-10-13", "2026-10-13", "2026-10-13"]);
    expect(sitemap().find((entry) => entry.url.endsWith("/en/hosting"))?.lastModified).toBe("2026-08-11");
  });
});
