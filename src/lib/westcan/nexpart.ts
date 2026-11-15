/**
 * Westcan Auto Parts sells through Nexpart (3501660.nexpart.com). Its prices
 * and stock are only reachable from a signed-in browser (session cookie and a
 * per-page security token), so the lookup itself runs in the staff member's
 * own Chrome through the SPEEDX extension. This module works out, on the
 * server, which Nexpart vehicle and part category to ask for: Nexpart's make,
 * model and position tables are public static files.
 *
 * Nexpart uses ACES IDs, as WorldPac does: the part category is WorldPac's
 * category code without its "N" (N1896 = Disc Brake Rotor = 1896).
 */
import type { VehicleRef } from "@/lib/worldpac/catalog";

const STATIC = "https://staticfiles.nexpart.com";
const VEHICLE_TABLES = `${STATIC}/javascript/acesCatalog/mmV4ES_12.js`;
const POSITION_TABLE = `${STATIC}/_mvc/_lib/_defines/_part_types/PartTypesPositionACES.js`;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the extension needs to look one job up in Nexpart. */
export interface WestcanLookup {
  year: number;
  makeId: number;
  make: string;
  model: string;
  /** Nexpart models with that name (usually one); the page tries them in turn. vehType 5 = car, 6 = truck. */
  models: Array<{ id: number; vehType: number }>;
  /** WorldPac's engine and trim words, matched against Nexpart's list in the page ("2.5 L4" ~ "2.5L L4"). */
  engine: string;
  submodel: string;
  partTypes: number[];
  /** Nexpart position groups for the part type at this position (Front rotor = 61); empty for parts with no position. */
  usages: number[];
  /** Units per job beyond Nexpart's per-car quantity (2 for both sides of a per-side job). */
  multiplier: number;
}

interface VehicleTables {
  makes: Array<{ m: string; i: number }>;
  models: Array<{ m: string; i: number; v?: number[] }>;
  /** Year → make ID → vehicle types: which makes Nexpart has for a year. */
  yearMakes: Record<string, Record<string, number[]>>;
}

type PositionTable = Record<string, Record<string, string>>;

export interface NexpartFetch {
  (url: string): Promise<string>;
}

const defaultFetch: NexpartFetch = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`nexpart static ${response.status}`);
  return response.text();
};

