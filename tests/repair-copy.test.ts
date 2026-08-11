import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";
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
});
