import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("publishes every route in every locale exactly once", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(entries).toHaveLength(33);
    expect(new Set(urls).size).toBe(33);
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
      lastModified: "2026-08-11",
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

  it("dates the auto repair hub by its own last content change", () => {
    const hub = sitemap().filter((entry) => entry.url.endsWith("/auto-repair"));

    expect(hub).toHaveLength(3);
    expect(hub.every((entry) => entry.lastModified === "2026-10-12")).toBe(true);
  });
});
