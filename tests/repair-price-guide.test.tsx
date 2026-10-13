import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RepairPriceGuidePage from "@/app/[locale]/auto-repair/prices/page";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";
import { ESTIMATE_SWING, WALK_IN_LABOR_RATE } from "@/lib/repair-chat/pricing";
import {
  displayedTotal,
  fillPriceGuide,
  jobRange,
  priceGuideJobs,
  priceGuideQuotes,
  priceGuideSystems,
} from "@/lib/repair-price-guide";
import type { JsonLdNode } from "@/lib/structured-data";

const locales = [
  ["en", en],
  ["zh-CN", zhCN],
  ["zh-TW", zhTW],
] as const;

async function renderGuide(locale: string) {
  const view = render(await RepairPriceGuidePage({ params: Promise.resolve({ locale }) }));
  const script = view.container.querySelector('script[type="application/ld+json"]');
  const graph = JSON.parse(script?.textContent ?? "{}")["@graph"] as JsonLdNode[];
  return { view, graph };
}

describe("repair price guide data", () => {
  it("lists every quoted job under exactly one system", () => {
    const listed = priceGuideSystems.flatMap((system) => [...priceGuideJobs[system]]);
    expect(new Set(listed).size).toBe(listed.length);
    for (const quote of priceGuideQuotes) expect(listed).toContain(quote.job);
  });

  it("widens totals the same way as the estimate assistant", () => {
    const camry = priceGuideQuotes.find((q) => q.job === "frontPads" && q.vehicle.includes("2019 Toyota Camry"))!;
    expect(displayedTotal(camry)).toEqual({
      low: Math.round(camry.totalLow * (1 - ESTIMATE_SWING)),
      high: Math.round(camry.totalHigh * (1 + ESTIMATE_SWING)),
    });
    expect(displayedTotal(camry)).toEqual({ low: 262, high: 350 });
  });

  it("keeps each quote's numbers consistent", () => {
    for (const q of priceGuideQuotes) {
      expect(q.partsLow).toBeLessThanOrEqual(q.partsHigh);
      expect(q.totalLow).toBeGreaterThanOrEqual(q.partsLow);
      expect(q.totalHigh).toBeGreaterThanOrEqual(q.totalLow);
      expect(q.laborHours).toBeGreaterThan(0);
    }
    expect(jobRange("frontPads").vehicles).toBeGreaterThanOrEqual(8);
  });
});

describe("repair price guide page", () => {
  it.each(locales)("names every job and leaves no placeholders in %s", (_, dict) => {
    const copy = dict.autoRepair.priceGuide;
    const allJobs = priceGuideSystems.flatMap((system) => [...priceGuideJobs[system]]);
    for (const job of allJobs) expect(copy.jobNames[job].length).toBeGreaterThan(1);
    const filled = [copy.summary, ...copy.faqs.map((f) => f.answer)].map((t) => fillPriceGuide(t));
    for (const text of filled) expect(text).not.toMatch(/\{\w+\}/);
  });

  it.each(locales)("publishes the %s FAQ markup exactly as shown", async (locale, dict) => {
    const { graph } = await renderGuide(locale);
    const faq = graph.find((node) => node["@type"] === "FAQPage");
    const marked = faq?.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;

    expect(marked.map((q) => q.name)).toEqual(dict.autoRepair.priceGuide.faqs.map((f) => f.question));
    for (const q of marked) expect(screen.getByText(q.acceptedAnswer.text)).toBeInTheDocument();
  });

  it("shows one row per quote plus the flat-price table, without the hourly rate", async () => {
    const { view } = await renderGuide("en");
    const tables = screen.getAllByRole("table");

    expect(tables).toHaveLength(priceGuideSystems.length + 1);
    const quoteRows = tables.slice(0, -1).flatMap((t) => [...t.querySelectorAll("tbody tr")]);
    expect(quoteRows).toHaveLength(priceGuideQuotes.length);
    expect(screen.getByText("$262–$350")).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(new RegExp(`\\$${WALK_IN_LABOR_RATE}\\s*(/|per)\\s*h`, "i"));
    expect(screen.getByTestId("answer-summary").textContent).toContain("$185–$444");
  });
});
