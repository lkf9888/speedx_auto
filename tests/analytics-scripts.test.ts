import { describe, expect, it } from "vitest";
import { getGoogleDestinations } from "@/components/AnalyticsScripts";

describe("getGoogleDestinations", () => {
  it("always preserves the existing Google Ads destination", () => {
    expect(getGoogleDestinations(undefined)).toEqual(["AW-625073096"]);
    expect(getGoogleDestinations("not-a-ga-id")).toEqual(["AW-625073096"]);
  });

  it("adds a valid GA4 destination without replacing Google Ads", () => {
    expect(getGoogleDestinations("G-ABC123XYZ9")).toEqual([
      "AW-625073096",
      "G-ABC123XYZ9",
    ]);
  });
});
