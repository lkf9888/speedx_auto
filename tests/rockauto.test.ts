import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRockAutoCache, parseRockAutoSearch, searchRockAuto } from "@/lib/rockauto/search";
import { optionLinks } from "@/lib/workbench/links";
import { checkRockAuto, mergeRockAuto, needsRockAuto } from "@/lib/workbench/rockauto";
import { buildLaborQuote, supplierLabel, type StaffQuote } from "@/lib/workbench/quote";
import { mergeLordco, mergeWestcan } from "@/lib/workbench/westcan";
import type { StaffPartOption } from "@/lib/worldpac/catalog";

// Kevin, 2026-11-20: RockAuto as one more sourcing channel, priced by part number.
// RockAuto has no API: the page shape below is copied from its real part-search page.

const listing = (n: number, brand: string, part: string, desc: string, category: string, prices: [string, string] | null) => `
<tbody id="listingcontainer[${n}]" class="listing-inner">
 <tr><td class="listing-inner-content"><div class="listing-text-row-moreinfo-truck"><span class="listing-final-manufacturer ">${brand}</span>
 <span class="listing-final-partnumber  as-link-if-js" id="vew_partnumber[${n}]">${part}</span>
 <span class="span-link-underline-remover">${desc}</span></div>
 <div class="listing-text-row"><span class="listing-footnote-text">Category: ${category}</span></div></td>
 ${
   prices
     ? `<td><span id="dprice[${n}][v]">${prices[0]}</span></td><td><span>${prices[1]}</span></td><td>+ Sold in packs of 1</td>`
     : `<td><span>Out of Stock</span></td>`
 }
 </tr></tbody>`;

const PAGE = `<html><body><table>
${listing(1, "GATES", "19150", 'Molded; 5/8" x 26 29/32"', "Heater Hose", ["CAD$31.21", "CAD$0.00"])}
${listing(2, "REMY", "11150", "Remanufactured", "Alternator / Generator", ["CAD$1,426.58", "CAD$104.57"])}
${listing(3, "FVP", "11150", "Remanufactured", "Alternator / Generator", null)}
${listing(4, "AKEBONO", "ACT866A", "Proact Ceramic Pad w/ Stainless Hardware &amp; clips", "Brake Pad", ["CAD$72.76", "CAD$0.00"])}
</table></body></html>`;

