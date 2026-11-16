import { describe, expect, it } from "vitest";
import { optionLinks } from "@/lib/workbench/links";

describe("quote card links", () => {
  it("gives a WorldPac part a speedDIAL copy-and-open button and marketplace searches by part number", () => {
    const links = optionLinks({ kind: "labor", supplier: "worldpac", service: "Brake Pads R&R" }, { brand: "PRO-ACT", label: "Brake Pad Set", partNumber: "ACT866A" });
    expect(links).toEqual([
      { label: "WorldPac 订货", url: "https://speeddial.worldpac.com/", copy: "ACT866A" },
      { label: "eBay 搜索", url: "https://www.ebay.ca/sch/i.html?_nkw=ACT866A" },
      { label: "Amazon 搜索", url: "https://www.amazon.ca/s?k=PRO-ACT%20ACT866A" },
      { label: "RockAuto 搜索", url: "https://www.rockauto.com/en/partsearch/?partnum=ACT866A" },
    ]);
  });

  it("links a DT tire to DT's search for its SKU and size", () => {
    const [dt, amazon] = optionLinks(
      { kind: "tires", supplier: "dt", service: "新轮胎（含安装）· 225/65R17" },
      { brand: "Michelin", label: "X-ICE SNOW 225/65R17 106T XL", partNumber: "24387" },
    );
    expect(dt.label).toBe("DT 搜索");
    const url = new URL(dt.url);
    expect(url.searchParams.get("sku")).toBe("24387");
    expect(url.searchParams.get("tireSize")).toBe("225/65R17");
    expect(decodeURIComponent(amazon.url)).toBe("https://www.amazon.ca/s?k=Michelin X-ICE SNOW 225/65R17");
  });

  it("shows nothing for the partner tire list (supplier hidden), flat prices, or parts without a number", () => {
    expect(optionLinks({ kind: "tires", supplier: "partner_tires", service: "" }, { brand: "X", label: "Y", partNumber: "" })).toEqual([]);
    expect(optionLinks({ kind: "flat", service: "" }, { brand: "", label: "Oil change", partNumber: "" })).toEqual([]);
    expect(optionLinks({ kind: "labor", service: "" }, { brand: "", label: "仅工时", partNumber: "" })).toEqual([]);
  });
});

// Kevin, 2026-11-16: copy the order and open the supplier's page; staff add to the cart and order themselves.
describe("ordering helpers", () => {
  const base = { brand: "Brembo", label: "Brake Rotor", partNumber: "09.C988.21", quantity: 2, unitCost: 299.42 };
  const wp = { kind: "labor" as const, supplier: "worldpac" as const, service: "Brake Rotor R&R", vehicle: "2021 Porsche Cayenne GTS" };

  it("opens the supplier that has the part", async () => {
    const { LORDCO_URL, WESTCAN_URL } = await import("@/lib/workbench/links");
    expect(optionLinks(wp, { ...base, source: "westcan" })[0]).toEqual({ label: "Westcan 订货", url: WESTCAN_URL, copy: "09.C988.21" });
    expect(optionLinks(wp, { ...base, source: "lordco" })[0]).toEqual({ label: "Lordco 订货", url: LORDCO_URL, copy: "09.C988.21" });
    expect(optionLinks(wp, base)[0]).toMatchObject({ label: "WorldPac 订货", copy: "09.C988.21" });
  });

  it("writes one order line with the supplier, car, part number, quantity and cost", async () => {
    const { orderLine } = await import("@/lib/workbench/links");
    expect(orderLine(wp, { ...base, source: "westcan", eta: "明天到", outOfStock: false })).toBe("Westcan · 其他分店调货｜2021 Porsche Cayenne GTS｜Brembo Brake Rotor #09.C988.21 × 2｜进价 $299.42/个");
    expect(orderLine(wp, { ...base, quantity: 1, unitCost: null, source: undefined, eta: undefined, outOfStock: false })).toContain("WorldPac · 本地有货｜2021 Porsche Cayenne GTS｜Brembo Brake Rotor #09.C988.21 × 1");
  });
});
