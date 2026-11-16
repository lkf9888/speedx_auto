/**
 * Link buttons under each part or tire on a staff quote card. Every link is
 * built here from the part number, brand and size, never written by the
 * assistant, so it can't send staff to a made-up page.
 *
 * WorldPac's speedDIAL keeps the chosen product inside the app (its product
 * page URL is always /product-detail), so a WorldPac part gets "copy the part
 * number and open speedDIAL" plus searches on eBay, Amazon and RockAuto.
 * Searches are entry points, not checked listings: the same part number may
 * not be listed there, or may be listed with another price and shipping.
 */
import { supplierLabel, type StaffQuote, type StaffQuoteOption } from "./quote";
import { usedSearchLinks } from "./used-part";

export interface ProductLink {
  label: string;
  url: string;
  /** Copied to the clipboard before the link opens (speedDIAL has no search URL). */
  copy?: string;
}

export const SPEEDDIAL_URL = "https://speeddial.worldpac.com/";
/** The shop's own Nexpart sign-ins at Westcan and Lordco (the same origins the server logs in to). */
export const WESTCAN_URL = "https://3501660.nexpart.com/";
export const LORDCO_URL = "https://1000027.nexpart.com/";
const DT_SEARCH = "https://dttirehub.ca/touchettestorefront/touchette/en/tireSearch/tire-size/search";
const WHEELMART_SEARCH = "https://wheelmartcanada.ca/product/tires";

const q = encodeURIComponent;

/** Tire size as DT's search takes it: "225/65R17". */
function tireSize(text: string): string {
  return text.match(/\b(?:LT|P)?\d{3}\/\d{2}Z?R\d{2}\b|\b\d{2}[xX*]\d{1,2}(?:\.\d{1,2})?R\d{2}\b/)?.[0]?.toUpperCase() ?? "";
}

export function optionLinks(quote: Pick<StaffQuote, "kind" | "supplier" | "service"> & { vehicle?: string }, option: Pick<StaffQuoteOption, "brand" | "label" | "partNumber"> & { source?: StaffQuoteOption["source"] }): ProductLink[] {
  if (option.source === "used") return usedSearchLinks(quote.vehicle ?? "", option.label.replace(/\s*\(used.*$/, ""));
  const part = option.partNumber.trim();
  if (quote.kind === "labor" && part) {
    const named = [option.brand, part].filter(Boolean).join(" ");
    // Order at the supplier that has it (Kevin, 2026-11-16): the part number is copied, the supplier's page opens, staff add it to the cart and order there.
    const order: ProductLink =
      option.source === "westcan"
        ? { label: "Westcan 订货", url: WESTCAN_URL, copy: part }
        : option.source === "lordco"
          ? { label: "Lordco 订货", url: LORDCO_URL, copy: part }
          : { label: "WorldPac 订货", url: SPEEDDIAL_URL, copy: part };
    return [
      order,
      { label: "eBay 搜索", url: `https://www.ebay.ca/sch/i.html?_nkw=${q(part)}` },
      { label: "Amazon 搜索", url: `https://www.amazon.ca/s?k=${q(named)}` },
      { label: "RockAuto 搜索", url: `https://www.rockauto.com/en/partsearch/?partnum=${q(part)}` },
    ];
  }
  if (quote.kind === "tires" && quote.supplier === "dt") {
    const size = tireSize(`${option.label} ${quote.service}`);
    const model = option.label.replace(/\(带钉\)/, "").replace(size, "").replace(/\s+\d{2,3}[A-Z]{1,2}\b.*$/, "").trim();
    const links: ProductLink[] = [];
    if (part) links.push({ label: "DT 搜索", url: `${DT_SEARCH}?${new URLSearchParams({ tireSize: size, sku: part, season: "ALL", sort: "relevance" })}` });
    links.push({ label: "Amazon 搜索", url: `https://www.amazon.ca/s?k=${q([option.brand, model, size].filter(Boolean).join(" "))}` });
    return links;
  }
  // Only Wheel Mart rows carry a SKU on the partner tire card; its search takes the size digits.
  if (quote.kind === "tires" && quote.supplier === "partner_tires" && part) {
    const digits = tireSize(`${option.label} ${quote.service}`).replace(/\D/g, "");
    if (digits) return [{ label: "Wheel Mart 搜索", url: `${WHEELMART_SEARCH}?${new URLSearchParams({ "ProductSearch[size]": digits })}` }];
  }
  return [];
}

/**
 * One line for ordering this part (staff only: it carries the cost): who sells it, for which car,
 * the part number and quantity, and what the shop pays.
 */
export function orderLine(
  quote: Pick<StaffQuote, "supplier" | "vehicle">,
  option: Pick<StaffQuoteOption, "brand" | "label" | "partNumber" | "quantity" | "unitCost" | "eta" | "outOfStock" | "source">,
): string {
  const supplier = supplierLabel(quote, option) || "供货商未知";
  const part = [option.brand, option.label].filter(Boolean).join(" ");
  const cost = option.unitCost === null ? "" : `｜进价 $${option.unitCost.toFixed(2)}${option.quantity > 1 ? "/个" : ""}`;
  return `${supplier}｜${quote.vehicle && quote.vehicle !== "—" ? quote.vehicle : "车型未填"}｜${part} #${option.partNumber} × ${option.quantity}${cost}`;
}
