import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RepairLandingPage, { generateMetadata, generateStaticParams } from "@/app/[locale]/lp/[slug]/page";
import sitemap from "@/app/sitemap";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";
import { FLAT_PRICES } from "@/lib/repair-chat/flat-price";
import { fillPriceGuide } from "@/lib/repair-price-guide";
import { repairLandingSlugs } from "@/lib/site-routes";

const dictionaries = [
  ["en", en],
  ["zh-CN", zhCN],
  ["zh-TW", zhTW],
] as const;

describe("paid-social landing pages", () => {
  it("builds every slug in every locale", () => {
    expect(generateStaticParams()).toHaveLength(repairLandingSlugs.length * 3);
  });

  it.each(dictionaries)("leaves no placeholders in the %s copy", (_, dict) => {
    for (const slug of repairLandingSlugs) {
      const text = fillPriceGuide(JSON.stringify(dict.autoRepair.landing[slug]));
      expect(text).not.toMatch(/\{\w+\}/);
    }
  });

  it("stays out of search results and the sitemap", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en", slug: "winter-tires" }) });
    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.alternates?.canonical).toBe("https://speedxrental.com/en/lp/winter-tires");
    expect(sitemap().some((entry) => entry.url.includes("/lp/"))).toBe(false);
  });

  it("shows the posted tire price and a prefilled WhatsApp message", async () => {
    render(await RepairLandingPage({ params: Promise.resolve({ locale: "en", slug: "winter-tires" }) }));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      `Winter tires on, from $${FLAT_PRICES.tirePerWheel.up_to_18} a tire`,
    );
    const whatsapp = screen.getByTestId("landing-whatsapp");
    const url = new URL(whatsapp.getAttribute("href")!);
    expect(url.host).toBe("wa.me");
    expect(url.searchParams.get("text")).toBe(en.autoRepair.landing["winter-tires"].whatsappText);
    expect(screen.getAllByText(`$${FLAT_PRICES.tirePerWheel.over_18} per tire`).length).toBeGreaterThan(0);
  });

  it("tags landing page contacts as auto repair", async () => {
    window.dataLayer = [];
    render(await RepairLandingPage({ params: Promise.resolve({ locale: "zh-TW", slug: "tesla-ev" }) }));
    const whatsapp = screen.getByTestId("landing-whatsapp");
    whatsapp.addEventListener("click", (event) => event.preventDefault());
    whatsapp.click();

    expect(window.dataLayer?.[0]).toMatchObject({
      event: "contact_click",
      method: "whatsapp",
      intent: "auto_repair",
      page_path: "/zh-TW/lp/tesla-ev",
    });
  });
});