describe("parsing RockAuto's part search page", () => {
  it("reads brand, part number, description, category, price and core, and skips out-of-stock rows", () => {
    const rows = parseRockAutoSearch(PAGE);
    expect(rows.map((r) => `${r.brand} ${r.partNumber}`)).toEqual(["GATES 19150", "REMY 11150", "AKEBONO ACT866A"]);
    expect(rows[1]).toMatchObject({ price: 1426.58, core: 104.57, category: "Alternator / Generator" });
    expect(rows[2]).toMatchObject({ price: 72.76, core: 0, description: "Proact Ceramic Pad w/ Stainless Hardware & clips" });
  });

  it("returns nothing for a page it doesn't recognise", () => {
    expect(parseRockAutoSearch("<html>blocked</html>")).toEqual([]);
  });

  it("stays fast on a hostile page (no backtracking on a long run of digits)", () => {
    const hostile = `<tbody id="listingcontainer[1]"><span class="listing-final-manufacturer ">X</span><span class="listing-final-partnumber ">Y</span><span id="dprice[1][v]">CAD$1.${"0".repeat(2_000_000)}</span></tbody>`;
    const started = Date.now();
    parseRockAutoSearch(hostile);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("searching RockAuto", () => {
  beforeEach(() => clearRockAutoCache());

  it("asks the public search page with an honest User-Agent, pauses between requests and caches the answer", async () => {
    const fetchImpl = vi.fn(async () => new Response(new TextEncoder().encode(PAGE), { status: 200 }));
    const sleep = vi.fn(async () => {});
    const first = await searchRockAuto("ACT866A", { fetchImpl: fetchImpl as unknown as typeof fetch, sleep });
    const again = await searchRockAuto("act-866a", { fetchImpl: fetchImpl as unknown as typeof fetch, sleep });
    expect(first).toHaveLength(3);
    expect(again).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.rockauto.com/en/partsearch/?partnum=ACT866A");
    expect(String((init.headers as Record<string, string>)["User-Agent"])).toMatch(/^SpeedXRepairWorkbench/);
  });

  it("treats a 200 block page as a failure and doesn't cache it, but caches a genuine 'no parts' page", async () => {
    const blocked = vi.fn(async () => new Response("<html>Access denied</html>", { status: 200 }));
    const deps = { sleep: async () => {} };
    await expect(searchRockAuto("ACT866A", { ...deps, fetchImpl: blocked as unknown as typeof fetch })).rejects.toThrow("not recognised");
    await expect(searchRockAuto("ACT866A", { ...deps, fetchImpl: blocked as unknown as typeof fetch })).rejects.toThrow();
    expect(blocked).toHaveBeenCalledTimes(2);
    const empty = vi.fn(async () => new Response('<form id="frm_partsearch">No Parts Found</form>', { status: 200 }));
    expect(await searchRockAuto("ACT866A", { ...deps, fetchImpl: empty as unknown as typeof fetch })).toEqual([]);
    expect(await searchRockAuto("ACT866A", { ...deps, fetchImpl: empty as unknown as typeof fetch })).toEqual([]);
    expect(empty).toHaveBeenCalledTimes(1);
  });

  it("doesn't search for something that isn't a part number, and throws when the site refuses", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 403 }));
    const deps = { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: async () => {} };
    expect(await searchRockAuto("!! ..", deps)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(searchRockAuto("ACT866A", deps)).rejects.toThrow("403");
  });
});

const env = {} as NodeJS.ProcessEnv;
const part = (over: Partial<StaffPartOption> = {}): StaffPartOption => ({
  description: "Brake Pad Set",
  series: "",
  listPrice: 150,
  quantity: 1,
  inStockLocally: false,
  note: "",
  prices: { unitPrice: 80 },
  partNumber: "ACT866A",
  brand: "Akebono",
  availability: "Wednesday",
  qtyAvailable: 0,
  fields: {},
  ...over,
});
const quoteWith = (parts: StaffPartOption[]): StaffQuote =>
  buildLaborQuote("2018 Honda Civic", { serviceName: "Brake Pad R&R", position: "Front", laborHours: 1, laborNote: "", primaryPartName: "Brake Pad", otherPartNames: [], partsNote: "", partOptions: parts }, "R-1", env);

const answers = () => new Map([["ACT866A", parseRockAutoSearch(PAGE)]]);

describe("RockAuto on a staff quote", () => {
  it("adds a priced RockAuto option at price × 1.3 next to the WorldPac ordered-in part, never as a customer-visible supplier", () => {
    const q = quoteWith([part()]);
    expect(needsRockAuto(q)).toBe(true);
    const merged = mergeRockAuto(q, answers(), new Date("2026-11-20T10:00:00Z"));
    expect(merged.options).toHaveLength(q.options.length + 1);
    const rock = merged.options.at(-1)!;
    expect(rock).toMatchObject({ source: "rockauto", brand: "AKEBONO", partNumber: "ACT866A", unitCost: 72.76, unitPrice: 114.09, quantity: 1, eta: "到货时间待确认" });
    // (72.76 + $15 shipping estimate) × 1.3 = 114.09, plus 1 h × $120 walk-in labor.
    expect(rock.customerTotal).toBe(234.09);
    expect(rock.costTotal).toBe(87.76);
    expect(rock.fields).toMatchObject({ shipping: 15 });
    expect(merged.rockauto).toMatchObject({ found: 1 });
    expect(merged.notes.join(" ")).toMatch(/RockAuto.*运费估算 \$15/);
    expect(supplierLabel(merged, rock)).toBe("RockAuto · 邮寄（含运费估算）");
    expect(merged.customerText).toContain("234.09");
    expect(merged.customerText).not.toMatch(/RockAuto|72\.76|87\.76/);
    // The WorldPac row is untouched.
    expect(merged.options[0]).toEqual(q.options[0]);
    expect(needsRockAuto(merged)).toBe(false);
  });

  describe("when WorldPac's brand is a description, not a maker (2003 Jaguar X-Type water pump)", () => {
    const pump = parseRockAutoSearch(`${listing(1, "MOTORCRAFT", "PW594", "", "Water Pump", ["CAD$98.54", "CAD$0.00"])}`);
    const jobOf = (parts: StaffPartOption[], service = "Water Pump R&R") =>
      buildLaborQuote("2003 Jaguar X-Type", { serviceName: service, position: "", laborHours: 2, laborNote: "", primaryPartName: "Water Pump", otherPartNames: [], partsNote: "", partOptions: parts }, "R-9", env);

    it("matches the exact number in a category the job is about, and prices it", () => {
      const q = jobOf([part({ partNumber: "PW-594", brand: "100% New" }), part({ partNumber: "PW-594", brand: "OE Replacement - 100% New" }), part({ partNumber: "PW-594", brand: "Techno Polymer Impeller" })]);
      const merged = mergeRockAuto(q, new Map([["PW594", pump]]));
      const rock = merged.options.filter((o) => o.source === "rockauto");
      expect(rock).toHaveLength(1);
      expect(rock[0]).toMatchObject({ brand: "MOTORCRAFT", partNumber: "PW594", unitCost: 98.54 });
      expect(merged.rockauto?.found).toBe(1);
    });

    it("rejects the same number in a category the job isn't about (a clutch kit is not the starter)", () => {
      const rows = parseRockAutoSearch(`${listing(1, "LUK", "17080", "RepSet", "Clutch Kit", ["CAD$428.02", "CAD$0.00"])}${listing(2, "REMY", "17080", "Remanufactured", "Starter Motor", ["CAD$104.41", "CAD$55.87"])}`);
      const starter = jobOf([part({ partNumber: "17080", brand: "100% New" })], "Starter R&R");
      expect(mergeRockAuto(starter, new Map([["17080", rows]])).options.at(-1)).toMatchObject({ source: "rockauto", brand: "REMY", unitCost: 104.41 });
      const brakes = jobOf([part({ partNumber: "17080", brand: "100% New" })], "Brake Pad R&R");
      expect(mergeRockAuto(brakes, new Map([["17080", rows]])).options.some((o) => o.source === "rockauto")).toBe(false);
    });

    it("gives no match when two makers share the number in the right category (two different parts)", () => {
      const rows = parseRockAutoSearch(`${listing(1, "REMY", "11150", "Remanufactured", "Alternator / Generator", ["CAD$426.58", "CAD$0.00"])}${listing(2, "TERREPOWER", "11150", "Remanufactured", "Alternator / Generator", ["CAD$164.44", "CAD$0.00"])}`);
      const q = jobOf([part({ partNumber: "11150", brand: "100% New" })], "Alternator R&R");
      expect(mergeRockAuto(q, new Map([["11150", rows]])).options.some((o) => o.source === "rockauto")).toBe(false);
    });

    it("needs every word of the category, not just 'Pump' (a fuel pump is not the water pump)", () => {
      const fuel = parseRockAutoSearch(listing(1, "AIRTEX", "PW594", "", "Fuel Pump", ["CAD$60.00", "CAD$0.00"]));
      const q = jobOf([part({ partNumber: "PW594", brand: "100% New", description: "Water Pump" })]);
      expect(mergeRockAuto(q, new Map([["PW594", fuel]])).options.some((o) => o.source === "rockauto")).toBe(false);
    });

    it("reads 'Alternator / Generator', 'Oxygen (O2) Sensor' and 'Starter Motor' as the job names them", () => {
      const cases: Array<[string, string, string]> = [
        ["Alternator / Generator", "Alternator R&R", "xx1"],
        ["Oxygen (O2) Sensor", "O2 Sensor R&R", "xx2"],
        ["Oxygen (O2) Sensor", "Oxygen Sensor R&R", "xx3"],
        ["Starter Motor", "Starter R&R", "xx4"],
        ["Brake Pad", "Front Brake Pads R&R", "xx5"],
      ];
      for (const [category, service, number] of cases) {
        const rows = parseRockAutoSearch(listing(1, "MAKER", number, "", category, ["CAD$50.00", "CAD$0.00"]));
        const merged = mergeRockAuto(jobOf([part({ partNumber: number, brand: "Rebuilt" })], service), new Map([[number.toUpperCase(), rows]]));
        expect(merged.options.some((o) => o.source === "rockauto"), `${category} / ${service}`).toBe(true);
      }
    });

    it("doesn't treat a real maker as a description ('555', 'Standard Motor Products'), nor compare a description to a maker ('Premium' vs 'Premium Guard')", () => {
      const arm = parseRockAutoSearch(listing(1, "MEVOTECH", "CK1234", "", "Control Arm", ["CAD$40.00", "CAD$0.00"]));
      for (const brand of ["555", "Standard Motor Products"]) {
        const q = jobOf([part({ partNumber: "CK1234", brand, description: "Control Arm" })], "Control Arm R&R");
        expect(mergeRockAuto(q, new Map([["CK1234", arm]])).options.some((o) => o.source === "rockauto"), brand).toBe(false);
      }
      const oil = parseRockAutoSearch(`${listing(1, "PREMIUM GUARD", "OF1", "", "Oil Filter", ["CAD$8.00", "CAD$0.00"])}${listing(2, "WIX", "OF1", "", "Oil Filter", ["CAD$9.00", "CAD$0.00"])}`);
      const q = jobOf([part({ partNumber: "OF1", brand: "Premium", description: "Oil Filter" })], "Oil Filter R&R");
      expect(mergeRockAuto(q, new Map([["OF1", oil]])).options.some((o) => o.source === "rockauto")).toBe(false);
    });

    it("still needs the same maker when WorldPac names a real one", () => {
      const q = jobOf([part({ partNumber: "PW594", brand: "Gates" })]);
      expect(mergeRockAuto(q, new Map([["PW594", pump]])).options.some((o) => o.source === "rockauto")).toBe(false);
    });
  });

  it("counts shipping once per part number, not per piece", () => {
    const rock = mergeRockAuto(quoteWith([part({ quantity: 2 })]), answers()).options.at(-1)!;
    // (2 × 72.76 + 15) × 1.3 = 208.68 for the two parts.
    expect(rock).toMatchObject({ quantity: 2, costTotal: 160.52, unitPrice: 104.34 });
    expect(rock.customerTotal).toBe(328.68);
  });

  it("matches the exact part number and, when WorldPac names a maker, that maker only", () => {
    const q = quoteWith([part({ partNumber: "11150", brand: "Remy" })]);
    const rows = parseRockAutoSearch(PAGE);
    expect(mergeRockAuto(q, new Map([["11150", rows]])).options.at(-1)).toMatchObject({ source: "rockauto", brand: "REMY", unitCost: 1426.58, core: 104.57 });
    const wrongMaker = quoteWith([part({ partNumber: "11150", brand: "Bosch" })]);
    const none = mergeRockAuto(wrongMaker, new Map([["11150", rows]]));
    expect(none.options).toEqual(wrongMaker.options);
    expect(none.rockauto).toMatchObject({ found: 0, note: "RockAuto 上也没有这些零件号的现货。" });
  });

  it("doesn't take another maker whose name merely contains WorldPac's (ATE vs GATES)", () => {
    const q = quoteWith([part({ partNumber: "19150", brand: "ATE" })]);
    const none = mergeRockAuto(q, new Map([["19150", parseRockAutoSearch(PAGE)]]));
    expect(none.options).toEqual(q.options);
    const ok = quoteWith([part({ partNumber: "ACT866A", brand: "Akebono Brake" })]);
    expect(mergeRockAuto(ok, answers()).options.at(-1)?.source).toBe("rockauto");
  });

  it("gives up on a slow RockAuto at the total deadline instead of waiting for it", async () => {
    const q = quoteWith([part()]);
    const started = Date.now();
    const result = await checkRockAuto(q, { search: () => new Promise(() => {}), timeoutMs: 50 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.rockauto?.note).toMatch(/没查成/);
  });

  it("is not asked when something is local, for a left + right set, or twice", () => {
    expect(needsRockAuto(quoteWith([part({ inStockLocally: true, qtyAvailable: 4, availability: "Local" })]))).toBe(false);
    expect(needsRockAuto(quoteWith([part({ partNumber: "A1 + B2" })]))).toBe(false);
    const done = mergeRockAuto(quoteWith([part()]), answers());
    expect(mergeRockAuto(done, answers())).toBe(done);
  });

  it("a lookup that fails is reported, not hidden as 'no stock', and never throws", async () => {
    const say = vi.fn();
    const q = quoteWith([part()]);
    const result = await checkRockAuto(q, { search: async () => Promise.reject(new Error("RockAuto answered 403")), onProgress: say });
    expect(result.options).toEqual(q.options);
    expect(result.rockauto?.note).toMatch(/没查成/);
    expect(say).toHaveBeenLastCalledWith("RockAuto 这次没查成");
  });

  it("searches at most four part numbers, once each", async () => {
    const parts = ["P1AAA", "P2AAA", "P3AAA", "P4AAA", "P5AAA", "P1AAA"].map((partNumber) => part({ partNumber, brand: "" }));
    const search = vi.fn(async () => []);
    await checkRockAuto(quoteWith(parts), { search });
    expect(search.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(["P1AAA", "P2AAA", "P3AAA", "P4AAA"]);
  });

  it("keeps its rows when Westcan or Lordco answer afterwards, and puts them away when those have local stock", () => {
    const base = mergeRockAuto({ ...quoteWith([part()]), westcan: { lookup: { year: 2018, makeId: 59, make: "Honda", model: "Civic", models: [{ id: 752, vehType: 5 }], engine: "", submodel: "", partTypes: [1896], usages: [61], multiplier: 1 } } }, answers());
    const none = mergeWestcan(base, { status: "ok", rows: [] });
    expect(none.options.some((o) => o.source === "rockauto")).toBe(true);
    const row = { brand: "RS", partNumber: "RS1", partType: "1896", position: "Front", description: "PAD", cost: "40", list: "90", stockHere: 3, stockOther: 0, perCar: "1" };
    const local = mergeWestcan(base, { status: "ok", rows: [row] });
    expect(local.options.some((o) => o.source === "rockauto")).toBe(false);
    const nextDay = mergeWestcan(base, { status: "ok", rows: [{ ...row, stockHere: 0, stockOther: 5 }] });
    expect(nextDay.options.some((o) => o.source === "rockauto")).toBe(true);
    const withLordco = mergeLordco(mergeWestcan(base, { status: "ok", rows: [] }), { status: "ok", rows: [row] });
    expect(withLordco.options.find((o) => o.source === "rockauto")).toMatchObject({ outOfStock: true });
  });

  it("gives the RockAuto option an order button that copies the part number, without a second RockAuto search link", () => {
    const merged = mergeRockAuto(quoteWith([part()]), answers());
    const links = optionLinks(merged, merged.options.at(-1)!);
    expect(links[0]).toEqual({ label: "RockAuto 订货", url: "https://www.rockauto.com/en/partsearch/?partnum=ACT866A", copy: "ACT866A" });
    expect(links.filter((l) => l.label.startsWith("RockAuto"))).toHaveLength(1);
    // A WorldPac part keeps its RockAuto search link.
    expect(optionLinks(merged, merged.options[0]).some((l) => l.label === "RockAuto 搜索")).toBe(true);
  });
});
