/**
 * Snapshot of real estimate-assistant quotes (WorldPac list prices and
 * labor-guide times) used by the public price guide at /auto-repair/prices.
 *
 * Totals are stored exactly as quoted; the page widens them the same way the
 * estimate assistant does (ESTIMATE_SWING) so both show matching ranges.
 * Flat-price services are not listed here: the page reads FLAT_PRICES.
 */
import { FLAT_PRICES } from "@/lib/repair-chat/flat-price";
import { ESTIMATE_SWING } from "@/lib/repair-chat/pricing";

export const PRICE_GUIDE_QUOTED_ON = "2026-10-11/12";

export const priceGuideSystems = ["brakes", "electrical", "engine", "suspension"] as const;
export type PriceGuideSystem = (typeof priceGuideSystems)[number];

export const priceGuideJobs = {
  brakes: ["frontPads", "rearPads", "frontRotors", "rearRotors", "brakeBleed", "masterCylinder"],
  electrical: ["battery", "alternator", "starter"],
  engine: ["thermostat", "coolantTank", "oxygenSensor", "evapCanister", "fuelCap", "driveBelt", "timingBelt", "acCompressor", "cabinFilter"],
  suspension: ["frontStruts", "rearStruts", "strutMount", "swayBarLinks", "cvAxle"],
} as const satisfies Record<PriceGuideSystem, readonly string[]>;

export type PriceGuideJob = (typeof priceGuideJobs)[PriceGuideSystem][number];

export interface PriceGuideQuote {
  job: PriceGuideJob;
  vehicle: string;
  laborHours: number;
  partsLow: number;
  partsHigh: number;
  totalLow: number;
  totalHigh: number;
}

