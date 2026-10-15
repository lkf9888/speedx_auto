/**
 * VIN decoding with NHTSA's free vPIC service (vpic.nhtsa.dot.gov). It reads
 * what the maker filed for the VIN: engine code and size, cylinders, drive,
 * transmission, trim, fuel and where it was built. Cars sold in both the US
 * and Canada decode fully (Canadian-built ones included); a Canada-only model
 * may come back incomplete, so every field is optional.
 */
import { TtlCache } from "@/lib/worldpac/cache";

const VPIC = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues";
const TIMEOUT_MS = 8_000;

export interface VinSpecs {
  vin: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  series: string;
  /** e.g. "1.8 L, 4 cylinders, In-Line" */
  engine: string;
  /** Manufacturer engine code, e.g. "2ZR-FE", "K20C2". */
  engineCode: string;
  displacementL: number | null;
  cylinders: number | null;
  turbo: boolean;
  /** "FWD", "RWD", "AWD", "4WD" or vPIC's own words. */
  drive: string;
  transmission: string;
  fuel: string;
  /** e.g. "HEV (Hybrid Electric Vehicle)", "" for petrol cars. */
  electrification: string;
  body: string;
  builtIn: string;
  /** vPIC's own warning, e.g. a wrong check digit (the rest may still be right). */
  warning: string;
}

const DRIVES: Record<string, string> = {
  "4x2": "2WD",
  "FWD/Front-Wheel Drive": "FWD",
  "RWD/Rear-Wheel Drive": "RWD",
  "AWD/All-Wheel Drive": "AWD",
  "4WD/4-Wheel Drive/4x4": "4WD",
};

const num = (value: string | undefined) => {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : null;
};

export function cleanVin(vin: string): string | null {
  const clean = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  return clean.length === 17 ? clean : null;
}

/** vPIC's flat result row → the fields an estimate needs. */
export function readVpic(vin: string, row: Record<string, string>): VinSpecs | null {
  if (!row.Make || !row.ModelYear) return null;
  const displacementL = num(row.DisplacementL);
  const cylinders = num(row.EngineCylinders);
  const engine = [
    displacementL ? `${Math.round(displacementL * 10) / 10} L` : "",
    cylinders ? `${cylinders} cylinders` : "",
    row.EngineConfiguration ?? "",
    row.Turbo === "Yes" ? "turbo" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const errorCode = (row.ErrorCode ?? "").split(",")[0].trim();
  return {
    vin,
    year: num(row.ModelYear),
    make: row.Make ? row.Make.charAt(0) + row.Make.slice(1).toLowerCase() : "",
    model: row.Model ?? "",
    trim: row.Trim ?? "",
    series: row.Series ?? "",
    engine,
    engineCode: row.EngineModel ?? "",
    displacementL,
    cylinders,
    turbo: row.Turbo === "Yes",
    drive: DRIVES[row.DriveType ?? ""] ?? row.DriveType ?? "",
    transmission: [row.TransmissionStyle, row.TransmissionSpeeds ? `${row.TransmissionSpeeds}-speed` : ""].filter(Boolean).join(", "),
    fuel: row.FuelTypePrimary ?? "",
    electrification: row.ElectrificationLevel ?? "",
    body: row.BodyClass ?? "",
    builtIn: row.PlantCountry ?? "",
    warning: errorCode && errorCode !== "0" ? (row.ErrorText ?? "").split(";")[0].slice(0, 160) : "",
  };
}

const cache = new TtlCache<VinSpecs | null>(30 * 24 * 60 * 60 * 1000, 2000);

/** Specs for a VIN, or null when it isn't a VIN, vPIC doesn't know it, or vPIC is unreachable. */
export async function decodeVin(vin: string, fetchImpl: typeof fetch = fetch): Promise<VinSpecs | null> {
  const clean = cleanVin(vin);
  if (!clean) return null;
  const hit = cache.get(clean);
  if (hit !== undefined) return hit;
  try {
    const response = await fetchImpl(`${VPIC}/${clean}?format=json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`vPIC returned ${response.status}`);
    const data = (await response.json()) as { Results?: Array<Record<string, string>> };
    const specs = data.Results?.[0] ? readVpic(clean, data.Results[0]) : null;
    cache.set(clean, specs);
    return specs;
  } catch (error) {
    // Not cached: vPIC may simply be busy.
    console.error("vpic decode failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
    return null;
  }
}

/** What the assistant reads: only the fields vPIC filled in. */
export function specsForModel(specs: VinSpecs): Record<string, string> {
  const out: Record<string, string> = {
    year_make_model: [specs.year, specs.make, specs.model].filter(Boolean).join(" "),
    trim: [specs.trim, specs.series].filter(Boolean).join(" / "),
    engine: [specs.engine, specs.engineCode ? `engine code ${specs.engineCode}` : ""].filter(Boolean).join(", "),
    drive: specs.drive,
    transmission: specs.transmission,
    fuel: [specs.fuel, specs.electrification].filter(Boolean).join(", "),
    body: specs.body,
    built_in: specs.builtIn,
    warning: specs.warning,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
}
