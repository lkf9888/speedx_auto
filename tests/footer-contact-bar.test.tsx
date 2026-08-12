import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FooterContactBar } from "@/components/FooterContactBar";
import { en } from "@/i18n/en";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname }));

describe("FooterContactBar", () => {
  beforeEach(() => {
    window.dataLayer = [];
    delete window.gtag;
  });

  it.each([
    ["/en/hosting", "hosting"],
    ["/en/auto-repair/brakes", "auto_repair"],
    ["/en/services", "general"],
  ] as const)("attributes %s footer clicks to %s", (path, intent) => {
    usePathname.mockReturnValue(path);
    render(<FooterContactBar locale="en" dict={en} />);
    const phone = screen.getByRole("link", { name: /778.*917.*0710/i });
    phone.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(phone);

    expect(window.dataLayer?.[0]).toMatchObject({
      event: "contact_click",
      intent,
      placement: "footer",
      page_path: path,
    });
  });
});
