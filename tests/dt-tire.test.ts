import { describe, expect, it } from "vitest";
import { DtTireClient, DtTireError } from "@/lib/dt-tire/client";
import { mountingPerTire } from "@/lib/repair-chat/tires";
import { isDtLoginPage, parseDtSearch, stockCount } from "@/lib/dt-tire/parse";
import { brandTireOptions, runWorkbenchTool } from "@/lib/workbench/assistant";
import type { StaffQuote } from "@/lib/workbench/quote";
import type { CatalogApi } from "@/lib/worldpac/catalog";

// Markup copied from DT Tire Hub's search page, with made-up products and prices.
function row(o: { sku: string; brandCode: string; brand: string; model: string; perf: string; season: string; size: string; svc: string; stud?: string; cost: string; msrp: string; local: string; other: string }) {
  return `
<div class="search-results-collapsed-view">
  <button class="c-view-more__link" data-ajaxurl="/touchettestorefront/touchette/en/p/tire/${o.sku}.${o.brandCode}?season=x"></button>
  <span class="c-season__label">${o.season}</span> <span class="sr-only">&nbsp;tire</span>
  <h3 class="search-results__description">
    ${o.brand} ${o.model}&nbsp; -
    <span class="performance-cat">${o.perf}</span>
  </h3>
  <div class="search-results__product-info"><div class="product-identifiers"><div class="sku js-product-sku " data-sku="${o.sku}"><span> SKU:&nbsp;</span> <span class="sku__value">${o.sku}</span></div></div></div>
  <div class="js-product-info" data-product-size="${o.size}"><dl class="col-sm-12 col-md-6">
    <dt> Size:&nbsp;</dt> <dd> ${o.size}</dd>
    <dt> <span class="info-label"> Service desc.<span class="icon-info" title="Service description"></span> :&nbsp;</span> </dt> <dd> ${o.svc.replace(" ", "&nbsp;")}</dd>
    <dt> Sidewall:&nbsp;</dt> <dd> BSW</dd></dl>
    <dl><dt>Homologation:&nbsp;</dt> <dd> - </dd> <dt>Studding info.:&nbsp;</dt> <dd> ${o.stud ?? "-"} </dd></dl></div>
  <div class="search-results__pdm center "><div class="pdm-container "><div class="c-pdm__prices">
    <ul class="search-results__pdm-content search-results__pdm-prices">
      <li> <span class="search-results__pdm-content-label">P</span> <span class="search-results__pdm-content-value nobreak">${o.cost}</span> </li>
      <li> <span class="search-results__pdm-content-label">D</span> <span class="search-results__pdm-content-value nobreak">40.00%&nbsp;</span> </li>
    </ul>
    <ul class="search-results__pdm-content search-results__pdm-codes">
      <li> <span class="search-results__pdm-content-label">P</span> <span class="search-results__pdm-content-value nobreak">0100</span> </li>
    </ul></div></div></div>
  <div class="search-results__price"><div class="search-results__price-container">
    <div class="search-results__price-item search-results__price-item--msrp"> <p class="search-results__price-value nobreak">${o.msrp}</p> <p class="search-results__price-label no-margin"> MSRP</p> </div>
    <div class="search-results__price-item search-results__price-item-suggested"> <p class="search-results__price-value nobreak">${o.msrp}</p> <p class="search-results__price-label no-margin">Suggested retail price</p> </div>
  </div></div>
  <div class="search-results__on-hand">
    <div class="search-results__on-hand-item search-results__on-hand-item--local_count"> <p>${o.local}</p> <label class="search-results__on-hand-label"> Available locally </label> </div>
    <div class="search-results__on-hand-item search-results__on-hand-item--warehouse_count"> <p>${o.other}</p> <label class="search-results__on-hand-label"> Available in other warehouses </label> </div>
  </div>
  <input type="hidden" class="productCodePost" name="productCodePost" value="${o.sku}.${o.brandCode}"/>
  <button class="btn viewETA" data-table="${o.sku}-${o.sku}-${o.brandCode}-${o.brand.replace(/ /g, "-")}" data-target="#x">Get ETA</button>
</div>`;
}

const WINTER = { sku: "1001", brandCode: "MICH", brand: "Michelin", model: "X-ICE SNOW", perf: "Ice and snow", season: "Winter", size: "225/65R17", svc: "106T XL", cost: "$180.00", msrp: "$300.00", local: "12", other: "99+" };
const STUDDED = { ...WINTER, sku: "1002", brandCode: "CONT", brand: "Continental", model: "ICECONTACT XTRM", stud: "Pre-studded", cost: "$1,050.50", msrp: "$1,400.00", local: "0", other: "4" };
const ALL_WEATHER = { ...WINTER, sku: "1003", brandCode: "BFG", brand: "BF Goodrich", model: "TRAIL-TERRAIN T/A", perf: "All-terrain", season: "All-Weather", cost: "$200.00", msrp: "$350.00" };
const NO_MSRP = { ...WINTER, sku: "1004", msrp: "" };