export const priceGuideQuotes: PriceGuideQuote[] = [
  { job: "frontPads", vehicle: "2015 Volkswagen Golf 1.8 L4", laborHours: 1, partsLow: 157, partsHigh: 284, totalLow: 277, totalHigh: 404 },
  { job: "frontPads", vehicle: "2016 Mazda CX-5", laborHours: 0.8, partsLow: 144, partsHigh: 189, totalLow: 240, totalHigh: 285 },
  { job: "frontPads", vehicle: "2017 Honda CR-V EX 1.5 L4", laborHours: 0.9, partsLow: 136, partsHigh: 202, totalLow: 244, totalHigh: 310 },
  { job: "frontPads", vehicle: "2017 Lexus RX350", laborHours: 0.8, partsLow: 110, partsHigh: 196, totalLow: 206, totalHigh: 292 },
  { job: "frontPads", vehicle: "2018 Honda Civic LX 1.5 L4", laborHours: 0.9, partsLow: 132, partsHigh: 175, totalLow: 240, totalHigh: 283 },
  { job: "frontPads", vehicle: "2018 Mercedes-Benz C300", laborHours: 0.9, partsLow: 157, partsHigh: 216, totalLow: 265, totalHigh: 324 },
  { job: "frontPads", vehicle: "2018 Toyota Corolla SE 1.8 L4", laborHours: 0.8, partsLow: 110, partsHigh: 110, totalLow: 206, totalHigh: 206 },
  { job: "frontPads", vehicle: "2018 Toyota RAV4 LE", laborHours: 1, partsLow: 110, partsHigh: 110, totalLow: 230, totalHigh: 230 },
  { job: "frontPads", vehicle: "2019 Nissan Altima", laborHours: 0.9, partsLow: 153, partsHigh: 197, totalLow: 261, totalHigh: 305 },
  { job: "frontPads", vehicle: "2019 Toyota Camry LE 2.5 L4", laborHours: 1.1, partsLow: 159, partsHigh: 186, totalLow: 291, totalHigh: 318 },
  { job: "frontPads", vehicle: "2020 Toyota RAV4 LE", laborHours: 0.8, partsLow: 159, partsHigh: 186, totalLow: 255, totalHigh: 282 },
  { job: "rearPads", vehicle: "2018 Honda Civic LX 1.5 L4", laborHours: 0.9, partsLow: 132, partsHigh: 167, totalLow: 240, totalHigh: 275 },
  { job: "rearPads", vehicle: "2018 Mercedes-Benz C300", laborHours: 0.9, partsLow: 216, partsHigh: 216, totalLow: 324, totalHigh: 324 },
  { job: "rearPads", vehicle: "2019 Toyota Camry LE 2.5 L4", laborHours: 1.1, partsLow: 95, partsHigh: 132, totalLow: 227, totalHigh: 264 },
  { job: "rearPads", vehicle: "2020 Toyota RAV4 LE", laborHours: 1, partsLow: 132, partsHigh: 132, totalLow: 252, totalHigh: 252 },
  { job: "frontRotors", vehicle: "2019–2020 Toyota RAV4 LE", laborHours: 0.7, partsLow: 282, partsHigh: 282, totalLow: 366, totalHigh: 366 },
  { job: "rearRotors", vehicle: "2019–2020 Toyota RAV4 LE", laborHours: 0.8, partsLow: 346, partsHigh: 346, totalLow: 442, totalHigh: 442 },
  { job: "brakeBleed", vehicle: "2017 Honda CR-V EX 1.5 L4", laborHours: 0.9, partsLow: 10, partsHigh: 87, totalLow: 118, totalHigh: 195 },
  { job: "masterCylinder", vehicle: "2017 Honda CR-V EX 1.5 L4", laborHours: 1.6, partsLow: 877, partsHigh: 877, totalLow: 1069, totalHigh: 1069 },
  { job: "battery", vehicle: "2010 Toyota Prius (12 V auxiliary)", laborHours: 0.3, partsLow: 750, partsHigh: 750, totalLow: 786, totalHigh: 786 },
  { job: "battery", vehicle: "2016 Mazda3 2.0 L4", laborHours: 0.3, partsLow: 251, partsHigh: 388, totalLow: 287, totalHigh: 424 },
  { job: "battery", vehicle: "2017 Honda CR-V EX 1.5 L4", laborHours: 0.4, partsLow: 323, partsHigh: 343, totalLow: 371, totalHigh: 391 },
  { job: "battery", vehicle: "2017 Toyota Corolla LE", laborHours: 0.3, partsLow: 388, partsHigh: 388, totalLow: 424, totalHigh: 424 },
  { job: "battery", vehicle: "2019 Ford Escape SE 1.5 L4", laborHours: 0.6, partsLow: 304, partsHigh: 492, totalLow: 376, totalHigh: 564 },
  { job: "battery", vehicle: "2019 Toyota Camry LE 2.5 L4", laborHours: 0.7, partsLow: 211, partsHigh: 492, totalLow: 295, totalHigh: 576 },
  { job: "battery", vehicle: "2020 Toyota RAV4 LE", laborHours: 0.5, partsLow: 211, partsHigh: 492, totalLow: 271, totalHigh: 552 },
  { job: "alternator", vehicle: "2016 Mazda3 2.0 L4", laborHours: 1.6, partsLow: 882, partsHigh: 1504, totalLow: 1074, totalHigh: 1696 },
  { job: "alternator", vehicle: "2016 Toyota Highlander 3.5 V6", laborHours: 3.6, partsLow: 354, partsHigh: 479, totalLow: 786, totalHigh: 911 },
  { job: "alternator", vehicle: "2019 Ford Escape SE 1.5 L4", laborHours: 4, partsLow: 519, partsHigh: 645, totalLow: 999, totalHigh: 1125 },
  { job: "alternator", vehicle: "2020 Toyota RAV4 LE", laborHours: 0.8, partsLow: 654, partsHigh: 802, totalLow: 750, totalHigh: 898 },
  { job: "starter", vehicle: "2015 Nissan Altima 2.5 L4", laborHours: 1.4, partsLow: 591, partsHigh: 591, totalLow: 759, totalHigh: 759 },
  { job: "starter", vehicle: "2017 Toyota Corolla", laborHours: 0.7, partsLow: 521, partsHigh: 521, totalLow: 605, totalHigh: 605 },
  { job: "thermostat", vehicle: "2016 Toyota Highlander 3.5 V6", laborHours: 2.4, partsLow: 48, partsHigh: 67, totalLow: 336, totalHigh: 355 },
  { job: "thermostat", vehicle: "2018 Toyota Camry 2.5 L4", laborHours: 1.6, partsLow: 47, partsHigh: 113, totalLow: 239, totalHigh: 305 },
  { job: "coolantTank", vehicle: "2016 Toyota Highlander", laborHours: 0.5, partsLow: 174, partsHigh: 174, totalLow: 234, totalHigh: 234 },
  { job: "oxygenSensor", vehicle: "2016 Honda Civic LX 2.0 L4", laborHours: 0.5, partsLow: 390, partsHigh: 495, totalLow: 450, totalHigh: 555 },
  { job: "oxygenSensor", vehicle: "2018 Toyota Camry 2.5 L4 (upstream)", laborHours: 1, partsLow: 449, partsHigh: 449, totalLow: 569, totalHigh: 569 },
  { job: "evapCanister", vehicle: "2018 Toyota RAV4", laborHours: 0.8, partsLow: 809, partsHigh: 1091, totalLow: 905, totalHigh: 1187 },
  { job: "fuelCap", vehicle: "2018 Toyota RAV4", laborHours: 0.2, partsLow: 23, partsHigh: 61, totalLow: 47, totalHigh: 85 },
  { job: "driveBelt", vehicle: "2015 Honda Accord Sport 2.4 L4", laborHours: 0.4, partsLow: 50, partsHigh: 50, totalLow: 98, totalHigh: 98 },
  { job: "driveBelt", vehicle: "2018 Toyota Corolla LE", laborHours: 0.6, partsLow: 40, partsHigh: 73, totalLow: 112, totalHigh: 145 },
  { job: "timingBelt", vehicle: "2012 Honda Odyssey EX", laborHours: 3.5, partsLow: 157, partsHigh: 157, totalLow: 577, totalHigh: 577 },
  { job: "acCompressor", vehicle: "2019 Chevrolet Equinox 1.5 L4", laborHours: 3.5, partsLow: 730, partsHigh: 730, totalLow: 1150, totalHigh: 1150 },
  { job: "cabinFilter", vehicle: "2017 Honda CR-V EX 1.5 L4", laborHours: 0.3, partsLow: 49, partsHigh: 50, totalLow: 85, totalHigh: 86 },
  { job: "frontStruts", vehicle: "2015 Honda Accord EX 2.0 L4", laborHours: 1.9, partsLow: 327, partsHigh: 566, totalLow: 555, totalHigh: 794 },
  { job: "frontStruts", vehicle: "2019 Subaru Outback 2.5 H4", laborHours: 2.4, partsLow: 208, partsHigh: 379, totalLow: 496, totalHigh: 667 },
  { job: "rearStruts", vehicle: "2015 Honda Accord EX 2.0 L4", laborHours: 1.6, partsLow: 327, partsHigh: 391, totalLow: 519, totalHigh: 583 },
  { job: "strutMount", vehicle: "2015 Honda Accord EX 2.0 L4 (front)", laborHours: 3.4, partsLow: 239, partsHigh: 239, totalLow: 647, totalHigh: 647 },
  { job: "swayBarLinks", vehicle: "2015 Honda Accord EX 2.0 L4 (front)", laborHours: 0.4, partsLow: 160, partsHigh: 186, totalLow: 208, totalHigh: 234 },
  { job: "cvAxle", vehicle: "2016 Toyota RAV4 LE (front)", laborHours: 2.2, partsLow: 695, partsHigh: 1419, totalLow: 959, totalHigh: 1683 },
];

