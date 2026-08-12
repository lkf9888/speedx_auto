import { afterEach, describe, expect, it, vi } from "vitest";
import { contactIntentForPath, emitContactClick } from "@/lib/analytics";

describe("emitContactClick", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.dataLayer = [];
    delete window.gtag;
  });

  it("pushes the normalized contact_click payload", () => {
    window.dataLayer = [];

    emitContactClick({
      method: "whatsapp",
      intent: "hosting",
      locale: "zh-CN",
      placement: "hero",
      pagePath: "/zh-CN/hosting",
    });

    expect(window.dataLayer).toEqual([
      {
        event: "contact_click",
        method: "whatsapp",
        intent: "hosting",
        locale: "zh-CN",
        placement: "hero",
        page_path: "/zh-CN/hosting",
      },
    ]);
  });

  it("creates dataLayer when the browser has not initialized Google tags", () => {
    delete window.dataLayer;

    emitContactClick({
      method: "phone",
      intent: "auto_repair",
      locale: "en",
      placement: "footer",
      pagePath: "/en/auto-repair",
    });

    expect(window.dataLayer).toHaveLength(1);
  });

  it("sends the event through gtag when the Google tag is initialized", () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    emitContactClick({
      method: "wechat",
      intent: "hosting",
      locale: "en",
      placement: "sticky_mobile",
      pagePath: "/en/hosting",
    });

    expect(gtag).toHaveBeenCalledWith("event", "contact_click", {
      method: "wechat",
      intent: "hosting",
      locale: "en",
      placement: "sticky_mobile",
      page_path: "/en/hosting",
    });
    expect(window.dataLayer).toEqual([]);
  });

  it("does nothing during server rendering", () => {
    vi.stubGlobal("window", undefined);

    expect(() =>
      emitContactClick({
        method: "wechat",
        intent: "general",
        locale: "en",
        placement: "middle",
        pagePath: "/en/contact",
      }),
    ).not.toThrow();
  });
});

describe("contactIntentForPath", () => {
  it.each([
    ["/en/hosting", "hosting"],
    ["/zh-CN/auto-repair", "auto_repair"],
    ["/zh-TW/auto-repair/brakes", "auto_repair"],
    ["/en/services", "general"],
    ["/en/about", "general"],
  ] as const)("maps %s to %s", (path, intent) => {
    expect(contactIntentForPath(path)).toBe(intent);
  });
});
