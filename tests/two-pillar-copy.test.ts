import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { zhCN } from "@/i18n/zh-CN";
import { zhTW } from "@/i18n/zh-TW";
import { company } from "@/lib/company";

const dictionaries = [
  ["en", en],
  ["zh-CN", zhCN],
  ["zh-TW", zhTW],
] as const;

function wordCount(value: string): number {
  return value.trim().split(/\s+/).length;
}

describe("two-pillar GEO positioning", () => {
  it.each(dictionaries)("routes %s visitors to hosting and repair", (_, dict) => {
    expect(dict.pillars.title.length).toBeGreaterThan(4);
    expect(dict.pillars.hosting.title.length).toBeGreaterThan(4);
    expect(dict.pillars.hosting.href).toBe("/hosting");
    expect(dict.pillars.repair.title.length).toBeGreaterThan(4);
    expect(dict.pillars.repair.href).toBe("/auto-repair");
  });

  it.each(dictionaries)("gives the %s hosting page a direct answer and service area", (_, dict) => {
    expect(dict.hosting.answerSummary.length).toBeGreaterThan(40);
    expect(dict.hosting.serviceAreaBody.length).toBeGreaterThan(20);
    expect(dict.hosting.lastUpdated.length).toBeGreaterThan(8);
  });

  it("keeps the English hosting answer between 40 and 80 words", () => {
    expect(wordCount(en.hosting.answerSummary)).toBeGreaterThanOrEqual(40);
    expect(wordCount(en.hosting.answerSummary)).toBeLessThanOrEqual(80);
  });

  it("uses the currently public, conservative trip threshold", () => {
    expect(company.stats.tripsCompleted).toBe("5,000+");
  });

  it("does not publish unsupported rankings, guarantees, or superlatives", () => {
    const publicCopy = JSON.stringify(dictionaries.map(([, dict]) => dict));

    expect(publicCopy).not.toMatch(
      /BC's #1|British Columbia's #1|largest Turo fleet|largest Turo host|guarantees? your car gets booked|rarely sits idle|lowest management fees|fastest handoffs|zero effort|100% state|licensed technicians handle every|quick turnaround/i,
    );
  });
});