/** The JSON after `var name =` in one of Nexpart's static scripts. */
export function readVar(script: string, name: string): unknown {
  const start = script.indexOf(`var ${name}`);
  if (start < 0) return null;
  const open = script.slice(start).search(/[[{]/);
  if (open < 0) return null;
  const from = start + open;
  const closer = script[from] === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let i = from; i < script.length; i += 1) {
    const ch = script[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === script[from]) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(script.slice(from, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

let vehicleTables: { at: number; value: Promise<VehicleTables | null> } | null = null;
let positionTable: { at: number; value: Promise<PositionTable | null> } | null = null;

function cached<T>(slot: { at: number; value: Promise<T | null> } | null, load: () => Promise<T | null>, now: number) {
  if (slot && now - slot.at < DAY_MS) return slot;
  const value = load().catch(() => null);
  const next = { at: now, value };
  // A failed load is tried again on the next quote, not a day later.
  void value.then((v) => {
    if (v === null && vehicleTables === next) vehicleTables = null;
    if (v === null && positionTable === next) positionTable = null;
  });
  return next;
}

async function loadVehicleTables(get: NexpartFetch): Promise<VehicleTables | null> {
  const script = await get(VEHICLE_TABLES);
  const makes = readVar(script, "makeMap");
  const models = readVar(script, "modelMap");
  const yearMakes = readVar(script, "yearMakeMap");
  if (!Array.isArray(makes) || !Array.isArray(models) || !yearMakes || typeof yearMakes !== "object") return null;
  return { makes, models, yearMakes: yearMakes as VehicleTables["yearMakes"] };
}

async function loadPositionTable(get: NexpartFetch): Promise<PositionTable | null> {
  const table = readVar(await get(POSITION_TABLE), "partTypesPositionsListACES");
  return table && typeof table === "object" ? (table as PositionTable) : null;
}

/** Forget the cached tables (tests). */
export function resetNexpartTables() {
  vehicleTables = null;
  positionTable = null;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Nexpart make and model for a WorldPac vehicle label ("2019 Toyota Camry"): the longest names that fit. */
export function matchVehicle(label: string, tables: VehicleTables): Pick<WestcanLookup, "year" | "makeId" | "make" | "model" | "models"> | null {
  const match = label.trim().match(/^(\d{4})\s+(.+)$/);
  if (!match) return null;
  const year = Number(match[1]);
  const rest = ` ${words(match[2])} `;
  const byYear = tables.yearMakes[String(year)];
  if (!byYear) return null;
  const makes = tables.makes
    .filter((m) => byYear[String(m.i)] && rest.startsWith(` ${words(m.m)} `))
    .sort((a, b) => b.m.length - a.m.length);
  for (const make of makes) {
    const after = ` ${rest.slice(words(make.m).length + 2).trim()} `;
    const types = new Set(byYear[String(make.i)]);
    const fitting = tables.models
      .filter((m) => after.startsWith(` ${words(m.m)} `) && (!m.v?.length || m.v.some((v) => types.has(v))))
      .sort((a, b) => b.m.length - a.m.length);
    if (fitting.length === 0) continue;
    const name = fitting[0].m;
    const models = fitting.filter((m) => m.m === name).slice(0, 4).map((m) => ({ id: m.i, vehType: m.v?.find((v) => types.has(v)) ?? m.v?.[0] ?? 5 }));
    return { year, makeId: make.i, make: make.m, model: name, models };
  }
  return null;
}

/** WorldPac category code ("N1896") to the ACES part type Nexpart uses (1896). */
export function partTypeOf(categoryCode: string | null | undefined): number | null {
  const m = String(categoryCode ?? "").match(/^N?(\d{2,7})$/);
  return m ? Number(m[1]) : null;
}

/** Nexpart position groups for a part type at "Front" / "Rear"; empty when the part has no position. */
export function usagesFor(table: PositionTable, partType: number, position: string): number[] {
  const want = /front/i.test(position) ? "Front" : /rear/i.test(position) ? "Rear" : "";
  if (!want) return [];
  return Object.entries(table)
    .filter(([, types]) => types[String(partType)] === want)
    .map(([usage]) => Number(usage))
    .filter((n) => Number.isInteger(n));
}

/**
 * The Westcan lookup for a job, or null when the vehicle or part can't be
 * matched (the quote then simply has no Westcan check).
 */
export async function westcanLookup(
  vehicle: VehicleRef,
  categoryCode: string | null | undefined,
  position: string,
  options: { bothSides?: boolean; get?: NexpartFetch; now?: number } = {},
): Promise<WestcanLookup | null> {
  const partType = partTypeOf(categoryCode);
  // WESTCAN_LOOKUP=off turns the check off (tests, or if Nexpart's tables ever break quoting).
  if (!partType || (!options.get && process.env.WESTCAN_LOOKUP === "off")) return null;
  const get = options.get ?? defaultFetch;
  const now = options.now ?? Date.now();
  vehicleTables = cached(vehicleTables, () => loadVehicleTables(get), now);
  positionTable = cached(positionTable, () => loadPositionTable(get), now);
  const [tables, positions] = await Promise.all([vehicleTables.value, positionTable.value]);
  if (!tables) return null;
  const matched = matchVehicle(vehicle.label, tables);
  if (!matched) return null;
  const usages = positions ? usagesFor(positions, partType, position) : [];
  // A front/rear part with no known position group would come back empty in Nexpart.
  if (/front|rear/i.test(position) && usages.length === 0) return null;
  const attr = (name: string) => vehicle.attributes.find((a) => a.name === name)?.label ?? "";
  return {
    ...matched,
    engine: attr("EngineBase"),
    submodel: attr("SubModel"),
    partTypes: [partType],
    usages,
    multiplier: options.bothSides ? 2 : 1,
  };
}