/** The range a customer sees: same widening and rounding as the estimate assistant. */
export function displayedTotal(quote: Pick<PriceGuideQuote, "totalLow" | "totalHigh">) {
  return {
    low: Math.round(quote.totalLow * (1 - ESTIMATE_SWING)),
    high: Math.round(quote.totalHigh * (1 + ESTIMATE_SWING)),
  };
}

/** Lowest and highest displayed totals for a job across the quoted vehicles. */
export function jobRange(job: PriceGuideJob, include: (quote: PriceGuideQuote) => boolean = () => true) {
  const totals = priceGuideQuotes.filter((q) => q.job === job && include(q)).map(displayedTotal);
  return {
    low: Math.min(...totals.map((t) => t.low)),
    high: Math.max(...totals.map((t) => t.high)),
    vehicles: totals.length,
  };
}

const usd = (amount: number) => `$${amount.toLocaleString("en-CA")}`;

export function formatRange(low: number, high: number): string {
  return low === high ? usd(low) : `${usd(low)}–${usd(high)}`;
}

/** Values for the {placeholders} in the price guide copy. */
export function priceGuideValues(): Record<string, string> {
  const range = (job: PriceGuideJob, include?: (quote: PriceGuideQuote) => boolean) => {
    const r = jobRange(job, include);
    return formatRange(r.low, r.high);
  };
  const hybridAux = (quote: PriceGuideQuote) => quote.vehicle.includes("auxiliary");
  return {
    quotes: String(priceGuideQuotes.length),
    jobs: String(new Set(priceGuideQuotes.map((q) => q.job)).size),
    frontPads: range("frontPads"),
    rearPads: range("rearPads"),
    battery: range("battery", (q) => !hybridAux(q)),
    hybridBattery: range("battery", hybridAux),
    alternator: range("alternator"),
    frontStruts: range("frontStruts"),
    oilCar: usd(FLAT_PRICES.oil.standard.regular),
    oilCarPremium: usd(FLAT_PRICES.oil.premium.regular),
    oilLarge: formatRange(FLAT_PRICES.oil.standard.large, FLAT_PRICES.oil.premium.large),
  };
}

export function fillPriceGuide(text: string, values = priceGuideValues()): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
