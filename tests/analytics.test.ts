import { afterEach, describe, expect, it, vi } from "vitest";
import { emitContactClick } from "@/lib/analytics";

describe("emitContactClick", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.dataLayer = [];
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
