import { describe, expect, it } from "vitest";
import {
  absoluteRouteUrl,
  localizedAlternates,
  routePath,
  routePaths,
  type RouteKey,
} from "@/lib/site-routes";

const expectedEnglishPaths: Record<RouteKey, string> = {
  home: "/en",
  hosting: "/en/hosting",
  autoRepair: "/en/auto-repair",
  repairMaintenance: "/en/auto-repair/maintenance",
  repairBrakes: "/en/auto-repair/brakes",
  repairDiagnostics: "/en/auto-repair/diagnostics",
  repairSuspension: "/en/auto-repair/suspension",
  services: "/en/services",
  about: "/en/about",
  contact: "/en/contact",
  privacy: "/en/privacy",
};

describe("site route catalog", () => {
  it("keeps every customer-facing route in one typed catalog", () => {
    expect(Object.keys(routePaths)).toEqual([
      "home",
      "hosting",
      "autoRepair",
      "repairMaintenance",
      "repairBrakes",
      "repairDiagnostics",
      "repairSuspension",
      "services",
      "about",
      "contact",
      "privacy",
    ]);
  });

  it.each(Object.entries(expectedEnglishPaths) as Array<[RouteKey, string]>) (
    "builds the expected English path for %s",
    (route, expected) => {
      expect(routePath("en", route)).toBe(expected);
      expect(absoluteRouteUrl("en", route)).toBe(
        `https://speedxrental.com${expected}`,
      );
    },
  );

  it("builds locale-specific paths without a homepage trailing slash", () => {
    expect(routePath("zh-CN", "home")).toBe("/zh-CN");
    expect(routePath("zh-TW", "repairBrakes")).toBe(
      "/zh-TW/auto-repair/brakes",
    );
  });

  it("maps app locales to standards-based hreflang values", () => {
    expect(localizedAlternates("repairDiagnostics")).toEqual({
      en: "https://speedxrental.com/en/auto-repair/diagnostics",
      "zh-Hans":
        "https://speedxrental.com/zh-CN/auto-repair/diagnostics",
      "zh-Hant":
        "https://speedxrental.com/zh-TW/auto-repair/diagnostics",
      "x-default":
        "https://speedxrental.com/en/auto-repair/diagnostics",
    });
  });
});
