import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

describe("locale proxy public discovery exclusions", () => {
  it.each(["robots.txt", "sitemap.xml", "llms.txt"])(
    "leaves /%s at the site root",
    (asset) => {
      expect(config.matcher[0]).toContain(asset);
    },
  );
});
