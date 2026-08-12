import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentBanner } from "@/components/ConsentBanner";
import { CONSENT_STORAGE_KEY } from "@/lib/consent";

const copy = {
  title: "Your privacy choices",
  description: "Choose whether SPEEDX AUTO may use measurement cookies.",
  accept: "Accept",
  decline: "Decline",
  privacyLink: "Privacy details",
};

describe("ConsentBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.dataLayer = [];
    delete window.gtag;
  });

  it("shows on first visit and applies an accepted choice", async () => {
    const user = userEvent.setup();
    render(<ConsentBanner locale="en" copy={copy} />);

    expect(
      await screen.findByRole("dialog", { name: "Your privacy choices" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy details" })).toHaveAttribute(
      "href",
      "/en/privacy",
    );

    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("granted");
    expect(window.dataLayer?.at(-1)).toEqual([
      "consent",
      "update",
      {
        ad_storage: "granted",
        analytics_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays hidden when a declined choice is already stored", async () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "denied");
    render(<ConsentBanner locale="en" copy={copy} />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("applies and closes when persistent storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<ConsentBanner locale="en" copy={copy} />);

    await user.click(await screen.findByRole("button", { name: "Decline" }));

    expect(window.dataLayer?.at(-1)).toEqual([
      "consent",
      "update",
      {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
