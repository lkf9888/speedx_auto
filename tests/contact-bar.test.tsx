import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactBar } from "@/components/ContactBar";
import { en } from "@/i18n/en";

const baseProps = {
  dict: en,
  locale: "en" as const,
  intent: "hosting" as const,
  placement: "hero" as const,
  pagePath: "/en/hosting",
};

describe("ContactBar", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("records exactly one WhatsApp and phone event for each click", () => {
    render(<ContactBar {...baseProps} />);

    const whatsapp = screen.getByRole("link", { name: /WhatsApp/i });
    const phone = screen.getByRole("link", { name: /778.*917.*0710/i });
    whatsapp.addEventListener("click", (event) => event.preventDefault());
    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(whatsapp);
    fireEvent.click(phone);

    expect(window.dataLayer).toEqual([
      {
        event: "contact_click",
        method: "whatsapp",
        intent: "hosting",
        locale: "en",
        placement: "hero",
        page_path: "/en/hosting",
      },
      {
        event: "contact_click",
        method: "phone",
        intent: "hosting",
        locale: "en",
        placement: "hero",
        page_path: "/en/hosting",
      },
    ]);
  });

  it("copies the WeChat ID, reports success, and records one event", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ContactBar {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /Add WeChat/i }));

    expect(writeText).toHaveBeenCalledWith("SPEEDX2020");
    expect(await screen.findByText("Copied: SPEEDX2020")).toBeInTheDocument();
    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer?.[0]).toMatchObject({
      event: "contact_click",
      method: "wechat",
    });
  });

  it("keeps the WeChat ID visible when clipboard permission fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<ContactBar {...baseProps} />);

    await user.click(screen.getByRole("button", { name: /Add WeChat/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Copy failed. WeChat ID: SPEEDX2020"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("SPEEDX2020")).toBeInTheDocument();
    expect(window.dataLayer).toHaveLength(1);
  });

  it("uses the live browser path for shared footer contact controls", () => {
    window.history.pushState({}, "", "/en/about");
    render(
      <ContactBar
        dict={en}
        locale="en"
        intent="general"
        placement="footer"
      />,
    );

    const phone = screen.getByRole("link", { name: /778.*917.*0710/i });
    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(phone);

    expect(window.dataLayer?.[0]).toMatchObject({
      placement: "footer",
      page_path: "/en/about",
    });
  });

  it("renders compact mobile sticky controls with reserved space", () => {
    const { container } = render(
      <ContactBar
        {...baseProps}
        placement="sticky_mobile"
        variant="sticky"
      />,
    );

    expect(container.querySelector("[data-sticky-contact-spacer]")).toBeInTheDocument();
    expect(container.querySelector("[data-sticky-contact-bar]")).toHaveClass("fixed");
    expect(screen.getByRole("button", { name: /Add WeChat/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /778.*917.*0710/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Email Us/i })).not.toBeInTheDocument();
  });
});
