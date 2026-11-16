import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

describe("locale proxy public discovery exclusions", () => {
  it.each(["robots.txt", "sitemap.xml", "llms.txt", "indexnow-"])(
    "leaves /%s at the site root",
    (asset) => {
      expect(config.matcher[0]).toContain(asset);
    },
  );
});

describe("locale proxy and the estimate logo", () => {
  // The estimate's logo is fetched from the public site on shared conversation pages: it must not be sent to /en/….
  const runs = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
  it("doesn't redirect the logo file, but still handles ordinary pages", () => {
    expect(runs("/images/logo-wide.png")).toBe(false);
    expect(runs("/auto-repair")).toBe(true);
  });
});