const page = (rows: string[], total = rows.length) => `<html><body>
  <h2 class="style-reset pagination-bar-results">${total} product(s) found for "225/65R17"</h2>
  ${rows.join("\n")}
</body></html>`;

describe("DT search page", () => {
  it("reads brand, model, cost, MSRP and stock from each row", () => {
    const result = parseDtSearch(page([row(WINTER), row(STUDDED), row(ALL_WEATHER)], 256));
    expect(result.total).toBe(256);
    expect(result.tires).toHaveLength(3);
    expect(result.tires[0]).toEqual({
      sku: "1001",
      productCode: "1001.MICH",
      brand: "Michelin",
      model: "X-ICE SNOW",
      performance: "Ice and snow",
      season: "Winter",
      size: "225/65R17",
      serviceDescription: "106T XL",
      studding: "",
      cost: 180,
      msrp: 300,
      suggestedRetail: 300,
      localStock: "12",
      warehouseStock: "99+",
    });
    expect(result.tires[1]).toMatchObject({ brand: "Continental", studding: "Pre-studded", cost: 1050.5, msrp: 1400, localStock: "0" });
    expect(result.tires[2]).toMatchObject({ brand: "BF Goodrich", model: "TRAIL-TERRAIN T/A", season: "All-Weather" });
  });

  it("recognises the sign-in page and DT's stock counts", () => {
    expect(isDtLoginPage('<form id="loginForm" action="/x/j_spring_security_check" method="post">')).toBe(true);
    expect(isDtLoginPage(page([row(WINTER)]))).toBe(false);
    expect([stockCount("51"), stockCount("99+"), stockCount("")]).toEqual([51, 99, 0]);
  });
});

describe("DT staff tire options", () => {
  const tires = parseDtSearch(page([row(WINTER), row(STUDDED), row(ALL_WEATHER), row(NO_MSRP)])).tires;
  const now = new Date("2026-10-14T18:00:00Z");

  it("prices at MSRP, keeps only the asked season and drops rows without an MSRP", () => {
    const winter = brandTireOptions(tires, "winter", 17, now);
    expect(winter.map((o) => o.sku)).toEqual(["1001", "1002"]);
    expect(winter[0]).toMatchObject({ retail: 300, cost: 180, eco: 6.5, season: "冬季", stock: "DT 本地 12 / 其他仓 99+" });
    expect(winter[1].pattern).toBe("ICECONTACT XTRM (带钉)");
    expect(brandTireOptions(tires, "any", 17, now).map((o) => o.sku)).toEqual(["1001", "1002", "1003"]);
  });

  it("drops the other brands DT appends after a brand search", () => {
    const michelin = brandTireOptions(tires, "winter", 17, now, "michelin");
    expect(michelin.map((o) => o.brand)).toEqual(["Michelin"]);
    expect(brandTireOptions(tires, "any", 17, now, "BFGoodrich").map((o) => o.sku)).toEqual(["1003"]);
  });

  it("charges the bigger-rim and off-road mounting prices", () => {
    const [winter] = brandTireOptions(tires, "winter", 17, now);
    const [winterBig] = brandTireOptions(tires, "winter", 20, now);
    const [offRoad] = brandTireOptions(tires, "all_weather", 17, now);
    expect(winterBig.mounting).toBeGreaterThan(winter.mounting);
    expect(offRoad.mounting).toBeGreaterThanOrEqual(winter.mounting);
  });
});

// ------------------------------------------------------------------ client

const LOGIN_PAGE = `<form id="loginForm" action="/touchettestorefront/touchette/en/j_spring_security_check" method="post">
  <input id="j_username" name="j_username" type="text" value=""/>
  <input type="hidden" name="CSRFToken" value="csrf-123" /></form>
  <form id="lang-form-list"><input type="hidden" name="CSRFToken" value="csrf-123" /></form>`;

