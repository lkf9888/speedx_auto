import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AutoRepairPage from "@/app/[locale]/auto-repair/page";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";
import type { JsonLdNode } from "@/lib/structured-data";

const locales = [
  ["en", en],
  ["zh-CN", zhCN],
  ["zh-TW", zhTW],
] as const;

async function renderPage(locale: string) {
  const view = render(await AutoRepairPage({ params: Promise.resolve({ locale }) }));
  const script = view.container.querySelector('script[type="application/ld+json"]');
  const graph = JSON.parse(script?.textContent ?? "{}")["@graph"] as JsonLdNode[];
  return { view, graph };
}

describe("auto repair hub page", () => {
  it.each(locales)("publishes the same FAQs in %s markup and visible text", async (locale, dict) => {
    const { graph } = await renderPage(locale);
    const faq = graph.find((node) => node["@type"] === "FAQPage");
    const questions = (faq?.mainEntity as Array<{ name: string }>).map((q) => q.name);

    expect(questions).toEqual(dict.autoRepair.faqs.map((item) => item.question));
    for (const question of questions) {
      expect(screen.getByText(question)).toBeInTheDocument();
    }
  });

  it("shows the labor rate, price table, and shop facts in visible text", async () => {
    await renderPage("en");

    expect(screen.getByRole("heading", { name: "What repairs cost" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(en.autoRepair.pricing.rows.length + 1);
    expect(screen.getByText("$120 per hour, before tax")).toBeInTheDocument();
    expect(screen.getByText("2980 Number 3 Rd, Richmond, BC V6X 2B3")).toBeInTheDocument();
    expect(screen.getByText("Mon–Sat · 10:00 AM – 6:30 PM")).toBeInTheDocument();
  });

  it("marks up the hourly labor rate and the visible service list", async () => {
    const { graph } = await renderPage("en");
    const service = graph.find((node) => node["@type"] === "Service");

    expect(service).toMatchObject({
      name: "Auto repair and maintenance",
      serviceType: "Auto repair",
      offers: {
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: 120,
          priceCurrency: "CAD",
          unitCode: "HUR",
        },
      },
    });
    const catalog = service?.hasOfferCatalog as { itemListElement: Array<{ itemOffered: { name: string } }> };
    expect(catalog.itemListElement.map((item) => item.itemOffered.name)).toEqual(en.autoRepair.scope.offered);
  });
});
