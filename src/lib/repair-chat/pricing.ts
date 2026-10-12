import type { PartOption, ServiceQuote } from "@/lib/worldpac/catalog";

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

/** Everything the UI renders. Built only from server-side lookups. */
export interface EstimateCard {
  id: string;
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

/** What the model sees about an estimate: the same numbers, as plain text. */
export function summarizeEstimateForModel(card: EstimateCard): string {
  const lines = [
    `Estimate ${card.id} shown to the customer as a card.`,
    `Vehicle: ${card.vehicle}. Service: ${card.service}${card.position ? ` (${card.position})` : ""}.`,
    `Labor: ${card.laborHours} h × $${card.laborRate}/h = $${card.laborWalkIn}.`,
    card.partOptions.length
      ? `${card.primaryPartName} options (list price): ` +
        card.partOptions
          .map((p) => `${p.description}${p.quantity > 1 ? ` ×${p.quantity}` : ""} $${p.total}`)
          .join("; ") +
        "."
      : card.partsNote || "No list-priced part found; the estimate covers labor only.",
    `Total before tax: $${card.totalLow}–$${card.totalHigh}.`,
  ];
  if (card.laborNote) lines.push(`Labor guide note: ${card.laborNote}`);
  if (card.otherPartNames.length) {
    lines.push(`Other parts sometimes needed (not priced): ${card.otherPartNames.join(", ")}.`);
  }
  return lines.join("\n");
}
