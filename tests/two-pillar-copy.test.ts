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
      /BC's #1|British Columbia's #1|largest Turo fleet|largest Turo host|guarantees? your car gets booked|rarely sits idle|lowest management fees|competitive management fees|fastest handoffs|zero effort|100% state|licensed technicians handle every|quick turnaround|truly passive income|covering the full cost|no downtime|invest with us|buy a vehicle through our program|maximize your car's earnings|stable monthly income|earnings estimate within 24 hours|no hidden clauses|withdraw your car anytime|low in-house labor rates|no marked-up third-party quotes|damage caused by renters is handled through Turo's protection plan|坐收收益|坐享收益|覆盖整车的持有成本|覆蓋整車的持有成本|停工时间降到最低|停工時間降到最低|最具竞争力|最具競爭力|有竞争力的托管费率|有競爭力的託管費率|24 小时内我们给出|24 小時內我們給出|可随时结束托管|可隨時結束託管|内部工时价|內部工時價|没有第三方机修厂的加价|沒有第三方機修廠的加價|租客造成的损坏通过 Turo 保障计划处理|租客造成的損壞通過 Turo 保障計劃處理/i,
    );
  });
});
