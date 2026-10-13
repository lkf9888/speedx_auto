import type { PartOption, ServiceQuote } from "@/lib/worldpac/catalog";
import { flatWord, flatWordEn, type FlatQuote } from "./flat-price";
import type { TireOption } from "./tires";

/** Posted shop labor rate for walk-in customers, CAD per hour. */
export const WALK_IN_LABOR_RATE = 120;
/** Customers referred by an existing customer pay 80% of the labor rate. */
export const REFERRAL_LABOR_MULTIPLIER = 0.8;

export interface EstimatePartOption {
  description: string;
  series: string;
  unitListPrice: number;
  quantity: number;
  total: number;
  inStockLocally: boolean;
  note: string;
}

/**
 * labor: labor-guide time × rate + parts list price (the default).
 * flat: the shop's posted flat price (oil change, tires, A/C recharge).
 * team_quote: no price; the customer is asked to contact the team.
 */
export type EstimateKind = "labor" | "flat" | "tires" | "team_quote";

/** Everything the UI renders. Built only from server-side lookups. */
export interface EstimateCard {
  id: string;
  /** Missing on cards made before flat prices existed: treat as "labor". */
  kind?: EstimateKind;
  vehicle: string;
  service: string;
  position: string;
  laborHours: number;
  laborRate: number;
  laborWalkIn: number;
  laborReferral: number;
  primaryPartName: string;
  partOptions: EstimatePartOption[];
  partsLow: number;
  partsHigh: number;
  totalLow: number;
  totalHigh: number;
  referralTotalLow: number;
  referralTotalHigh: number;
  laborNote: string;
  otherPartNames: string[];
  partsNote: string;
  createdAt: string;
}

const money = (value: number) => Math.round(value * 100) / 100;

/** Labor-based estimates are shown widened by this much each way: the shop's final price can differ. */
export const ESTIMATE_SWING = 0.1;

/** Whole-dollar ranges a customer sees on the card, and that the assistant may quote. */
export interface EstimateRanges {
  partsLow: number;
  partsHigh: number;
  totalLow: number;
  totalHigh: number;
}

export function estimateRanges(card: EstimateCard): EstimateRanges {
  const partsLow = Math.round(card.partsLow);
  const partsHigh = Math.round(card.partsHigh);
  // Flat prices are the shop's posted prices, so only labor-based totals get the allowance.
  if (card.kind === "flat" || card.kind === "tires" || card.kind === "team_quote") {
    return { partsLow, partsHigh, totalLow: Math.round(card.totalLow), totalHigh: Math.round(card.totalHigh) };
  }
  return {
    partsLow,
    partsHigh,
    totalLow: Math.round(card.totalLow * (1 - ESTIMATE_SWING)),
    totalHigh: Math.round(card.totalHigh * (1 + ESTIMATE_SWING)),
  };
}

export function laborCost(hours: number, referral = false): number {
  const rate = referral ? WALK_IN_LABOR_RATE * REFERRAL_LABOR_MULTIPLIER : WALK_IN_LABOR_RATE;
  return money(hours * rate);
}

export function buildEstimate(
  vehicle: string,
  quote: Extract<ServiceQuote, { status: "ok" }>,
  id: string,
  now = new Date(),
): EstimateCard {
  const partOptions: EstimatePartOption[] = quote.partOptions.map((p: PartOption) => ({
    description: p.description,
    series: p.series,
    unitListPrice: p.listPrice,
    quantity: p.quantity,
    total: money(p.listPrice * p.quantity),
    inStockLocally: p.inStockLocally,
    note: p.note,
  }));
  const totals = partOptions.map((p) => p.total);
  const partsLow = totals.length ? Math.min(...totals) : 0;
  const partsHigh = totals.length ? Math.max(...totals) : 0;
  const laborWalkIn = laborCost(quote.laborHours);
  const laborReferral = laborCost(quote.laborHours, true);
  return {
    id,
    kind: "labor",
    vehicle,
    service: quote.serviceName,
    position: quote.position,
    laborHours: quote.laborHours,
    laborRate: WALK_IN_LABOR_RATE,
    laborWalkIn,
    laborReferral,
    primaryPartName: quote.primaryPartName,
    partOptions,
    partsLow,
    partsHigh,
    totalLow: money(partsLow + laborWalkIn),
    totalHigh: money(partsHigh + laborWalkIn),
    referralTotalLow: money(partsLow + laborReferral),
    referralTotalHigh: money(partsHigh + laborReferral),
    laborNote: quote.laborNote,
    otherPartNames: quote.otherPartNames,
    partsNote: quote.partsNote ?? "",
    createdAt: now.toISOString(),
  };
}

const emptyPrices = {
  laborHours: 0,
  laborRate: WALK_IN_LABOR_RATE,
  laborWalkIn: 0,
  laborReferral: 0,
  laborNote: "",
  otherPartNames: [] as string[],
};

/** Card for one of the shop's flat-price services, worded in the page language. */
export function buildFlatEstimate(
  vehicle: string,
  quote: Extract<FlatQuote, { status: "ok" }>,
  locale: string,
  id: string,
  now = new Date(),
): EstimateCard {
  const partOptions: EstimatePartOption[] = quote.options.map((o) => ({
    description: flatWord(locale, o.code),
    series: o.code,
    unitListPrice: o.unitPrice,
    quantity: o.quantity,
    total: money(o.unitPrice * o.quantity),
    inStockLocally: false,
    note: "",
  }));
  const totals = partOptions.map((p) => p.total);
  const low = Math.min(...totals);
  const high = Math.max(...totals);
  const noteKey = quote.service === "oil_change" ? "oil_note" : quote.service === "tire_change" ? "tire_note" : "ac_note";
  return {
    id,
    kind: "flat",
    vehicle,
    service: flatWord(locale, quote.service),
    position: quote.size ? flatWord(locale, quote.size) : "",
    ...emptyPrices,
    primaryPartName: "",
    partOptions,
    partsLow: low,
    partsHigh: high,
    totalLow: low,
    totalHigh: high,
    referralTotalLow: low,
    referralTotalHigh: high,
    partsNote: flatWord(locale, noteKey),
    createdAt: now.toISOString(),
  };
}

