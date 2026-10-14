/**
 * Reads DT Tire Hub's tire-size search page (server-rendered SAP Commerce
 * HTML). Each result row carries the dealer cost ("P" in the PDM box), the
 * MSRP, the suggested retail price and stock counts. Only product fields are
 * read; nothing else on the page is kept.
 */

export interface DtTire {
  sku: string;
  productCode: string;
  brand: string;
  model: string;
  /** DT's performance category, e.g. "Ice and snow", "All-season touring". */
  performance: string;
  /** DT's season label, e.g. "Winter", "All-weather", "Summer". */
  season: string;
  size: string;
  /** Load index, speed rating and load range, e.g. "106T XL". */
  serviceDescription: string;
  studding: string;
  /** Dealer cost per tire (the "P" price), CAD. */
  cost: number | null;
  msrp: number | null;
  suggestedRetail: number | null;
  /** Stock counts as DT shows them: "51", "99+", "0". */
  localStock: string;
  warehouseStock: string;
}

export interface DtSearchPage {
  total: number | null;
  tires: DtTire[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function text(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (ENTITIES[name.toLowerCase()]) return ENTITIES[name.toLowerCase()];
      if (name.startsWith("#x")) return String.fromCharCode(parseInt(name.slice(2), 16));
      if (name.startsWith("#")) return String.fromCharCode(Number(name.slice(1)));
      return whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: string): number | null {
  const match = value.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

const first = (html: string, pattern: RegExp) => html.match(pattern)?.[1];

function parseRow(row: string): DtTire | null {
  const sku = text(first(row, /class="sku__value">([\s\S]*?)<\/span>/));
  const productCode = text(first(row, /name="productCodePost"\s+value="([^"]*)"/));
  if (!sku && !productCode) return null;
  // data-table="03477570000-03477570000-CONT-Continental": SKU, SKU, brand code, brand name.
  const brand = text(first(row, /data-table="[^"]*?-[^"]*?-[^"-]*-([^"]+)"/)).replace(/-/g, " ");
  const heading = first(row, /<h3 class="search-results__description">([\s\S]*?)<\/h3>/) ?? "";
  const performance = text(first(heading, /<span class="performance-cat">([\s\S]*?)<\/span>/));
  let model = text(heading.replace(/<span class="performance-cat">[\s\S]*?<\/span>/, "")).replace(/\s*-\s*$/, "");
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) model = model.slice(brand.length).trim();
  const pdmPrices = first(row, /search-results__pdm-prices">([\s\S]*?)<\/ul>/) ?? "";
  const cost = money(text(first(pdmPrices, />\s*P\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/)));
  return {
    sku,
    productCode,
    brand,
    model,
    performance,
    season: text(first(row, /class="c-season__label">([\s\S]*?)<\/span>/)),
    size: text(first(row, /data-product-size="([^"]*)"/)),
    serviceDescription: text(first(row, /Service desc[\s\S]*?<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)),
    studding: text(first(row, /Studding info\.?:[\s\S]*?<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)).replace(/^-$/, ""),
    cost,
    msrp: money(text(first(row, /search-results__price-item--msrp">\s*<p[^>]*>([\s\S]*?)<\/p>/))),
    suggestedRetail: money(text(first(row, /search-results__price-item-suggested">\s*<p[^>]*>([\s\S]*?)<\/p>/))),
    localStock: text(first(row, /on-hand-item--local_count">\s*<p>([\s\S]*?)<\/p>/)),
    warehouseStock: text(first(row, /on-hand-item--warehouse_count">\s*<p>([\s\S]*?)<\/p>/)),
  };
}

export function parseDtSearch(html: string): DtSearchPage {
  const totalText = text(first(html, /class="[^"]*pagination-bar-results[^"]*">([\s\S]*?)<\//));
  const total = totalText.match(/(\d+)\s+product/i);
  const rows = html.split(/<div class="search-results-collapsed-view[^"]*"/).slice(1);
  const tires = rows.map(parseRow).filter((t): t is DtTire => t !== null);
  return { total: total ? Number(total[1]) : null, tires };
}

/** True when the page is DT's sign-in form (the session has expired). */
export function isDtLoginPage(html: string): boolean {
  return /id="loginForm"/.test(html) && /j_spring_security_check/.test(html);
}

/** "51" → 51, "99+" → 99, "" → 0. */
export function stockCount(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}
