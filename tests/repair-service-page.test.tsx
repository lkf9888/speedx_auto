import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RepairServicePage } from "@/components/RepairServicePage";
import { en } from "@/i18n/en";

describe("RepairServicePage", () => {
  beforeEach(() => {
    window.dataLayer = [];
  });

  it("renders the answer summary before detailed brake sections", () => {
    render(
      <RepairServicePage locale="en" dict={en} serviceSlug="brakes" />,
    );

    const summary = screen.getByTestId("answer-summary");
    const symptoms = screen.getByRole("heading", {
      name: "When to book an inspection",
    });
    expect(
      summary.compareDocumentPosition(symptoms) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeGreaterThan(2);
    expect(screen.getByRole("link", { name: "Auto Repair" })).toHaveAttribute(
      "href",
      "/en/auto-repair",
    );
  });

  it("tags direct contact actions with auto_repair intent", () => {
    render(
      <RepairServicePage locale="en" dict={en} serviceSlug="brakes" />,
    );
    const phone = screen.getAllByRole("link", { name: /778.*917.*0710/i })[0];
    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(phone);

    expect(window.dataLayer?.[0]).toMatchObject({
      event: "contact_click",
      method: "phone",
      intent: "auto_repair",
      locale: "en",
      placement: "hero",
      page_path: "/en/auto-repair/brakes",
    });
  });
});
