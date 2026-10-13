import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";
import { FLAT_PRICES } from "@/lib/repair-chat/flat-price";
import { WALK_IN_LABOR_RATE } from "@/lib/repair-chat/pricing";
import { repairServiceSlugs } from "@/lib/site-routes";

const dictionaries = [
  ["en", en],
  ["zh-CN", zhCN],
  ["zh-TW", zhTW],
] as const;

function englishWordCount(value: string): number {
  return value.trim().split(/\s+/).length;
}

describe("localized auto repair copy", () => {
  it.each(dictionaries)("provides complete repair content for %s", (_, dict) => {
    expect(dict.autoRepair.title.length).toBeGreaterThan(4);
    expect(dict.autoRepair.summary.length).toBeGreaterThan(40);
    expect(dict.autoRepair.faqs.length).toBeGreaterThanOrEqual(3);

    for (const slug of repairServiceSlugs) {
      const service = dict.autoRepair.services[slug];
      expect(service.metaTitle.length).toBeGreaterThan(8);
      expect(service.summary.length).toBeGreaterThan(40);
      expect(service.symptoms.length).toBeGreaterThanOrEqual(3);
      expect(service.inspections.length).toBeGreaterThanOrEqual(3);
      expect(service.process.length).toBeGreaterThanOrEqual(3);
      expect(service.faqs.length).toBeGreaterThanOrEqual(3);
      expect(
        service.faqs.every((faq) => faq.question && faq.answer),
      ).toBe(true);
      expect(service.lastUpdated.length).toBeGreaterThan(8);
    }
  });

  it("keeps each English answer-first summary between 40 and 80 words", () => {
    const summaries = [
      en.autoRepair.summary,
      ...repairServiceSlugs.map(
        (slug) => en.autoRepair.services[slug].summary,
      ),
    ];

    for (const summary of summaries) {
      expect(englishWordCount(summary)).toBeGreaterThanOrEqual(40);
      expect(englishWordCount(summary)).toBeLessThanOrEqual(80);
    }
  });

  it("states the truthful repair service area in every locale", () => {
    expect(en.autoRepair.serviceAreaBody).toMatch(/Richmond.*Metro Vancouver/i);
    expect(zhCN.autoRepair.serviceAreaBody).toMatch(/列治文.*大温/);
    expect(zhTW.autoRepair.serviceAreaBody).toMatch(/列治文.*大溫/);
  });

  it("does not publish unsupported repair promises", () => {
    const allRepairCopy = JSON.stringify(
      dictionaries.map(([, dict]) => dict.autoRepair),
    );

    expect(allRepairCopy).not.toMatch(
      /guaranteed|same-day|cheapest|certified technicians|fixed price/i,
    );
  });

  it.each(dictionaries)("gives %s AI search engines citable shop facts", (_, dict) => {
    const hub = dict.autoRepair;
    const hubText = JSON.stringify({ ...hub, services: undefined });

    expect(hub.faqs.length).toBeGreaterThanOrEqual(10);
    expect(hub.facts.items.length).toBeGreaterThanOrEqual(8);
    expect(hub.pricing.rows.length).toBeGreaterThanOrEqual(6);
    expect(hub.scope.offered.length).toBeGreaterThanOrEqual(5);
    expect(hub.serviceAreaPlaces.length).toBeGreaterThanOrEqual(4);
    expect(hubText).toContain(String(WALK_IN_LABOR_RATE));
    expect(hubText).toMatch(/ALLDATA/);
    expect(hubText).toMatch(/WorldPac/);
    expect(hubText).toMatch(/Tesla|特斯拉/);
    expect(hubText).toMatch(/Cantonese|粤语|粵語/);
    expect(hub.lastUpdated).toMatch(/2026/);
  });

  it("states that body work is quoted separately and transmissions are not repaired", () => {
    expect(en.autoRepair.scope.quoteBody).toMatch(/body and paint/i);
    expect(en.autoRepair.scope.notOfferedBody).toMatch(/transmission/i);
    expect(zhCN.autoRepair.scope.notOfferedBody).toMatch(/变速箱/);
    expect(zhTW.autoRepair.scope.notOfferedBody).toMatch(/變速箱/);
  });

  it.each(dictionaries)("quotes the posted oil change prices in the %s FAQ", (_, dict) => {
    const faqText = JSON.stringify(dict.autoRepair.faqs);
    const { oil } = FLAT_PRICES;

    const posted = [
      oil.standard.regular,
      oil.premium.regular,
      oil.standard.large,
      oil.premium.large,
      oil.european,
      oil.diesel.car,
      oil.diesel.suv,
    ];
    for (const price of posted) {
      expect(faqText).toContain(String(price));
    }
  });

  it.each(dictionaries)("gives every %s service guide prices and enough FAQs", (_, dict) => {
    for (const slug of repairServiceSlugs) {
      const service = dict.autoRepair.services[slug];
      expect(service.faqs.length).toBeGreaterThanOrEqual(6);
      expect(service.pricingRows.length).toBeGreaterThanOrEqual(slug === "tesla-ev" ? 2 : 4);
      expect(service.pricingBody).toContain(String(WALK_IN_LABOR_RATE));
      expect(service.serviceType.length).toBeGreaterThan(1);
    }
  });

  it.each(dictionaries)("keeps the %s maintenance flat prices equal to the posted price list", (_, dict) => {
    const rows = JSON.stringify(dict.autoRepair.services.maintenance.pricingRows);
    const { oil, tirePerWheel, acRecharge } = FLAT_PRICES;

    for (const price of [
      oil.standard.regular,
      oil.premium.regular,
      oil.standard.large,
      oil.premium.large,
      ...Object.values(tirePerWheel),
      acRecharge.r134a,
      acRecharge.r1234yf,
    ]) {
      expect(rows).toContain(`$${price}`);
    }
  });

  it("writes each Chinese locale in its own script", () => {
    const simplifiedOnly = /[车维检价这时会发动电刹轮转换与为后么们师务无设]/;
    const traditionalOnly = /[車維檢價這時會發動電煞輪轉換與為後麼們師務無設]/;
    const strip = (value: unknown) => JSON.stringify(value).replace(/WorldPac|ALLDATA/g, "");

    expect(strip(zhTW.autoRepair)).not.toMatch(simplifiedOnly);
    expect(strip(zhCN.autoRepair)).not.toMatch(traditionalOnly);
  });
});