function fakeDt(opts: { password?: string; expireAfterSearches?: number } = {}) {
  const calls: Array<{ method: string; path: string; body: string; cookie: string }> = [];
  let session = "";
  let searches = 0;
  const reply = (status: number, body = "", headers: Record<string, string> = {}) => new Response(status === 302 ? null : body, { status, headers });
  const fetchImpl = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    const cookie = headers.Cookie ?? "";
    calls.push({ method: init.method ?? "GET", path: url.pathname + url.search, body: String(init.body ?? ""), cookie });
    if (url.pathname.endsWith("/login")) return reply(200, LOGIN_PAGE, { "set-cookie": "JSESSIONID=anon; Path=/" });
    if (url.pathname.endsWith("/j_spring_security_check")) {
      const form = new URLSearchParams(String(init.body));
      if (form.get("CSRFToken") !== "csrf-123" || !cookie.includes("JSESSIONID=anon")) return reply(403);
      if (form.get("j_password") !== (opts.password ?? "right")) return reply(302, "", { location: "/touchettestorefront/touchette/en/login?error=true" });
      session = `s${calls.length}`;
      return reply(302, "", { location: "/touchettestorefront/touchette/en/", "set-cookie": `JSESSIONID=${session}; Path=/; HttpOnly` });
    }
    if (url.pathname.endsWith("/en/")) return reply(200, "<html>home</html>");
    if (url.pathname.includes("/tireSearch/")) {
      searches += 1;
      if (!session || !cookie.includes(`JSESSIONID=${session}`)) return reply(302, "", { location: "/touchettestorefront/touchette/en/login" });
      if (opts.expireAfterSearches && searches === opts.expireAfterSearches + 1) {
        session = "";
        return reply(302, "", { location: "/touchettestorefront/touchette/en/login" });
      }
      return reply(200, page([row(WINTER)]));
    }
    return reply(404);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("DT client", () => {
  it("signs in with the form's CSRF token, then searches with the session cookie", async () => {
    const dt = fakeDt();
    const client = new DtTireClient({ username: "shop@example.com", password: "right" }, dt.fetchImpl);
    const result = await client.searchBySize({ size: "225/65R17", season: "WINTER", brand: "Michelin" });
    expect(result.tires[0].sku).toBe("1001");
    const search = dt.calls.find((c) => c.path.includes("/tireSearch/"))!;
    expect(search.path).toContain("tireSize=225%2F65R17");
    expect(search.path).toContain("season=WINTER");
    expect(search.path).toContain("manufacturer=Michelin");
    expect(search.path).toContain("sort=tsrpPriceAvailabilityAsc");
    expect(dt.calls.filter((c) => c.path.endsWith("/j_spring_security_check"))).toHaveLength(1);
  });

  it("signs in again when the session expires", async () => {
    const dt = fakeDt({ expireAfterSearches: 1 });
    const client = new DtTireClient({ username: "u", password: "right" }, dt.fetchImpl);
    await client.searchBySize({ size: "225/65R17", season: "ALL" });
    const again = await client.searchBySize({ size: "225/65R17", season: "ALL" });
    expect(again.tires).toHaveLength(1);
    expect(dt.calls.filter((c) => c.path.endsWith("/j_spring_security_check"))).toHaveLength(2);
  });

  it("reports a wrong password or missing settings without echoing them", async () => {
    const dt = fakeDt({ password: "right" });
    const wrong = new DtTireClient({ username: "u", password: "secret-wrong" }, dt.fetchImpl);
    const error = await wrong.searchBySize({ size: "225/65R17", season: "ALL" }).catch((e) => e);
    expect(error).toBeInstanceOf(DtTireError);
    expect(error.kind).toBe("auth");
    expect(String(error.message)).not.toContain("secret-wrong");
    const unset = await new DtTireClient({ username: "", password: "" }, dt.fetchImpl).login().catch((e) => e);
    expect(unset.kind).toBe("config");
  });
});

// ------------------------------------------------------------------ workbench tool

describe("find_brand_tires", () => {
  const catalog = {} as CatalogApi;
  const client = { searchBySize: async () => parseDtSearch(page([row(WINTER), row(STUDDED), row(ALL_WEATHER)], 134)) } as unknown as DtTireClient;

  it("shows a staff card priced at MSRP with DT's cost, and keeps DT out of the customer text", async () => {
    const out = await runWorkbenchTool(catalog, "find_brand_tires", { size: "225/65r17", season: "winter", brand: null, count: null, vehicle_key: null }, () => "W-9", null, () => client);
    expect(out.isError).toBe(false);
    const quote = (out.events[0] as { type: "quote"; quote: StaffQuote }).quote;
    expect(quote.kind).toBe("tires");
    expect(quote.options).toHaveLength(2);
    const [first] = quote.options;
    // MSRP 300 + eco 6.50, rounded, + mounting; four tires.
    expect(first.unitPrice).toBe(Math.round(300 + 6.5) + mountingPerTire({ category: "winter" }, 17));
    expect(first.unitCost).toBe(180);
    expect(first.partNumber).toBe("1001");
    expect(first.customerTotal).toBe(first.unitPrice * 4);
    expect(quote.notes.join(" ")).toContain("DT Tire Hub");
    expect(quote.notes.join(" ")).toContain("134");
    expect(quote.customerText).not.toMatch(/DT|MSRP|进价|180/);
    expect(JSON.parse(out.content).summary).toContain("cost $180");
  });

  it("says when DT is not set up, and rejects an unreadable size", async () => {
    const off = await runWorkbenchTool(catalog, "find_brand_tires", { size: "225/65R17", season: "any", brand: null, count: 4, vehicle_key: null }, () => "W-9", null, () => null);
    expect(JSON.parse(off.content).status).toBe("not_configured");
    const bad = await runWorkbenchTool(catalog, "find_brand_tires", { size: "big ones", season: "any", brand: null, count: 4, vehicle_key: null }, () => "W-9", null, () => client);
    expect(bad.isError).toBe(true);
  });
});
