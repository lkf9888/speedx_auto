/**
 * New tires the shop sells, from a partner's price list.
 *
 * The list holds retail prices only (no cost, no supplier details) and lives
 * outside this public repo: a Render Secret File named tires.json (Render puts
 * it in /etc/secrets and in the app's root folder), or the path in
 * TIRE_PRICES_FILE. Without it, tire questions go to the team.
 *
 * What a customer sees per tire is one all-in number: retail price plus the
 * BC tire eco fee, rounded to whole dollars, plus the shop's posted tire
 * change price for that tire. The fee is folded in, never shown on its own.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FLAT_PRICES } from "./flat-price";

export type TireSeason = "all_season" | "all_weather" | "winter" | "off_road" | "trailer";

export interface TireListing {
  category: TireSeason | "performance";
  brand: string;
  size: string;
  pattern: string;
  load: string;
  /** Retail price per tire before the eco fee, CAD. */
  price: number;
}

export interface TireOption {
  season: TireSeason;
  brand: string;
  pattern: string;
  size: string;
  load: string;
  /** Tire + eco fee + mounting, whole dollars. */
  perTire: number;
  count: number;
  total: number;
}

function candidatePaths(): string[] {
  if (process.env.TIRE_PRICES_FILE) return [process.env.TIRE_PRICES_FILE];
  return ["/etc/secrets/tires.json", join(process.cwd(), "tires.json")];
}

let reportedMissing = false;

/** BC tire stewardship (eco) fee per passenger / light-truck tire. */
export function ecoFee(now: Date): number {
  return now >= new Date("2027-01-01T08:00:00Z") ? 7 : 6.5;
}

/** Mounting price per tire from the shop's flat price list. */
export function mountingPerTire(listing: Pick<TireListing, "category">, rim: number): number {
  if (listing.category === "off_road") return FLAT_PRICES.tirePerWheel.off_road;
  return rim > 18 ? FLAT_PRICES.tirePerWheel.over_18 : FLAT_PRICES.tirePerWheel.up_to_18;
}

export interface SizeKey {
  key: string;
  rim: number;
}

/**
 * Normalise a tire size so "P225/70R15", "225/70 R15", "LT235/70R16-8PR" and
 * "235/70ZR16 XL" compare on width/aspect/rim, and flotation sizes such as
 * "31*10.50R15LT" or "31x10.5R15" on diameter/width/rim.
 */
export function sizeKey(text: string): SizeKey | null {
  const upper = text.toUpperCase();
  const flotation = upper.replace(/\s+/g, "").match(/(\d{2})[X*×](\d{1,2}(?:\.\d{1,2})?)-?R?(\d{2})/);
  if (flotation) {
    const width = Number(flotation[2]).toFixed(2);
    return { key: `${flotation[1]}X${width}R${flotation[3]}`, rim: Number(flotation[3]) };
  }
  // "225/65R17", "225/65 R17", "225 65 17", "225-65-17", "235/45ZR18"
  const metric = upper.match(/(\d{3})\s*[/\s-]\s*(\d{2})\s*-?\s*Z?R?F?\s*(\d{2})(?!\d)/);
  if (metric) return { key: `${metric[1]}/${metric[2]}R${metric[3]}`, rim: Number(metric[3]) };
  return null;
}

let cached: { path: string; listings: TireListing[] } | null = null;

function isListing(value: unknown): value is TireListing {
  const v = value as Record<string, unknown>;
  return (
    !!v &&
    typeof v.brand === "string" &&
    typeof v.size === "string" &&
    typeof v.pattern === "string" &&
    typeof v.load === "string" &&
    typeof v.price === "number" &&
    v.price > 0 &&
    ["all_season", "all_weather", "winter", "off_road", "trailer", "performance"].includes(String(v.category))
  );
}

/** The price list, or null when the file isn't there (or is broken). */
export function loadTireList(path?: string): TireListing[] | null {
  if (path) return readTireList(path);
  const paths = candidatePaths();
  for (const candidate of paths) {
    const listings = readTireList(candidate);
    if (listings) return listings;
  }
  if (!reportedMissing) {
    reportedMissing = true;
    console.error("tire price list not found; looked in", paths.join(", "));
  }
  return null;
}

function readTireList(path: string): TireListing[] | null {
  if (cached?.path === path) return cached.listings;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) throw new Error("not a list");
    // Copy only the fields we use, so nothing else in the file can travel further.
    const listings = raw.filter(isListing).map(({ category, brand, size, pattern, load, price }) => ({
      category,
      brand,
      size,
      pattern,
      load,
      price,
    }));
    cached = { path, listings };
    return listings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("tire price list unreadable", (error as Error).message);
    }
    return null;
  }
}

export function resetTireListCache(): void {
  cached = null;
  reportedMissing = false;
}

const SEASONS: TireSeason[] = ["all_season", "all_weather", "winter", "off_road"];

/**
 * Up to three options for one size: for a given season the cheapest, a middle
 * one and the dearest; for "any", the cheapest of each season available.
 */
export function findTires(
  listings: TireListing[],
  size: string,
  season: TireSeason | "any",
  count: number,
  now = new Date(),
): TireOption[] {
  const wanted = sizeKey(size);
  if (!wanted) return [];
  const trailer = /^\s*ST/i.test(size);
  const matches = listings
    .filter((l) => sizeKey(l.size)?.key === wanted.key)
    .filter((l) => (trailer ? l.category === "trailer" : l.category !== "trailer" && l.category !== "performance"))
    .filter((l) => trailer || season === "any" || l.category === season)
    .map((l) => {
      const perTire = Math.round(l.price + ecoFee(now)) + mountingPerTire(l, wanted.rim);
      return {
        season: l.category as TireSeason,
        brand: l.brand,
        pattern: l.pattern,
        size: l.size,
        load: l.load,
        perTire,
        count,
        total: perTire * count,
      };
    })
    .sort((a, b) => a.perTire - b.perTire);

  if (season === "any" && !trailer) {
    return SEASONS.map((s) => matches.find((m) => m.season === s)).filter((m): m is TireOption => !!m);
  }
  if (matches.length <= 3) return matches;
  return [matches[0], matches[Math.floor(matches.length / 2)], matches[matches.length - 1]];
}

/** Seasons a size is listed in, so the model can offer what exists. */
export function seasonsForSize(listings: TireListing[], size: string): TireSeason[] {
  const wanted = sizeKey(size);
  if (!wanted) return [];
  const found = new Set(
    listings.filter((l) => sizeKey(l.size)?.key === wanted.key).map((l) => l.category),
  );
  return SEASONS.filter((s) => found.has(s));
}
