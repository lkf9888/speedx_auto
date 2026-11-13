import { describe, expect, it } from "vitest";
import { isAllowedDestination, rentalSiteHref, withAdParams } from "@/lib/rental-site";

describe("rental site frame", () => {
  it("frames the booking site in the page's language", () => {
    expect(rentalSiteHref("en")).toBe("https://rent.speedxrental.com/");
    expect(rentalSiteHref("zh-CN")).toBe("https://rent.speedxrental.com/zh-CN");
    expect(rentalSiteHref("zh-TW")).toBe("https://rent.speedxrental.com/zh-TW");
  });

  it("passes the ad-click parameters, and only those, on to the frame", () => {
    expect(withAdParams(rentalSiteHref("en"), "?utm_source=test&gclid=abc")).toBe(
      "https://rent.speedxrental.com/?utm_source=test&gclid=abc",
    );
    expect(withAdParams(rentalSiteHref("zh-CN"), "?gbraid=g1&wbraid=w1&utm_campaign=spring sale")).toBe(
      "https://rent.speedxrental.com/zh-CN?gbraid=g1&wbraid=w1&utm_campaign=spring+sale",
    );
    expect(withAdParams(rentalSiteHref("zh-TW"), "?fbclid=x&ref=y&utm_medium=cpc&utm_source=")).toBe(
      "https://rent.speedxrental.com/zh-TW?utm_medium=cpc",
    );
    expect(withAdParams(rentalSiteHref("en"), "")).toBe("https://rent.speedxrental.com/");
    expect(withAdParams(rentalSiteHref("en"), "?page=2")).toBe("https://rent.speedxrental.com/");
  });

  it("lets the booking site send the window only to itself or Stripe Checkout", () => {
    expect(isAllowedDestination("https://checkout.stripe.com/c/pay/cs_live_abc")).toBe(true);
    expect(isAllowedDestination("https://rent.speedxrental.com/booking/xyz")).toBe(true);
    expect(isAllowedDestination("https://evil.example.com/")).toBe(false);
    expect(isAllowedDestination("http://checkout.stripe.com/")).toBe(false);
    expect(isAllowedDestination("javascript:alert(1)")).toBe(false);
    expect(isAllowedDestination(42)).toBe(false);
  });
});
