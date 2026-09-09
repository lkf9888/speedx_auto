import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StaffLoginMenu } from "@/components/StaffLoginMenu";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";
import { staffAppKeys, staffAppUrls } from "@/lib/staff-apps";

describe("StaffLoginMenu", () => {
  it("keeps the internal systems out of the DOM until the menu is opened", () => {
    render(<StaffLoginMenu dict={en} />);

    expect(
      screen.getByRole("button", { name: /Staff Login/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("opens on click and links to each subdomain exactly once", async () => {
    const user = userEvent.setup();
    render(<StaffLoginMenu dict={en} />);

    await user.click(screen.getByRole("button", { name: /Staff Login/i }));

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(staffAppKeys.length);
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "https://carwash.speedxrental.com",
      "https://gps.speedxrental.com",
    ]);
    expect(
      screen.getByRole("button", { name: /Staff Login/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<StaffLoginMenu dict={en} />);
    const trigger = screen.getByRole("button", { name: /Staff Login/i });

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("labels every system in every locale", async () => {
    const user = userEvent.setup();

    for (const [dict, label] of [
      [en, /Staff Login/i],
      [zhCN, /员工登录/],
      [zhTW, /員工登入/],
    ] as const) {
      const { unmount } = render(<StaffLoginMenu dict={dict} />);
      await user.click(screen.getByRole("button", { name: label }));

      for (const key of staffAppKeys) {
        const name = dict.nav.staff.apps[key].name;
        expect(name.length).toBeGreaterThan(0);
        expect(screen.getByRole("menuitem", { name: new RegExp(name) }))
          .toHaveAttribute("href", staffAppUrls[key]);
      }

      unmount();
    }
  });

  it("points only at speedxrental.com subdomains", () => {
    for (const key of staffAppKeys) {
      const url = new URL(staffAppUrls[key]);
      expect(url.protocol).toBe("https:");
      expect(url.hostname.endsWith(".speedxrental.com")).toBe(true);
    }
  });
});
