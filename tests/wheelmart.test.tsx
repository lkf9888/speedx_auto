import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffQuoteCard } from "@/components/workbench/StaffQuoteCard";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isWheelmartLoginPage, parseWheelmartPage, readDescription, searchDigits } from "@/lib/wheelmart/parse";
import { WheelmartClient, WheelmartError, type WheelmartClient as Client } from "@/lib/wheelmart/client";
import { wheelmartListings } from "@/lib/wheelmart/listings";
import { resetTireListCache } from "@/lib/repair-chat/tires";
import { runTool, type ChatEvent } from "@/lib/repair-chat/tools";
import { runWorkbenchTool, type WorkbenchEvent } from "@/lib/workbench/assistant";
import { optionLinks } from "@/lib/workbench/links";
import type { StaffQuote } from "@/lib/workbench/quote";
import type { CatalogApi } from "@/lib/worldpac/catalog";

function row(code: string, description: string, cost: string, suggested: string, onHand: string, remarks = "") {
  return `<tr data-key="1"><td style="x"> <span class="d-block"><a class="show-lightbox" href="/uploads/a.jpg" data-id="1"><img class="img-thumbnail" src="/uploads/a.jpg"></a></span> <span class="d-block"><a class="img-copy-url" href="#" data-id="1">Copy URL</a></span> </td><td style="x">${code}</td><td style="x">TIRE:17' TIRE:SKU${code}</td><td style="x">${description} <span class="price-toggle make-bold">...</span><span class="make-bold product-price" style="display:none">${cost}</span></td><td style="x">${suggested}</td><td style="x"><span>${onHand}</span></td><td style="x"><span>${remarks}</span></td><td><a class="btn btn-sm btn-success show-quantity-modal" href="#" title="Add" data-id="1">Add to Order</a></td></tr>`;
}

const PAGE = `<html><body><div class="grid-view"><div class="summary">Showing <b>1-5</b> of <b>5</b> items.</div><table class="table"><thead><tr><th>Image</th><th>Size</th></tr></thead><tbody>
${row("2256517102777", "225/65R17 102H GROUND SPEED VOYAGER 777 EV ALL SEASON", "$87.70", "$116.93", "20+")}
${row("2256517102", "225/65R17 102T LANVIGATOR WINTERGRIP HP SNOW", "$93.70", "$124.93", "3")}
${row("22565171066", "225/65R17 106VXL DELINTE AW6 ALL WEATHER", "$89.70", "$119.60", "1", "80,000 KM WARRANTY")}
${row("2256517106", "225/65R17 106VXL LANVIGATOR CATCHFORS ALL WEATHER", "$86.70", "$115.60", "-7")}
${row("17X8", "17X8 ET35 5X114.3 GLOSS BLACK WHEEL", "$120.00", "$160.00", "4")}
</tbody></table></div></body></html>`;

describe("reading Wheel Mart descriptions", () => {
  it.each([
    ["225/65R17 102H GROUND SPEED VOYAGER 777 EV ALL SEASON", { brand: "Ground Speed", size: "225/65R17", load: "102H", season: "all_season", pattern: "VOYAGER 777 EV" }],
    ["205/50R17 93WXL LANVIGTOR CATCHFORS ALL WEATHER", { brand: "Lanvigator", size: "205/50R17", load: "93W XL", season: "all_weather", pattern: "CATCHFORS" }],
    ["225/65R17 102T LANVIGATOR WINTERGRIP HP SNOW", { brand: "Lanvigator", load: "102T", season: "winter", pattern: "WINTERGRIP HP" }],
    ["LT265/70R17 121/118S - 10PR POWERHUB PATH RANGER A/T", { brand: "Powerhub", size: "LT265/70R17", load: "121/118S", season: "off_road" }],
    ["LT33X12.50R17 120Q-10PR LANVIGATOR WARRIOR R/T", { brand: "Lanvigator", size: "LT33X12.50R17", load: "120Q", season: "off_road" }],
    ["35X12.50R22LT 117Q-10PR LANVIGATOR CATCHFORS M/T II ALL SEAS", { size: "35X12.50R22LT", season: "off_road" }],
    ["275/50R20 113XLDELINTE DS2 SUV ALL SEASON", { brand: "Delinte", season: "all_season" }],
    ["255/60R17 ANTARES MAJORIS R1 106H ALL SEAOSN", { brand: "Antares", load: "106H", season: "all_season" }],
    ["255/40R17 ALL SEASON (NO M+S)", { brand: "", season: null }],
    ["LT275/65R20 126/123q 10PR LANVIGATOR ICE-SPIDER II WINTER", { load: "126/123Q", season: "winter" }],
    ["275/55R20 117XL LANVIGATOR WINTERGRIP HUP SNOW", { load: "117 XL", pattern: "WINTERGRIP HUP" }],
    ["ST225/75R15 GLADIATOR QR25 10PLY", { brand: "Gladiator", season: "trailer" }],
  ])("%s", (description, expected) => {
    expect(readDescription(description)).toMatchObject(expected);
  });

  it("turns a size into the digits the search box takes", () => {
    expect(searchDigits("225/65R17")).toBe("2256517");
    expect(searchDigits("LT265/70R17")).toBe("2657017");
    expect(searchDigits("33x12.50R17")).toBe("33125017");
    expect(searchDigits("worn out")).toBeNull();
  });
});

