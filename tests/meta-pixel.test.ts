import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitContactClick } from "@/lib/analytics";
import { saveConsent } from "@/lib/consent";
import { loadMetaPixel, resetMetaPixelForTests, trackMetaEvent } from "@/lib/meta-pixel";

const PIXEL = "123456789012345";

describe("Meta Pixel", () => {
  beforeEach(() => {
    localStorage.clear();
    window.dataLayer = [];
    resetMetaPixelForTests();
    document.head.querySelectorAll('script[src*="fbevents"]').forEach((s) => s.remove());
  });
  afterEach(() => {
    localStorage.clear();
    resetMetaPixelForTests();
    delete window.gtag;
  });

  it.each([null, "denied"] as const)("does not load with %s consent", (choice) => {
    if (choice) saveConsent(choice);
    expect(loadMetaPixel(PIXEL)).toBe(false);
    expect(window.fbq).toBeUndefined();
    expect(document.head.querySelector('script[src*="fbevents"]')).toBeNull();
  });

  it("does nothing without a pixel ID", () => {
    saveConsent("granted");
    expect(loadMetaPixel("")).toBe(false);
    expect(window.fbq).toBeUndefined();
  });

  it("loads Meta's script once and initializes the pixel after consent", () => {
    saveConsent("granted");
    expect(loadMetaPixel(PIXEL)).toBe(true);
    expect(loadMetaPixel(PIXEL)).toBe(true);
    expect(document.head.querySelectorAll('script[src="https://connect.facebook.net/en_US/fbevents.js"]')).toHaveLength(1);
    expect(window.fbq?.queue).toEqual([["init", PIXEL]]);
  });

  it("sends a Contact event for consented contact clicks only", () => {
    saveConsent("granted");
    loadMetaPixel(PIXEL);
    window.gtag = vi.fn();
    emitContactClick({ method: "whatsapp", intent: "auto_repair", locale: "en", placement: "hero", pagePath: "/en/lp/winter-tires" });
    expect(window.fbq?.queue).toContainEqual(["track", "Contact", { content_category: "auto_repair", content_name: "whatsapp" }]);

    saveConsent("denied");
    trackMetaEvent("PageView");
    expect(window.fbq?.queue.filter((call) => call[1] === "PageView")).toHaveLength(0);
  });
});
