/**
 * Wheel Mart rows as tire price-list entries, so the public assistant and the
 * workbench quote them exactly like the partner price list: retail = dealer
 * cost × TIRE_MARKUP (the shop's rule for both wholesalers), then eco fee and
 * mounting on top. The customer side never sees the cost or the supplier.
 */
import type { TireListing } from "@/lib/repair-chat/tires";
import { cachedWheelmartSearch, type WheelmartClient } from "./client";
import type { WheelmartTire } from "./parse";

export interface WheelmartListing extends TireListing {
  cost: number;
  sku: string;
  onHand: number;
  onHandText: string;
  remarks: string;
}

/** The shop's markup on wholesale tire cost (TIRE_MARKUP), or null when it isn't set. */
export function tireMarkup(env: NodeJS.ProcessEnv = process.env): number | null {
  const value = Number(env.TIRE_MARKUP);
  return Number.isFinite(value) && value > 1 ? value : null;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** Rows that can be quoted: a dealer cost, a recognised brand and season. */
export function wheelmartListings(tires: WheelmartTire[], markup: number): WheelmartListing[] {
  return tires
    .filter((t): t is WheelmartTire & { cost: number; season: NonNullable<WheelmartTire["season"]> } => t.cost !== null && t.cost > 0 && t.season !== null && t.brand !== "")
    .map((t) => ({
      category: t.season,
      brand: t.brand,
      size: t.size,
      pattern: t.pattern,
      load: t.load,
      price: cents(t.cost * markup),
      cost: t.cost,
      sku: t.sku,
      onHand: t.onHand,
      onHandText: t.onHandText,
      remarks: t.remarks,
    }));
}

/**
 * Live listings for one size; [] when Wheel Mart or the markup isn't set up,
 * or when the site can't be reached (the price list still answers).
 */
export async function liveWheelmartListings(client: WheelmartClient | null, size: string, markup = tireMarkup()): Promise<WheelmartListing[]> {
  if (!client || !markup) return [];
  try {
    const page = await cachedWheelmartSearch(client, size);
    return wheelmartListings(page.tires, markup);
  } catch (error) {
    console.error("wheelmart search failed", error instanceof Error ? `${error.name}: ${error.message.slice(0, 200)}` : "unknown");
    return [];
  }
}
