import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TrackedContactLink } from "@/components/TrackedContactLink";

describe("TrackedContactLink", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("keeps the destination and emits the supplied contact context", () => {
    render(
      <TrackedContactLink
        href="tel:+17789170710"
        method="phone"
        intent="general"
        locale="zh-TW"
        placement="middle"
        pagePath="/zh-TW/contact"
      >
        Call SPEEDX
      </TrackedContactLink>,
    );

    const link = screen.getByRole("link", { name: "Call SPEEDX" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);

    expect(link).toHaveAttribute("href", "tel:+17789170710");
    expect(window.dataLayer).toEqual([
      {
        event: "contact_click",
        method: "phone",
        intent: "general",
        locale: "zh-TW",
        placement: "middle",
        page_path: "/zh-TW/contact",
      },
    ]);
  });
});
