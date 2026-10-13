import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AutoRepairPage from "@/app/[locale]/auto-repair/page";
import RepairDetailPage from "@/app/[locale]/auto-repair/[service]/page";
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(locales)("keeps facts and price tables collapsed but in the markup in %s", async (_, dict) => {
    const { view } = await renderPage(dict === en ? "en" : dict === zhCN ? "zh-CN" : "zh-TW");
    const sections = [...view.container.querySelectorAll("details")].filter((el) =>
      [dict.autoRepair.facts.title, dict.autoRepair.pricing.title, dict.autoRepair.pricing.flat.title].includes(
        el.querySelector("summary h2")?.textContent ?? "",
      ),
    );

    expect(sections).toHaveLength(3);
    for (const details of sections) expect(details.open).toBe(false);
    expect(view.container.querySelectorAll("table")).toHaveLength(2);
  });

  it("offers a quote button that jumps to the assistant only when the assistant is on the page", async () => {
    await renderPage("en");
    expect(screen.queryByRole("link", { name: en.cta.aiQuote })).not.toBeInTheDocument();
    cleanup();

    vi.stubEnv("NEXT_PUBLIC_REPAIR_CHAT_ENABLED", "true");
    await renderPage("zh-CN");
    const buttons = screen.getAllByRole("link", { name: "联系AI助手获得立即报价" });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toHaveAttribute("href", "#estimate");
    expect(document.getElementById("estimate")).not.toBeNull();
  });

  it.each(locales)("publishes the same FAQs in %s markup and visible text", async (locale, dict) => {
    const { graph } = await renderPage(locale);
    const faq = graph.find((node) => node["@type"] === "FAQPage");
    const questions = (faq?.mainEntity as Array<{ name: string }>).map((q) => q.name);

    expect(questions).toEqual(dict.autoRepair.faqs.map((item) => item.question));
    for (const question of questions) {
      expect(screen.getByText(question)).toBeInTheDocument();
    }
  });

  it("shows the price table and shop facts in visible text", async () => {
    await renderPage("en");

    expect(screen.getByRole("heading", { name: "What repairs cost" })).toBeInTheDocument();
    const [laborTable, flatTable] = screen.getAllByRole("table");
    expect(within(laborTable).getAllByRole("row")).toHaveLength(en.autoRepair.pricing.rows.length + 1);
    expect(within(flatTable).getByText("Regular 0W-20 $95 · Premium 0W-30 $120")).toBeInTheDocument();
    expect(within(flatTable).getByText("R-134a (older systems) $150 · R-1234yf (newer systems) $230")).toBeInTheDocument();
    // The shop asked to keep the hourly rate out of the "At a glance" list.
    expect(screen.queryByText("Labor rate")).not.toBeInTheDocument();
    expect(screen.getByText(en.autoRepair.pricing.laborBody)).toBeInTheDocument();
    expect(screen.getByText("2980 Number 3 Rd, Richmond, BC V6X 2B3")).toBeInTheDocument();
    expect(screen.getByText("Mon–Sat · 10:00 AM – 6:30 PM")).toBeInTheDocument();
  });

  it("marks up the visible service list without publishing an hourly rate", async () => {
    const { graph } = await renderPage("en");
    const service = graph.find((node) => node["@type"] === "Service");

    expect(service).toMatchObject({
      name: "Auto repair and maintenance",
      serviceType: "Auto repair",
    });
    expect(service).not.toHaveProperty("offers");
    const catalog = service?.hasOfferCatalog as { itemListElement: Array<{ itemOffered: { name: string } }> };
    expect(catalog.itemListElement.map((item) => item.itemOffered.name)).toEqual(en.autoRepair.scope.offered);
  });

  it("links the hub's EV section to the Tesla and EV guide", async () => {
    await renderPage("en");

    expect(screen.getByRole("link", { name: /Read the Tesla and EV repair guide/ })).toHaveAttribute(
      "href",
      "/en/auto-repair/tesla-ev",
    );
  });
});

describe("repair service guides", () => {
  it.each(locales)("renders the %s Tesla guide with matching FAQ markup and a labor-rate offer", async (locale, dict) => {
    const view = render(
      await RepairDetailPage({ params: Promise.resolve({ locale, service: "tesla-ev" }) }),
    );
    const script = view.container.querySelector('script[type="application/ld+json"]');
    const graph = JSON.parse(script?.textContent ?? "{}")["@graph"] as JsonLdNode[];
    const copy = dict.autoRepair.services["tesla-ev"];
    const faq = graph.find((node) => node["@type"] === "FAQPage");
    const service = graph.find((node) => node["@type"] === "Service");

    expect((faq?.mainEntity as Array<{ name: string }>).map((q) => q.name)).toEqual(
      copy.faqs.map((item) => item.question),
    );
    expect(service).toMatchObject({
      name: copy.title,
      serviceType: copy.serviceType,
    });
    expect(service).not.toHaveProperty("offers");
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(copy.pricingRows.length + 1);
  });
});