describe("parsing the inventory page", () => {
  it("reads cost, suggested price, stock and remarks, and skips rims", () => {
    const page = parseWheelmartPage(PAGE);
    expect(page.total).toBe(5);
    expect(page.tires).toHaveLength(4);
    expect(page.tires[0]).toMatchObject({ code: "2256517102777", sku: "TIRE:17' TIRE:SKU2256517102777", cost: 87.7, suggested: 116.93, onHand: 20, onHandText: "20+" });
    expect(page.tires[0].description).toBe("225/65R17 102H GROUND SPEED VOYAGER 777 EV ALL SEASON");
    expect(page.tires[2].remarks).toBe("80,000 KM WARRANTY");
    expect(page.tires[3].onHand).toBe(-7);
  });

  it("prices quotable rows at cost × markup", () => {
    const listings = wheelmartListings(parseWheelmartPage(PAGE).tires, 1.3);
    expect(listings.map((l) => [l.brand, l.category, l.price])).toEqual([
      ["Ground Speed", "all_season", 114.01],
      ["Lanvigator", "winter", 121.81],
      ["Delinte", "all_weather", 116.61],
      ["Lanvigator", "all_weather", 112.71],
    ]);
  });

  it("recognises the sign-in page", () => {
    expect(isWheelmartLoginPage('<form id="login-form" action="/auth/login"><input name="LoginForm[password]"></form>')).toBe(true);
    expect(isWheelmartLoginPage(PAGE)).toBe(false);
  });
});

const LOGIN_PAGE = '<form id="login-form" action="/auth/login" method="post"><input type="hidden" name="_csrf" value="tok123"><input name="LoginForm[email]"><input name="LoginForm[password]"></form>';

function fakeSite(options: { password?: string; expireFirstSearch?: boolean } = {}) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  let expired = Boolean(options.expireFirstSearch);
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    const path = new URL(url).pathname;
    if (path === "/auth/login" && method === "GET") return new Response(LOGIN_PAGE, { status: 200, headers: { "set-cookie": "PHPSESSID=s1; path=/" } });
    if (path === "/auth/login" && method === "POST") {
      const ok = new URLSearchParams(init?.body as string).get("LoginForm[password]") === (options.password ?? "right");
      return ok ? new Response(null, { status: 302, headers: { location: "/", "set-cookie": "PHPSESSID=s2; path=/" } }) : new Response(LOGIN_PAGE, { status: 200 });
    }
    if (path === "/") return new Response("<html>home</html>", { status: 200 });
    if (path === "/product/tires") {
      if (expired) {
        expired = false;
        return new Response(null, { status: 302, headers: { location: "/auth/login" } });
      }
      return new Response(PAGE, { status: 200 });
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  return { calls, fetchImpl };
}

describe("Wheel Mart client", () => {
  it("signs in with the form's CSRF token, then searches by size digits", async () => {
    const site = fakeSite();
    const client = new WheelmartClient({ email: "shop@example.com", password: "right" }, site.fetchImpl as unknown as typeof fetch);
    const page = await client.searchBySize("225/65R17");
    expect(page.tires).toHaveLength(4);
    const post = site.calls.find((c) => c.method === "POST")!;
    expect(new URLSearchParams(post.body)).toMatchObject(new URLSearchParams({ _csrf: "tok123", "LoginForm[email]": "shop@example.com", "LoginForm[password]": "right", "LoginForm[rememberMe]": "1" }));
    const search = site.calls.find((c) => c.url.includes("/product/tires"))!;
    expect(new URL(search.url).searchParams.get("ProductSearch[size]")).toBe("2256517");
  });

  it("signs in again once when the session has expired", async () => {
    const site = fakeSite({ expireFirstSearch: true });
    const client = new WheelmartClient({ email: "shop@example.com", password: "right" }, site.fetchImpl as unknown as typeof fetch);
    expect((await client.searchBySize("225/65R17")).tires).toHaveLength(4);
    expect(site.calls.filter((c) => c.method === "POST")).toHaveLength(2);
  });

  it("reports a wrong password without echoing it", async () => {
    const site = fakeSite({ password: "right" });
    const client = new WheelmartClient({ email: "shop@example.com", password: "wrong-secret" }, site.fetchImpl as unknown as typeof fetch);
    const error = await client.searchBySize("225/65R17").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WheelmartError);
    expect((error as WheelmartError).kind).toBe("auth");
    expect((error as Error).message).not.toContain("wrong-secret");
  });
});

