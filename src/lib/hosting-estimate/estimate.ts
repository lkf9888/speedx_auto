/**
 * What a car would earn its owner under SPEEDX management, for the hosting
 * page's estimate assistant.
 *
 * Ported from TATO's rental-income estimator (tato-admin-mvp,
 * lib/rental-estimate/index.ts), which is fitted on our own completed Turo
 * trips in Metro Vancouver: an average month tracks the car's market value
 * (elasticity ~0.43), adjusted by body style and, where we have run the
 * model ourselves, by what it actually did; a seasonal curve spreads it over
 * the year. `model.json` and `catalog.json` are copies of TATO's files with
 * the fleet totals left out — refresh them when TATO refits.
 *
 * Owners are shown their net: Turo's payout less the management commission.
 * Their own costs (insurance, maintenance, depreciation) are not taken off.
 */
import catalogData from "./catalog.json";
import modelData from "./model.json";

/** SPEEDX's management commission on Turo earnings, taken off every number the owner sees. */
export const MANAGEMENT_COMMISSION = 0.3;

/** Turo Canada will not list a car older than this. */
export const MAX_VEHICLE_AGE = 12;

type Segment = keyof typeof modelData.segEffect;

interface CatalogEntry {
  make: string;
  model: string;
  seg: Segment;
  msrp2024: number;
  from?: number;
  until?: number;
}

const CATALOG = catalogData.models as Record<string, CatalogEntry>;
const M = modelData as unknown as {
  a: number;
  b: number;
  band: { p25: number; p75: number };
  family: Record<Segment, string>;
  season: Record<string, Record<string, number>>;
  segEffect: Record<Segment, number>;
  /** [we have run this model (1/0), multiplier] */
  modelAdj: Record<string, [number, number]>;
};

const BRAND_RETENTION: Record<string, number> = {
  Toyota: 1.22, Honda: 1.18, Subaru: 1.15, Lexus: 1.15, Acura: 1.05, Mazda: 1.05, Porsche: 1.05, Jeep: 1.05,
  Ram: 1.05, GMC: 1.05, Hyundai: 0.98, Kia: 0.98, Ford: 0.95, Chevrolet: 0.95, Nissan: 0.92, Volkswagen: 0.92,
  Dodge: 0.92, Mitsubishi: 0.9, Buick: 0.88, Volvo: 0.85, Audi: 0.85, Genesis: 0.85, Chrysler: 0.85, MINI: 0.85,
  Tesla: 0.85, BMW: 0.82, "Mercedes-Benz": 0.82, INFINITI: 0.82, Cadillac: 0.8, Lincoln: 0.8, Rivian: 0.8,
  smart: 0.75, "Land Rover": 0.72, Fiat: 0.72, Polestar: 0.7, Jaguar: 0.68, "Alfa Romeo": 0.65,
};

/** Same value curve as TATO: steep first year, ~8.5%/year after, floored; brand scales the loss. */
function vehicleValue(entry: CatalogEntry, year: number, now: number): number {
  const msrp = entry.msrp2024 * catalogData.msrpInflation ** (year - catalogData.refYear);
  const age = Math.max(0, now - year);
  if (age === 0) return msrp;
  const base = Math.max(0.85 * 0.915 ** (age - 1), 0.16);
  const retained = 1 - (1 - base) / (BRAND_RETENTION[entry.make] ?? 1);
  return msrp * Math.max(retained, 0.1);
}

// ------------------------------------------------------------------ matching

const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

const MAKE_ALIASES: Record<string, string> = {
  mercedes: "Mercedes-Benz",
  benz: "Mercedes-Benz",
  merc: "Mercedes-Benz",
  vw: "Volkswagen",
  chevy: "Chevrolet",
  landrover: "Land Rover",
  rangerover: "Land Rover",
  alfa: "Alfa Romeo",
  infinity: "INFINITI",
  mini: "MINI",
};

const MAKES = [...new Set(Object.values(CATALOG).map((e) => e.make))];

export function findMake(raw: string): string | null {
  const key = squash(raw);
  if (!key) return null;
  return MAKES.find((m) => squash(m) === key) ?? MAKE_ALIASES[key] ?? MAKES.find((m) => squash(m).startsWith(key) && key.length >= 3) ?? null;
}

/** Models of a make that can still be listed this year, for "did you mean". */
export function listableModels(make: string, now: number): string[] {
  const oldest = now - MAX_VEHICLE_AGE;
  return Object.values(CATALOG)
    .filter((e) => e.make === make && (e.until ?? now + 1) >= oldest)
    .map((e) => e.model)
    .sort((a, b) => a.localeCompare(b, "en"));
}

export function findModel(make: string, raw: string): CatalogEntry | null {
  const key = squash(raw);
  if (!key) return null;
  const models = Object.values(CATALOG).filter((e) => e.make === make);
  return (
    models.find((e) => squash(e.model) === key) ??
    // "RAV4 Hybrid", "CR-V EX-L": the catalogue name is the start of what was typed.
    models
      .filter((e) => key.startsWith(squash(e.model)))
      .sort((a, b) => squash(b.model).length - squash(a.model).length)[0] ??
    null
  );
}

// ------------------------------------------------------------------ estimate

export interface IncomeMonth {
  /** 1-12 */
  month: number;
  year: number;
  /** Owner's net for the month, whole dollars. */
  net: number;
}

