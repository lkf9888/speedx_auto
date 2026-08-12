import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LandingPage from "@/app/[locale]/page";

describe("localized homepage hero", () => {
  it("shows hosting as primary and repair as a first-screen action", async () => {
    render(await LandingPage({ params: Promise.resolve({ locale: "en" }) }));

    expect(screen.getByRole("link", { name: /List My Car With SPEEDX/i })).toHaveAttribute(
      "href",
      "/en/hosting",
    );
    expect(within(screen.getByTestId("hero-actions")).getByRole("link", { name: /Explore auto repair/i })).toHaveAttribute(
      "href",
      "/en/auto-repair",
    );
  });
});