const fakeClient = (page = parseWheelmartPage(PAGE)) => ({ searchBySize: vi.fn(async () => page) }) as unknown as Client;
const api: CatalogApi = { get: async () => ({}) as never, post: async () => ({}) as never };

describe("Wheel Mart in the quotes", () => {
  afterEach(() => {
    resetTireListCache();
    delete process.env.TIRE_PRICES_FILE;
    vi.unstubAllEnvs();
  });

  function noPriceList() {
    process.env.TIRE_PRICES_FILE = join(tmpdir(), "no-such-tires.json");
    resetTireListCache();
  }

  it("public assistant: shows tires Wheel Mart has enough of, at the shop's price, never the supplier or cost", async () => {
    noPriceList();
    vi.stubEnv("TIRE_MARKUP", "1.3");
    const out = await runTool(api, "find_tires", { size: "225/65R17", season: "any", count: 4, vehicle_key: null, new_price_over_120k: false }, () => "E-W1", "en", null, () => null, () => fakeClient());
    const cards = out.events.flatMap((e: ChatEvent) => (e.type === "estimate" ? [e.estimate] : []));
    expect(cards[0].kind).toBe("tires");
    // Winter has 3 left and all-weather 1 / -7: only the all-season tire has 4 in stock.
    expect(cards[0].partOptions.map((o) => o.description)).toEqual(["Ground Speed VOYAGER 777 EV 225/65R17 102H"]);
    // 87.70 × 1.3 = 114.01, + eco 6.50 → 121 rounded, + mounting.
    expect(cards[0].partOptions[0].unitListPrice).toBeGreaterThan(121);
    const everything = JSON.stringify(out);
    expect(everything).not.toMatch(/wheel ?mart|87\.7|TIRE:17|WARRANTY/i);
  });

  it("public assistant: without the markup Wheel Mart isn't used", async () => {
    noPriceList();
    const out = await runTool(api, "find_tires", { size: "225/65R17", season: "any", count: 1, vehicle_key: null, new_price_over_120k: false }, () => "E-W2", "en", null, () => null, () => fakeClient());
    const cards = out.events.flatMap((e: ChatEvent) => (e.type === "estimate" ? [e.estimate] : []));
    expect(cards[0].kind).toBe("team_quote");
  });

  it("workbench: lists every Wheel Mart row with real cost, stock and a search link", async () => {
    noPriceList();
    vi.stubEnv("TIRE_MARKUP", "1.3");
    const out = await runWorkbenchTool(api, "find_tires", { size: "225/65R17", season: "any", count: 4 }, () => "W-1", null, () => null, () => null, () => fakeClient());
    const quote = out.events.flatMap((e: WorkbenchEvent) => (e.type === "quote" ? [e.quote] : []))[0] as StaffQuote;
    expect(quote.options).toHaveLength(4);
    const ground = quote.options.find((o) => o.brand === "Ground Speed")!;
    expect(ground.unitCost).toBe(87.7);
    expect(ground.stock).toContain("Wheel Mart 库存 20+");
    expect(quote.options.find((o) => o.stock.includes("0（无货）"))).toBeTruthy();
    const links = optionLinks(quote, ground);
    expect(links[0].label).toBe("Wheel Mart 搜索");
    expect(new URL(links[0].url).searchParams.get("ProductSearch[size]")).toBe("2256517");
  });

  it("workbench card: tires Wheel Mart has none of start unticked for the customer copy", async () => {
    noPriceList();
    vi.stubEnv("TIRE_MARKUP", "1.3");
    const out = await runWorkbenchTool(api, "find_tires", { size: "225/65R17", season: "all_weather", count: 4 }, () => "W-2", null, () => null, () => null, () => fakeClient());
    const quote = out.events.flatMap((e: WorkbenchEvent) => (e.type === "quote" ? [e.quote] : []))[0] as StaffQuote;
    expect(quote.options.map((o) => [o.brand, Boolean(o.outOfStock)])).toEqual([
      ["Lanvigator", true],
      ["Delinte", false],
    ]);
    const writeText = vi.fn(async (text: string) => void text);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<StaffQuoteCard quote={quote} />);
    expect(screen.getByRole("checkbox", { name: /Lanvigator/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Delinte/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "复制客户报价（1 个选项）" }));
    expect(writeText.mock.calls[0][0]).toContain("AW6");
    expect(writeText.mock.calls[0][0]).not.toContain("CATCHFORS");
  });

  it("keeps quoting from the price list when Wheel Mart is down", async () => {
    noPriceList();
    vi.stubEnv("TIRE_MARKUP", "1.3");
    const broken = { searchBySize: vi.fn(async () => Promise.reject(new WheelmartError("down", "upstream"))) } as unknown as Client;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runTool(api, "find_tires", { size: "225/65R17", season: "any", count: 4, vehicle_key: null, new_price_over_120k: false }, () => "E-W3", "en", null, () => null, () => broken);
    expect(out.events.flatMap((e: ChatEvent) => (e.type === "estimate" ? [e.estimate.kind] : []))).toEqual(["team_quote"]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