/** Everything the owner sees on the report card. Whole dollars, after commission. */
export interface IncomeCard {
  id: string;
  vehicle: string;
  months: IncomeMonth[];
  annualNet: number;
  annualLow: number;
  annualHigh: number;
  monthlyAverage: number;
  /** We have run this model ourselves, rather than estimating from similar cars. */
  observed: boolean;
}

export type EstimateOutcome =
  | { status: "ok"; card: IncomeCard }
  | { status: "unknown_make"; makes: string[] }
  | { status: "unknown_model"; make: string; models: string[] }
  | { status: "too_old"; vehicle: string; oldestYear: number }
  | { status: "not_sold"; vehicle: string; years: string }
  | { status: "bad_year"; year: number };

/**
 * Twelve months of the owner's net income, starting next month, for a car
 * described in words ("Toyota", "RAV4 Hybrid", 2021).
 */
export function estimateIncome(input: { make: string; model: string; year: number }, id: string, today = new Date()): EstimateOutcome {
  const now = today.getFullYear();
  const make = findMake(input.make);
  if (!make) return { status: "unknown_make", makes: MAKES.sort((a, b) => a.localeCompare(b, "en")) };
  const entry = findModel(make, input.model);
  if (!entry) return { status: "unknown_model", make, models: listableModels(make, now) };
  const year = Math.trunc(input.year);
  const label = `${year} ${entry.make} ${entry.model}`;
  if (!Number.isFinite(year) || year < 1980 || year > now + 1) return { status: "bad_year", year };
  if (year < now - MAX_VEHICLE_AGE) return { status: "too_old", vehicle: label, oldestYear: now - MAX_VEHICLE_AGE };
  if ((entry.from && year < entry.from) || (entry.until && year > entry.until)) {
    return { status: "not_sold", vehicle: label, years: `${entry.from ?? "…"}–${entry.until ?? now + 1}` };
  }

  const value = vehicleValue(entry, year, now);
  const [ran, adjustment] = M.modelAdj[`${entry.make}|${entry.model}`] ?? [0, 1];
  const level = Math.exp(M.a + M.b * Math.log(value)) * (M.segEffect[entry.seg] ?? 1) * adjustment;
  const season = M.season[M.family[entry.seg]] ?? M.season.suv;
  const share = 1 - MANAGEMENT_COMMISSION;

  // Twelve months starting next month: the earliest a car could be listed.
  const start = today.getMonth() + 1; // 0-based this month + 1 = next month, 0-based
  const months: IncomeMonth[] = [];
  for (let i = 0; i < 12; i += 1) {
    const absolute = start + i;
    const month = (absolute % 12) + 1;
    const gross = level * (season[String(month)] ?? 1);
    months.push({ month, year: today.getFullYear() + Math.floor(absolute / 12), net: Math.round(gross * share) });
  }
  // The total is the sum of the months shown, so an owner adding up the chart gets the same figure.
  const annual = months.reduce((sum, m) => sum + m.net, 0);
  // As in TATO: the annual band is narrower than a single month's, since a slow month and a busy one partly cancel.
  return {
    status: "ok",
    card: {
      id,
      vehicle: label,
      months,
      annualNet: Math.round(annual),
      annualLow: Math.round(annual * (1 - (1 - M.band.p25) * 0.6)),
      annualHigh: Math.round(annual * (1 + (M.band.p75 - 1) * 0.6)),
      monthlyAverage: Math.round(annual / 12),
      observed: ran > 0,
    },
  };
}

/** What the model is told about a result, in plain English. */
export function describeOutcome(outcome: EstimateOutcome): string {
  switch (outcome.status) {
    case "ok": {
      const c = outcome.card;
      const months = c.months.map((m) => `${m.year}-${String(m.month).padStart(2, "0")} $${m.net}`).join(", ");
      return [
        `Estimate ${c.id} for a ${c.vehicle}, shown to the owner as a report card with a monthly chart.`,
        `Owner's net income over the next 12 months, after the management fee: about $${c.annualNet} (typical range $${c.annualLow}–$${c.annualHigh}), about $${c.monthlyAverage} a month on average.`,
        `By month: ${months}. Summer (July–August) is the busiest, November the slowest.`,
        c.observed ? "SPEEDX has managed this model before." : "Estimated from similar vehicles SPEEDX has managed.",
      ].join("\n");
    }
    case "unknown_make":
      return `Make not recognised. Ask the owner to spell the make. Known makes include: ${outcome.makes.slice(0, 40).join(", ")}.`;
    case "unknown_model":
      return `Model not found for ${outcome.make}. Ask which one it is. ${outcome.make} models we can estimate: ${outcome.models.join(", ") || "(none)"}. If theirs is not listed, say the team will estimate it personally by WhatsApp or phone.`;
    case "too_old":
      return `A ${outcome.vehicle} is too old: Turo Canada only lists cars from ${outcome.oldestYear} or newer. Tell the owner kindly; no estimate.`;
    case "not_sold":
      return `That model year does not match the Canadian ${outcome.vehicle.split(" ").slice(1).join(" ")} (sold ${outcome.years}). Ask the owner to check the year.`;
    case "bad_year":
      return `The year ${outcome.year} is not valid. Ask for the model year.`;
  }
}
