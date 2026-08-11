import { describe, expect, it } from "vitest";
import { buildPageMetadata } from "@/lib/seo";

describe("buildPageMetadata", () => {
  it("gives the English homepage a self-referencing canonical", () => {
    const metadata = buildPageMetadata({
      locale: "en",
      route: "home",
      title: "Turo Car Hosting and Auto Repair",
      description: "A clear page description.",
    });

    expect(metadata.alternates).toEqual({
      canonical: "https://speedxrental.com/en",
      languages: {
        en: "https://speedxrental.com/en",
        "zh-Hans": "https://speedxrental.com/zh-CN",
        "zh-Hant": "https://speedxrental.com/zh-TW",
        "x-default": "https://speedxrental.com/en",
      },
    });
    expect(metadata.openGraph).toMatchObject({
      title: "Turo Car Hosting and Auto Repair",
      description: "A clear page description.",
      url: "https://speedxrental.com/en",
    });
  });

  it("does not inherit the homepage canonical on a nested repair page", () => {
    const metadata = buildPageMetadata({
      locale: "zh-CN",
      route: "repairBrakes",
      title: "刹车检查与维修",
      description: "列治文及大温地区刹车检查服务。",
    });

    expect(metadata.title).toBe("刹车检查与维修");
    expect(metadata.alternates?.canonical).toBe(
      "https://speedxrental.com/zh-CN/auto-repair/brakes",
    );
    expect(metadata.openGraph).toMatchObject({
      url: "https://speedxrental.com/zh-CN/auto-repair/brakes",
      title: "刹车检查与维修",
      description: "列治文及大温地区刹车检查服务。",
    });
  });
});