/** Card for new tires: one all-in price per tire (tire, fees, mounting) × count. */
export function buildTireEstimate(
  vehicle: string,
  service: string,
  options: TireOption[],
  note: string,
  id: string,
  now = new Date(),
): EstimateCard {
  const partOptions: EstimatePartOption[] = options.map((o) => ({
    description: [o.brand, o.pattern, o.size, o.load].filter(Boolean).join(" "),
    series: o.season,
    unitListPrice: o.perTire,
    quantity: o.count,
    total: o.total,
    inStockLocally: false,
    note: "",
  }));
  const totals = partOptions.map((p) => p.total);
  const low = Math.min(...totals);
  const high = Math.max(...totals);
  return {
    id,
    kind: "tires",
    vehicle,
    service,
    position: "",
    ...emptyPrices,
    primaryPartName: "",
    partOptions,
    partsLow: low,
    partsHigh: high,
    totalLow: low,
    totalHigh: high,
    referralTotalLow: low,
    referralTotalHigh: high,
    partsNote: note,
    createdAt: now.toISOString(),
  };
}

/** Card with no price that asks the customer to contact the team for a quote. */
export function buildTeamQuoteCard(
  vehicle: string,
  service: string,
  reason: string,
  id: string,
  now = new Date(),
): EstimateCard {
  return {
    id,
    kind: "team_quote",
    vehicle,
    service,
    position: "",
    ...emptyPrices,
    primaryPartName: "",
    partOptions: [],
    partsLow: 0,
    partsHigh: 0,
    totalLow: 0,
    totalHigh: 0,
    referralTotalLow: 0,
    referralTotalHigh: 0,
    partsNote: reason,
    createdAt: now.toISOString(),
  };
}

/**
 * What the model sees about an estimate: the same numbers, as plain text.
 * Every total the customer might ask about is computed here, so the model
 * only ever repeats numbers and never adds them up itself.
 */
export function summarizeEstimateForModel(card: EstimateCard): string {
  if (card.kind === "team_quote") {
    return [
      `Card ${card.id} shown to the customer: "${card.service}" for ${card.vehicle} has no online price and needs a quote from the team.`,
      `Reason (internal): ${card.partsNote}`,
      "Tell the customer briefly that the team will confirm the price by WhatsApp or phone (buttons on the card). Do not give or guess any price for this job.",
    ].join("\n");
  }
  if (card.kind === "tires") {
    return [
      `Tire estimate ${card.id} shown to the customer as a card.`,
      `Vehicle: ${card.vehicle}. ${card.service}.`,
      "Options (price per tire includes the tire, fees and mounting; before tax): " +
        card.partOptions
          .map((p) => `${p.description} (${p.series.replace("_", " ")}): $${p.unitListPrice} per tire × ${p.quantity} = $${p.total}`)
          .join("; ") +
        ".",
      "Quote only these per-tire and total figures; do not split them into tire, fee and labor. These are good-value brands. Stock and delivery time are confirmed by the shop.",
    ].join("\n");
  }
  if (card.kind === "flat") {
    const lines = [
      `Flat-price estimate ${card.id} shown to the customer as a card.`,
      `Vehicle: ${card.vehicle}. Service: ${card.service}${card.position ? ` (${card.position})` : ""}.`,
      "Options (shop flat price, before tax): " +
        card.partOptions
          .map(
            (p) =>
              `${flatWordEn(p.series)} ${p.quantity > 1 ? `$${p.unitListPrice} × ${p.quantity} = ` : ""}$${p.total}`,
          )
          .join("; ") +
        ".",
      `Total before tax: ${card.totalLow === card.totalHigh ? `$${card.totalLow}` : `$${card.totalLow}–$${card.totalHigh} depending on the option`}.`,
    ];
    if (card.partsNote) lines.push(`Note shown on the card: ${card.partsNote}`);
    return lines.join("\n");
  }
  const shown = estimateRanges(card);
  const lines = [
    `Estimate ${card.id} shown to the customer as a paper-style quote card that shows ranges only.`,
    `Vehicle: ${card.vehicle}. Service: ${card.service}${card.position ? ` (${card.position})` : ""}.`,
    `Labor on the card: $${card.laborWalkIn} (${card.laborHours} h of labor-guide time).`,
    card.partOptions.length
      ? `${card.primaryPartName}: ${card.partOptions.length} option${card.partOptions.length > 1 ? "s" : ""} at list price, shown on the card only as the span $${shown.partsLow}–$${shown.partsHigh}. The card does not list the individual parts, so do not name them or give their separate prices.`
      : card.partsNote || "No list-priced part found; the estimate covers labor only.",
    `Estimated total on the card (before tax, with a 10% allowance either way): $${shown.totalLow}–$${shown.totalHigh}. Quote only this range, never a single exact figure.`,
  ];
  if (card.laborNote) lines.push(`Labor guide note: ${card.laborNote}`);
  if (card.otherPartNames.length) {
    lines.push(`Other parts sometimes needed (not priced): ${card.otherPartNames.join(", ")}.`);
  }
  return lines.join("\n");
}
