import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitContactClick } from "@/lib/analytics";
import { saveConsent } from "@/lib/consent";

const destinations = {
  whatsapp: "AW-625073096/wlyICOy7lo4dEMi3h6oC",
  phone: "AW-625073096/w6GCCO-7lo4dEMi3h6oC",
  wechat: "AW-625073096/iUGYCKifn44dEMi3h6oC",
} as const;
const click = {
  method: "whatsapp" as const,
  intent: "hosting" as const,
  locale: "en" as const,
  placement: "hero" as const,
  pagePath: "/en/hosting",
};

describe("Google Ads contact click conversions", () => {
  beforeEach(() => {
    localStorage.clear();
    window.dataLayer = [];
    delete window.gtag;
  });
  afterEach(() => {
    localStorage.clear();
    delete window.gtag;
    window.dataLayer = [];
  });

  it.each(Object.entries(destinations))("emits exactly one %s conversion after consent", (method, destination) => {
    saveConsent("granted");
    const gtag = vi.fn();
    window.gtag = gtag;
    emitContactClick({ ...click, method: method as keyof typeof destinations });
    expect(gtag.mock.calls).toEqual([
      ["event", "contact_click", {
        method, intent: "hosting", locale: "en", placement: "hero", page_path: "/en/hosting",
      }],
      ["event", "conversion", {
        send_to: destination, value: 0, currency: "CAD", transport_type: "beacon",
      }],
    ]);
  });

  it.each([null, "denied"] as const)("does not send a conversion with %s consent", (choice) => {
    if (choice) saveConsent(choice);
    const gtag = vi.fn();
    window.gtag = gtag;
    emitContactClick(click);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag.mock.calls[0][1]).toBe("contact_click");
  });

  it("does not turn email clicks into one of the approved conversions", () => {
    saveConsent("granted");
    const gtag = vi.fn();
    window.gtag = gtag;
    emitContactClick({ ...click, method: "email" });
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("queues a Google-compatible command when the tag has not initialized", () => {
    saveConsent("granted");
    emitContactClick(click);
    expect(window.dataLayer).toHaveLength(2);
    expect(Array.isArray(window.dataLayer?.[1])).toBe(false);
    expect(Array.from(window.dataLayer?.[1] as IArguments)).toEqual(["event", "conversion", {
      send_to: destinations.whatsapp, value: 0, currency: "CAD", transport_type: "beacon",
    }]);
  });

  it("does not replay a click made before consent was granted", () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    emitContactClick(click);
    saveConsent("granted");
    emitContactClick(click);
    expect(gtag.mock.calls.filter((args) => args[1] === "conversion")).toHaveLength(1);
  });
});
