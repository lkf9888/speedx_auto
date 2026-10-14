import { describe, expect, it } from "vitest";
import { optionLinks } from "@/lib/workbench/links";

describe("quote card links", () => {
  it("gives a WorldPac part a speedDIAL copy-and-open button and marketplace searches by part number", () => {
    const links = optionLinks({ kind: "labor", supplier: "worldpac", service: "Brake Pads R&R" }, { brand: "PRO-ACT", label: "Brake Pad Set", partNumber: "ACT866A" });
    expect(links).toEqual([
      { label: "speedDIAL", url: "https://speeddial.worldpac.com/", copy: "ACT866A" },
      { label: "eBay", url: "https://www.ebay.ca/sch/i.html?_nkw=ACT866A" },
      { label: "Amazon", url: "https://www.amazon.ca/s?k=PRO-ACT%20ACT866A" },
      { label: "RockAuto", url: "https://www.rockauto.com/en/partsearch/?partnum=ACT866A" },
    ]);
  });

  it("links a DT tire to DT's search for its SKU and size", () => {
    const [dt, amazon] = optionLinks(
      { kind: "tires", supplier: "dt", service: "新轮胎（含安装）· 225/65R17" },
      { brand: "Michelin", label: "X-ICE SNOW 225/65R17 106T XL", partNumber: "24387" },
    );
    expect(dt.label).toBe("DT Tire Hub");
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
