import { describe, expect, it } from "vitest";
import { isAllowedDestination, rentalSiteHref } from "@/lib/rental-site";

describe("rental site frame", () => {
  it("frames the booking site in the page's language", () => {
    expect(rentalSiteHref("en")).toBe("https://rent.speedxrental.com/");
    expect(rentalSiteHref("zh-CN")).toBe("https://rent.speedxrental.com/zh-CN");
    expect(rentalSiteHref("zh-TW")).toBe("https://rent.speedxrental.com/zh-TW");
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
