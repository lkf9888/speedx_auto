/**
 * Choosing DT Tire Hub rows for a quote, shared by the staff workbench (with
 * cost) and the public assistant (customer price only, supplier never named).
 */
import { TtlCache } from "@/lib/worldpac/cache";
import type { DtSearch, DtSeasonFilter, DtTireClient } from "./client";
import type { DtSearchPage, DtTire } from "./parse";

/** Our season names → DT's filter, plus the season label each row must carry (DT's filters overlap). */
export const DT_SEASONS: Record<string, { filter: DtSeasonFilter; label: RegExp | null }> = {
  all_season: { filter: "SUMMER", label: /^all[- ]season/i },
  all_weather: { filter: "AW", label: /^all[- ]weather/i },
  winter: { filter: "WINTER", label: /^winter/i },
  summer: { filter: "SUMMER", label: /^summer/i },
  any: { filter: "ALL", label: null },
};

export const brandKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export const isStudded = (t: DtTire) => /stud/i.test(t.studding) || /STUDDED/i.test(t.model);

export interface DtFilters {
  studs?: string;
  skus?: string[];
}

/**
 * Rows that can be quoted for the request: priced (MSRP), the asked season and
 * brand (DT appends other brands' "related products" after a brand search),
 * studs and SKUs as asked. Order is DT's: in stock first, cheapest first.
 */
export function pickDtTires(tires: DtTire[], season: string, brand: string | undefined, filters: DtFilters, max: number): DtTire[] {
  const wanted = DT_SEASONS[season] ?? DT_SEASONS.any;
  const skus = (filters.skus ?? []).map((sku) => sku.trim().replace(/^#/, "")).filter(Boolean);
  return tires
    .filter((t) => t.msrp !== null && t.msrp > 0)
    .filter((t) => !brand || brandKey(t.brand) === brandKey(brand))
    .filter((t) => (filters.studs === "exclude" ? !isStudded(t) : filters.studs === "only" ? isStudded(t) : true))
    .filter((t) => skus.length === 0 || skus.includes(t.sku))
    .filter((t) => !wanted.label || wanted.label.test(t.season))
    .slice(0, max);
}

const caches = new WeakMap<DtTireClient, TtlCache<DtSearchPage>>();

/** DT search results are reused for 10 minutes, so busy hours don't hammer DT. */
export function cachedDtSearch(client: DtTireClient, search: DtSearch): Promise<DtSearchPage> {
  let cache = caches.get(client);
  if (!cache) {
    cache = new TtlCache<DtSearchPage>(10 * 60_000, 500);
    caches.set(client, cache);
  }
  const key = [search.size.toUpperCase().replace(/\s+/g, ""), search.season, brandKey(search.brand ?? ""), search.sort ?? ""].join("|");
  return cache.getOrLoad(key, () => client.searchBySize(search));
}
