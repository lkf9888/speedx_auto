/**
 * Vehicle, labor-time, and parts lookups on top of the speedDIAL session.
 *
 * Every function returns customer-safe data only: parts carry the WorldPac
 * list price and never any account price (unitPrice, jobberPrice,
 * wholesalePrice, dcDirectUnitPrice, corePrice). Sanitizing happens here so
 * nothing downstream — including the model — can see what the shop pays.
 *
 * The one exception is the staff section at the end (quoteServiceForStaff),
 * used only by the internal repair workbench behind Cloudflare Access.
 *
 * None of these calls touch speedDIAL's vehicle or search history endpoints,
 * so chatbot lookups do not clutter the shop's own speedDIAL history.
 */
import { TtlCache } from "./cache";

export interface CatalogApi {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, data: unknown): Promise<T>;
}

const VEHICLE_GROUP_ID = 2; // Car, Van, Light Duty Truck
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Attributes worth asking a customer about; others rarely change the job. */
const ASKABLE_ATTRIBUTES = ["SubModel", "EngineBase", "BodyType", "DriveType"] as const;

export interface VehicleAttribute {
  name: string;
  id: number;
  label: string;
}

export interface VehicleRef {
  baseVehicleId: number;
  label: string;
  attributes: VehicleAttribute[];
}

export interface VehicleQuestion {
  attribute: string;
  label: string;
  options: string[];
}

export type VehicleLookup =
  | { status: "ok"; vehicle: VehicleRef }
  | { status: "needs_details"; vehicle: VehicleRef; questions: VehicleQuestion[] }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "not_found"; reason: string };

export interface ServiceMatch {
  serviceId: number;
  name: string;
  system: string;
}

export interface PartOption {
  description: string;
  series: string;
  listPrice: number;
  quantity: number;
  inStockLocally: boolean;
  note: string;
}

export type ServiceQuote =
  | {
      status: "ok";
      serviceName: string;
      position: string;
      laborHours: number;
      laborNote: string;
      primaryPartName: string;
      partOptions: PartOption[];
      otherPartNames: string[];
      /** Why parts are not priced, when they aren't (e.g. fluids by volume). */
      partsNote: string;
    }
  | { status: "need_position"; positions: string[] }
  | { status: "need_details"; questions: VehicleQuestion[] }
  | { status: "unavailable"; reason: string };

// ---------------------------------------------------------------- vehicle key

/** Opaque, URL-safe token the model passes between tool calls. */
export function encodeVehicleKey(vehicle: VehicleRef): string {
  const compact = {
    b: vehicle.baseVehicleId,
    l: vehicle.label,
    a: vehicle.attributes.map((a) => [a.name, a.id, a.label]),
  };
  return Buffer.from(JSON.stringify(compact), "utf8").toString("base64url");
}

export function decodeVehicleKey(key: string): VehicleRef | null {
  try {
    if (typeof key !== "string" || key.length > 2000) return null;
    const raw = JSON.parse(Buffer.from(key, "base64url").toString("utf8")) as {
      b?: unknown;
      l?: unknown;
      a?: unknown;
    };
    if (!Number.isInteger(raw.b) || (raw.b as number) <= 0) return null;
    if (typeof raw.l !== "string" || raw.l.length > 200) return null;
    if (!Array.isArray(raw.a) || raw.a.length > 20) return null;
    const attributes: VehicleAttribute[] = [];
    for (const entry of raw.a) {
      if (
        !Array.isArray(entry) ||
        typeof entry[0] !== "string" ||
        !/^[A-Za-z]{2,40}$/.test(entry[0]) ||
        !Number.isInteger(entry[1]) ||
        typeof entry[2] !== "string"
      ) {
        return null;
      }
      attributes.push({ name: entry[0], id: entry[1], label: entry[2].slice(0, 80) });
    }
    return { baseVehicleId: raw.b as number, label: raw.l, attributes };
  } catch {
    return null;
  }
}

export function describeVehicle(vehicle: VehicleRef): string {
  const extras = vehicle.attributes
    .filter((a) => (ASKABLE_ATTRIBUTES as readonly string[]).includes(a.name))
    .map((a) => a.label);
  return [vehicle.label, ...extras].join(" ").trim();
}

function attributePayload(vehicle: VehicleRef) {
  return vehicle.attributes.map((a) => ({ name: a.name, value: a.id }));
}

function vehicleCacheKey(vehicle: VehicleRef): string {
  const attrs = [...vehicle.attributes]
    .sort((x, y) => x.name.localeCompare(y.name))
    .map((a) => `${a.name}:${a.id}`)
    .join(",");
  return `${vehicle.baseVehicleId}|${attrs}`;
}

// ------------------------------------------------------------- text matching

const MAKE_ALIASES: Record<string, string> = {
  chevy: "chevrolet",
  vw: "volkswagen",
  benz: "mercedes-benz",
  mercedes: "mercedes-benz",
  merc: "mercedes-benz",
  bimmer: "bmw",
  landrover: "land rover",
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(text: string): string {
  return normalize(text).replace(/\s+/g, "");
}

const SYNONYMS: Record<string, string[]> = {
  pad: ["pad", "pads"],
  rotor: ["rotor", "disc", "disk"],
  disc: ["disc", "rotor"],
  battery: ["battery"],
  alternator: ["alternator"],
  starter: ["starter"],
  oil: ["oil"],
  ac: ["air", "conditioning", "compressor", "refrigerant", "a"],
  coolant: ["coolant", "radiator", "antifreeze"],
  plug: ["plug", "spark"],
  shock: ["shock", "strut", "absorber"],
  strut: ["strut", "shock"],
  tie: ["tie", "rod"],
  wheel: ["wheel", "hub", "bearing"],
  belt: ["belt", "serpentine", "drive"],
  thermostat: ["thermostat"],
  pump: ["pump"],
};

function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function tokens(text: string): string[] {
  const stop = new Set(["r", "i", "the", "a", "and", "of", "for", "replace", "replacement", "repair"]);
  return normalize(text)
    .split(" ")
    .filter((t) => t && !stop.has(t))
    .map(stem);
}

export function scoreService(query: string, serviceName: string): number {
  const nameTokens = new Set(tokens(serviceName));
  if (nameTokens.size === 0) return 0;
  let score = 0;
  for (const q of tokens(query)) {
    const variants = new Set([q, ...(SYNONYMS[q] ?? []).map(stem)]);
    if ([...variants].some((v) => nameTokens.has(v))) score += 1;
  }
  return score / Math.max(1, Math.sqrt(nameTokens.size));
}

// ------------------------------------------------------------------- vehicles

interface RawAttribute {
  name?: { key?: string; value?: string };
  value?: { key?: number | string; value?: string };
}

function readAttributes(raw: RawAttribute[] | undefined): Map<string, VehicleAttribute> {
  const out = new Map<string, VehicleAttribute>();
  for (const a of raw ?? []) {
    const name = a.name?.key;
    const id = Number(a.value?.key);
    if (name && Number.isFinite(id)) out.set(name, { name, id, label: String(a.value?.value ?? "") });
  }
  return out;
}

export async function identifyByVin(api: CatalogApi, vin: string): Promise<VehicleLookup> {
  const clean = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (clean.length !== 17) return { status: "not_found", reason: "A VIN has 17 characters." };
  const result = await api.get<{
    vehicles?: Array<{ baseVehicleID?: number; vehicleAttributes?: RawAttribute[] }>;
  }>(
    `vehicle/searchMultiVehicle?callerName=VinSearch&vin=${clean}&licensePlate=&licenseState=`,
  );
  const vehicles = (result.vehicles ?? []).filter((v) => Number.isInteger(v.baseVehicleID));
  if (vehicles.length === 0) return { status: "not_found", reason: "The VIN was not recognized." };
  const first = vehicles[0];
  const attrs = readAttributes(first.vehicleAttributes);
  let year = (attrs.get("Year") ?? attrs.get("YearID"))?.label ?? "";
  let make = (attrs.get("Make") ?? attrs.get("MakeName"))?.label ?? "";
  let model = (attrs.get("Model") ?? attrs.get("ModelName"))?.label ?? "";
  if (!year || !make || !model) {
    const details = await api
      .get<{ year?: number; makeDescription?: string; modelDescription?: string }>(
        `vehicle/details?baseVehicleID=${first.baseVehicleID}`,
      )
      .catch(() => ({}) as { year?: number; makeDescription?: string; modelDescription?: string });
    year ||= details.year ? String(details.year) : "";
    make ||= details.makeDescription ?? "";
    model ||= details.modelDescription ?? "";
  }
  const kept = [...attrs.values()].filter((a) =>
    (ASKABLE_ATTRIBUTES as readonly string[]).includes(a.name),
  );
  const vehicle: VehicleRef = {
    baseVehicleId: first.baseVehicleID!,
    label: [year, make, model].filter(Boolean).join(" ") || `VIN ${clean.slice(-6)}`,
    attributes: kept,
  };
  return withUsTwin(api, await refineVehicle(api, vehicle), Number(year), make, model);
}

/**
 * Canadian-market names for cars sold in the US under another name. speedDIAL
 * knows the Canadian name (a VIN decodes to it) but its labor guide may have
 * no operations filed under it, so quotes come back empty. The US twin is the
 * same car with the same parts and labor times.
 */
const US_TWINS: Array<{ make: string; model: string; from?: number; usMake: string; usModel: string }> = [
  { make: "Mitsubishi", model: "RVR", from: 2011, usMake: "Mitsubishi", usModel: "Outlander Sport" },
  { make: "Acura", model: "CSX", usMake: "Honda", usModel: "Civic" },
  { make: "Acura", model: "EL", usMake: "Honda", usModel: "Civic" },
  { make: "Buick", model: "Allure", usMake: "Buick", usModel: "LaCrosse" },
  { make: "Pontiac", model: "Wave", usMake: "Chevrolet", usModel: "Aveo" },
  { make: "Suzuki", model: "Swift+", usMake: "Chevrolet", usModel: "Aveo" },
  { make: "Chrysler", model: "Grand Caravan", from: 2021, usMake: "Chrysler", usModel: "Voyager" },
];

/** Swap a Canadian-name vehicle with no labor-guide data for its US twin, keeping the name the customer knows. */
async function withUsTwin(api: CatalogApi, lookup: VehicleLookup, year: number, make: string, model: string): Promise<VehicleLookup> {
  if (lookup.status !== "ok" && lookup.status !== "needs_details") return lookup;
  const twin = US_TWINS.find(
    (t) => compact(t.make) === compact(make) && compact(t.model) === compact(model) && (!t.from || year >= t.from),
  );
  if (!twin) return lookup;
  const own = await allServices(api, lookup.vehicle).catch(() => []);
  if (own.length > 0) return lookup;
  const us = await identifyByYearMakeModel(api, year, twin.usMake, twin.usModel);
  if (us.status !== "ok" && us.status !== "needs_details") return lookup;
  // Keep what is already known about the car (engine, trim) where the twin offers the same option.
  const known = lookup.vehicle.attributes.map((a) => ({ attribute: a.name, option: a.label }));
  const applied = known.length > 0 ? await applyVehicleDetails(api, us.vehicle, known) : us;
  if (applied.status !== "ok" && applied.status !== "needs_details") return lookup;
  return { ...applied, vehicle: { ...applied.vehicle, label: lookup.vehicle.label } };
}

const makesCache = new TtlCache<Array<{ makeID: number; makeDesc: string }>>(WEEK_MS);
const modelsCache = new TtlCache<
  Array<{ baseVehicleID: string | number; modelDesc: string; makeDesc: string; yearID: number }>
>(WEEK_MS);

export async function identifyByYearMakeModel(
  api: CatalogApi,
  year: number,
  make: string,
  model: string,
): Promise<VehicleLookup> {
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < 1960 || year > currentYear + 2) {
    return { status: "not_found", reason: "The model year looks invalid." };
  }
  const makes = await makesCache.getOrLoad(String(year), async () => {
    const r = await api.get<{ makes?: Array<{ makeID: number; makeDesc: string }> }>(
      `vehicle/makesbyyear?id=${year}&vehicleGroupID=${VEHICLE_GROUP_ID}`,
    );
    return r.makes ?? [];
  });
  const wantedMake = compact(MAKE_ALIASES[normalize(make)] ?? make);
  const makeMatch =
    makes.find((m) => compact(m.makeDesc) === wantedMake) ??
    makes.find((m) => compact(m.makeDesc).startsWith(wantedMake) || wantedMake.startsWith(compact(m.makeDesc)));
  if (!makeMatch) return { status: "not_found", reason: `No ${make} vehicles found for ${year}.` };

  const models = await modelsCache.getOrLoad(`${year}|${makeMatch.makeID}`, async () => {
    const r = await api.get<{
      models?: Array<{ baseVehicleID: string | number; modelDesc: string; makeDesc: string; yearID: number }>;
    }>(
      `vehicle/modelsbyyearmake?year=${year}&make=${makeMatch.makeID}&type=0&vehicleGroupID=${VEHICLE_GROUP_ID}`,
    );
    return r.models ?? [];
  });
  const wantedModel = compact(model);
  const exact = models.filter((m) => compact(m.modelDesc) === wantedModel);
  const partial = models.filter(
    (m) => compact(m.modelDesc).includes(wantedModel) || wantedModel.includes(compact(m.modelDesc)),
  );
  const matches = exact.length > 0 ? exact : partial;
  if (matches.length === 0) {
    return {
      status: "ambiguous",
      candidates: models.map((m) => m.modelDesc).slice(0, 25),
    };
  }
  if (matches.length > 1) {
    return { status: "ambiguous", candidates: matches.map((m) => m.modelDesc) };
  }
  const chosen = matches[0];
  const lookup = await refineVehicle(api, {
    baseVehicleId: Number(chosen.baseVehicleID),
    label: `${year} ${chosen.makeDesc} ${chosen.modelDesc}`,
    attributes: [],
  });
  return withUsTwin(api, lookup, year, chosen.makeDesc, chosen.modelDesc);
}

interface RefineResponse {
  recommendedVehAttrs?: Array<{
    attrDesc?: string;
    attrName?: string;
    vehAttrs?: Array<{
      isEnabled?: boolean;
      isUserSelected?: boolean;
      isAutoSelected?: boolean;
      value?: { key?: number; value?: string };
    }>;
  }>;
}

/** Ask speedDIAL which configuration details still change the parts. */
export async function refineVehicle(api: CatalogApi, vehicle: VehicleRef): Promise<VehicleLookup> {
  const result = await api.post<RefineResponse>("vehicle/refine", {
    selectedVehAttrs: vehicle.attributes.map((a) => ({ attrName: a.name, attrID: a.id })),
    baseVehicleID: String(vehicle.baseVehicleId),
  });
  const attributes = new Map(vehicle.attributes.map((a) => [a.name, a]));
  const questions: VehicleQuestion[] = [];
  for (const group of result.recommendedVehAttrs ?? []) {
    const name = group.attrName ?? "";
    if (!(ASKABLE_ATTRIBUTES as readonly string[]).includes(name) || attributes.has(name)) continue;
    const enabled = (group.vehAttrs ?? []).filter((v) => v.isEnabled && v.value?.key !== undefined);
    const chosen = enabled.find((v) => v.isUserSelected || v.isAutoSelected);
    const only = enabled.length === 1 ? enabled[0] : undefined;
    const pick = chosen ?? only;
    if (pick) {
      attributes.set(name, { name, id: Number(pick.value!.key), label: String(pick.value!.value ?? "") });
    } else if (enabled.length > 1) {
      questions.push({
        attribute: name,
        label: group.attrDesc ?? name,
        options: enabled.map((v) => String(v.value?.value ?? "")).filter(Boolean),
      });
    }
  }
  const refined: VehicleRef = { ...vehicle, attributes: [...attributes.values()] };
  return questions.length > 0
    ? { status: "needs_details", vehicle: refined, questions }
    : { status: "ok", vehicle: refined };
}

/** Apply customer answers ("SubModel" = "LE") by matching option labels. */
export async function applyVehicleDetails(
  api: CatalogApi,
  vehicle: VehicleRef,
  selections: Array<{ attribute: string; option: string }>,
): Promise<VehicleLookup> {
  const current = await refineVehicleOptions(api, vehicle);
  const attributes = new Map(vehicle.attributes.map((a) => [a.name, a]));
  for (const selection of selections) {
    const group = current.find(
      (g) =>
        compact(g.attrName ?? "") === compact(selection.attribute) ||
        compact(g.attrDesc ?? "") === compact(selection.attribute),
    );
    const option = group?.vehAttrs?.find((v) => compact(String(v.value?.value ?? "")) === compact(selection.option));
    if (group?.attrName && option?.value?.key !== undefined) {
      attributes.set(group.attrName, {
        name: group.attrName,
        id: Number(option.value.key),
        label: String(option.value.value ?? ""),
      });
    }
  }
  return refineVehicle(api, { ...vehicle, attributes: [...attributes.values()] });
}

async function refineVehicleOptions(api: CatalogApi, vehicle: VehicleRef) {
  const result = await api.post<RefineResponse>("vehicle/refine", {
    selectedVehAttrs: vehicle.attributes.map((a) => ({ attrName: a.name, attrID: a.id })),
    baseVehicleID: String(vehicle.baseVehicleId),
  });
  return result.recommendedVehAttrs ?? [];
}

// ------------------------------------------------------------------- services

export interface PartType {
  code: string;
  name: string;
  system: string;
}

interface VehicleCatalog {
  services: ServiceMatch[];
  /** Subcategories under each system; their part types are loaded on demand. */
  subcategories: PartType[];
}

const catalogCache = new TtlCache<VehicleCatalog>(WEEK_MS, 500);

interface CategoryResponse {
  /** At the root: systems. Under a system: its subcategories. */
  replacementParts?: Array<{ code?: string; description?: string }>;
  /** Under a subcategory: the part types speedDIAL can price (pna360_cat category codes). */
  partTypes?: Array<{ code?: string; description?: string }>;
  laborOperations?: Array<{ acaPartTerminologyID?: number; description?: string }>;
}

/** Every labor operation and every part type speedDIAL lists for the vehicle, by system. */
async function vehicleCatalog(api: CatalogApi, vehicle: VehicleRef): Promise<VehicleCatalog> {
  return catalogCache.getOrLoad(vehicleCacheKey(vehicle), async () => {
    const base = {
      attributes: attributePayload(vehicle),
      baseVehicleID: String(vehicle.baseVehicleId),
    };
    const root = await api.post<CategoryResponse>("category/details", {
      ...base,
      categoryType: "",
      categoryCode: "",
    });
    const systems = (root.replacementParts ?? []).filter((s) => s.code && s.description);
    const perSystem = await Promise.all(
      systems.map(async (system) => {
        const detail = await api.post<CategoryResponse>("category/details", {
          ...base,
          categoryType: "replacementParts",
          categoryCode: system.code,
        });
        return {
          services: (detail.laborOperations ?? [])
            .filter((op) => Number.isInteger(op.acaPartTerminologyID) && op.description)
            .map((op) => ({ serviceId: op.acaPartTerminologyID!, name: op.description!, system: system.description! })),
          subcategories: (detail.replacementParts ?? [])
            .filter((p) => p.code && p.description)
            .map((p) => ({ code: p.code!, name: p.description!, system: system.description! })),
        };
      }),
    );
    const services = new Map<number, ServiceMatch>();
    const subcategories = new Map<string, PartType>();
    for (const group of perSystem) {
      for (const service of group.services) services.set(service.serviceId, service);
      for (const sub of group.subcategories) subcategories.set(sub.code, sub);
    }
    return { services: [...services.values()], subcategories: [...subcategories.values()] };
  });
}

async function allServices(api: CatalogApi, vehicle: VehicleRef): Promise<ServiceMatch[]> {
  return (await vehicleCatalog(api, vehicle)).services;
}

/** Name of a labor-guide operation, for cards that can't be priced. */
export async function serviceById(
  api: CatalogApi,
  vehicle: VehicleRef,
  serviceId: number,
): Promise<ServiceMatch | undefined> {
  const services = await allServices(api, vehicle);
  return services.find((s) => s.serviceId === serviceId);
}

export async function findServices(
  api: CatalogApi,
  vehicle: VehicleRef,
  query: string,
  limit = 12,
): Promise<ServiceMatch[]> {
  const services = await allServices(api, vehicle);
  return services
    .map((service) => ({
      service,
      score: Math.max(scoreService(query, service.name), scoreService(query, `${service.system} ${service.name}`) * 0.6),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.service.name.length - b.service.name.length)
    .slice(0, limit)
    .map((s) => s.service);
}

// --------------------------------------------------------------------- quotes

interface LaborListResponse {
  laborOperations?: Array<{
    applicationID?: number;
    assetName?: string;
    position?: { description?: string; id?: number };
    positionID?: number;
  }>;
  vehAttrOptions?: Array<{ attrName?: string; attrDesc?: string; vehAttrs?: Array<{ value?: { value?: string } }> }>;
}

interface LaborDetailsResponse {
  laborOperation?: {
    estimateTimeHour?: number;
    laborCategoryName?: string;
    applicationNote?: string;
    applications?: Array<{ categoryCode?: string; categoryName?: string }>;
  };
}

interface PnaResponse {
  applications?: Array<{ appID?: string; qtyPerCar?: number; applicationNote?: string }>;
  quotes?: Array<{
    productQuotes?: Array<Record<string, unknown>>;
  }>;
}

const quoteCache = new TtlCache<ServiceQuote>(DAY_MS, 1000);

function pickPrimaryCategory(
  serviceName: string,
  applications: Array<{ categoryCode?: string; categoryName?: string }>,
) {
  const candidates = applications.filter((a) => a.categoryCode && a.categoryName);
  if (candidates.length === 0) return undefined;
  const scored = candidates.map((a) => ({ a, score: scoreService(serviceName, a.categoryName!) }));
  scored.sort((x, y) => y.score - x.score);
  return scored[0].score > 0 ? scored[0].a : candidates[0];
}

/** Only these fields may leave this module for a part; nothing price-related but list. */
export function sanitizePartQuotes(
  response: PnaResponse,
  positionId: number | null,
): PartOption[] {
  const apps = new Map(
    (response.applications ?? []).map((a) => [String(a.appID), a]),
  );
  const all = (response.quotes ?? []).flatMap((q) => q.productQuotes ?? []);
  const matchesPosition = (q: Record<string, unknown>) => {
    if (positionId === null || positionId < 0) return true;
    const pos = q.position as { id?: number } | undefined;
    return pos?.id === undefined || pos.id === positionId || pos.id === -1;
  };
  // A part for another position is not an option for this one: no falling back to every part.
  const source = all.filter(matchesPosition);
  const options: PartOption[] = [];
  for (const q of source) {
    const listPrice = Number(q.listPrice);
    if (!Number.isFinite(listPrice) || listPrice <= 0) continue;
    const app = apps.get(String(q.appID));
    const quantity = Number(app?.qtyPerCar);
    options.push({
      description: String(q.partDescription ?? "").slice(0, 120),
      series: String(q.seriesDescription ?? "").slice(0, 80),
      listPrice: Math.round(listPrice * 100) / 100,
      quantity: Number.isInteger(quantity) && quantity > 0 && quantity <= 8 ? quantity : 1,
      inStockLocally: /local/i.test(String(q.availability ?? "")) && Number(q.qtyAvailable) > 0,
      note: String(app?.applicationNote ?? "").slice(0, 160),
    });
  }
  return dedupe(options, (o) => `${o.series}|${o.description}|${o.listPrice}|${o.quantity}`, (a, b) => Number(b.inStockLocally) - Number(a.inStockLocally));
}

/**
 * speedDIAL quotes the same part once per warehouse and order type, so one
 * pad set can come back several times. Keep one row per key, the best one.
 */
function dedupe<T>(options: T[], key: (o: T) => string, better: (a: T, b: T) => number): T[] {
  const best = new Map<string, T>();
  for (const option of options) {
    const k = key(option);
    const current = best.get(k);
    if (!current || better(option, current) < 0) best.set(k, option);
  }
  return options.filter((o) => best.get(key(o)) === o);
}

const BULK_PACKAGING = /\b(drum|pail|bulk|tote|case of|\d+\s?(gal|gallon|g)\b|55g|\d+\s?l(iter|itre)?\s?(jug|box))/i;
const SOLD_BY_VOLUME = /\b(fluid|oil|coolant|antifreeze|refrigerant|grease|lubricant|additive)\b/i;

/** Parts sold by the container (fluids) can't be priced per job from list price. */
export function isSoldByVolume(partName: string): boolean {
  return SOLD_BY_VOLUME.test(partName);
}

/** Drop shop-bulk packaging and extreme outliers so the range stays meaningful. */
export function filterRealisticOptions(options: PartOption[]): PartOption[] {
  const retail = options.filter((o) => !BULK_PACKAGING.test(o.description));
  if (retail.length < 3) return retail;
  const totals = retail.map((o) => o.listPrice * o.quantity).sort((a, b) => a - b);
  const median = totals[Math.floor(totals.length / 2)];
  return retail.filter((o) => o.listPrice * o.quantity <= median * 3);
}

/** Cheapest, a middle option, and the most expensive — enough for a range. */
export function representativeOptions(options: PartOption[], max = 3): PartOption[] {
  const sorted = [...options].sort((a, b) => a.listPrice * a.quantity - b.listPrice * b.quantity);
  if (sorted.length <= max) return sorted;
  const picks = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
  return [...new Set(picks)].slice(0, max);
}

/**
 * Labor time and the raw parts response for one service. Shared by the public
 * quote (sanitized to list price below) and the staff workbench quote.
 */
interface ServiceData {
  status: "ok";
  serviceName: string;
  position: string;
  laborHours: number;
  laborNote: string;
  primaryPartName: string;
  otherPartNames: string[];
  partsNote: string;
  hasPartCategory: boolean;
  /** Raw response, account prices included: only sanitizePartQuotes or staffPartQuotes may read it. */
  pna: PnaResponse | null;
  positionId: number | null;
}

type NotOk = Exclude<ServiceQuote, { status: "ok" }>;

async function loadServiceData(
  api: CatalogApi,
  vehicle: VehicleRef,
  serviceId: number,
  position: string | null,
): Promise<ServiceData | NotOk> {
  const attrs = attributePayload(vehicle);
  const list = await api.post<LaborListResponse>("labor-ops-list", {
    refinedVehAttrIDs: attrs,
    selectedFilters: [],
    baseVehicleID: String(vehicle.baseVehicleId),
    ACAPartTerminologyID: serviceId,
  });
  if ((list.vehAttrOptions ?? []).length > 0) {
    return {
      status: "need_details",
      questions: (list.vehAttrOptions ?? []).map((o) => ({
        attribute: o.attrName ?? "",
        label: o.attrDesc ?? o.attrName ?? "",
        options: (o.vehAttrs ?? []).map((v) => String(v.value?.value ?? "")).filter(Boolean),
      })),
    };
  }
  const operations = (list.laborOperations ?? []).filter((op) => op.applicationID && op.assetName);
  if (operations.length === 0) {
    return { status: "unavailable", reason: "No published labor time for this service on this vehicle." };
  }
  const positionLabel = (op: (typeof operations)[number]) => op.position?.description?.trim() ?? "";
  let operation = operations[0];
  // Several operations that name no position (or all the same one), e.g. a
  // thermostat, are not a front/rear choice: there is nothing to ask.
  const positionChoices = new Set(operations.map(positionLabel).filter(Boolean));
  if (operations.length > 1 && positionChoices.size > 1) {
    const wanted = position ? normalize(position) : "";
    const match = operations.find((op) => wanted && normalize(positionLabel(op)) === wanted);
    if (!match) {
      return {
        status: "need_position",
        positions: [...new Set(operations.map(positionLabel).filter(Boolean))],
      };
    }
    operation = match;
  }

  const details = await api.post<LaborDetailsResponse>("labor-ops-details", {
    refinedVehAttrIDs: attrs,
    baseVehicleID: String(vehicle.baseVehicleId),
    ACAPartTerminologyID: serviceId,
    applicationID: operation.applicationID,
    assetName: operation.assetName,
    positionID: operation.positionID,
  });
  const labor = details.laborOperation;
  const hours = Number(labor?.estimateTimeHour);
  if (!labor || !Number.isFinite(hours) || hours <= 0) {
    return { status: "unavailable", reason: "No published labor time for this service on this vehicle." };
  }
  const serviceName = labor.laborCategoryName ?? "Service";
  const applications = labor.applications ?? [];
  const primary = pickPrimaryCategory(serviceName, applications);

  let pna: PnaResponse | null = null;
  let partsNote = "";
  if (primary?.categoryName && isSoldByVolume(primary.categoryName)) {
    partsNote = `${primary.categoryName} is billed by the amount used, so it is not included in this estimate; the shop confirms it.`;
  } else if (primary?.categoryCode) {
    pna = await api.post<PnaResponse>("pna360_cat", {
      attributes: attrs,
      partTypes: [
        {
          requestedQuantity: 0,
          orderType: "ST",
          categoryCode: primary.categoryCode,
          baseVehicleID: vehicle.baseVehicleId,
          positionID: -1,
        },
      ],
    });
  }

  return {
    status: "ok",
    serviceName,
    position: positionLabel(operation),
    laborHours: Math.round(hours * 100) / 100,
    laborNote: (labor.applicationNote ?? "").slice(0, 400),
    primaryPartName: primary?.categoryName ?? "",
    otherPartNames: [
      ...new Set(
        applications
          .map((a) => a.categoryName ?? "")
          .filter((name) => name && name !== primary?.categoryName),
      ),
    ].slice(0, 6),
    partsNote,
    hasPartCategory: Boolean(primary?.categoryCode),
    pna,
    positionId: operation.positionID ?? operation.position?.id ?? null,
  };
}

/** A part needs a priced option, or the catalog wants the trim/engine first (e.g. brake pads). */
async function detailsNeededForParts(api: CatalogApi, vehicle: VehicleRef): Promise<NotOk | null> {
  const refined = await refineVehicle(api, vehicle);
  return refined.status === "needs_details" ? { status: "need_details", questions: refined.questions } : null;
}

export async function quoteService(
  api: CatalogApi,
  vehicle: VehicleRef,
  serviceId: number,
  position: string | null,
): Promise<ServiceQuote> {
  const cacheKey = `${vehicleCacheKey(vehicle)}|${serviceId}|${position ?? ""}`;
  const cached = quoteCache.get(cacheKey);
  if (cached) return cached;

  const data = await loadServiceData(api, vehicle, serviceId, position);
  if (data.status !== "ok") return data;
  const partOptions = data.pna
    ? representativeOptions(filterRealisticOptions(sanitizePartQuotes(data.pna, data.positionId)))
    : [];
  if (partOptions.length === 0 && !data.partsNote && data.hasPartCategory) {
    const ask = await detailsNeededForParts(api, vehicle);
    if (ask) return ask;
  }

  const quote: ServiceQuote = {
    status: "ok",
    serviceName: data.serviceName,
    position: data.position,
    laborHours: data.laborHours,
    laborNote: data.laborNote,
    primaryPartName: data.primaryPartName,
    partOptions,
    otherPartNames: data.otherPartNames,
    partsNote: data.partsNote,
  };
  quoteCache.set(cacheKey, quote);
  return quote;
}

// ------------------------------------------------------------- staff quotes
//
// Staff only. The workbench (repair.speedxrental.com, behind Cloudflare Access
// and a verified Access token) shows account prices on purpose. Nothing on the
// public site imports these.

/** Price-like fields WorldPac returns per part; which one is the shop's cost is configurable. */
export const ACCOUNT_PRICE_FIELDS = [
  "listPrice",
  "unitPrice",
  "jobberPrice",
  "wholesalePrice",
  "dcDirectUnitPrice",
  "corePrice",
] as const;

export interface StaffPartOption extends PartOption {
  /** Every price-like number on the part, by WorldPac field name. */
  prices: Record<string, number>;
  partNumber: string;
  brand: string;
  availability: string;
  qtyAvailable: number | null;
  /** Other scalar fields, so staff can see what WorldPac sends while we learn the data. */
  fields: Record<string, string | number>;
}

const PART_NUMBER_FIELDS = ["manufacturerPart", "partNumber", "partNo", "productNumber", "itemNumber", "mfgPartNumber", "catalogNumber"];
const BRAND_FIELDS = ["brandName", "brand", "manufacturerName", "manufacturer", "lineDescription", "mfgName"];

function firstString(q: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = q[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 80);
    if (typeof value === "number") return String(value);
  }
  return "";
}

export function staffPartQuotes(response: PnaResponse, positionId: number | null): StaffPartOption[] {
  const apps = new Map((response.applications ?? []).map((a) => [String(a.appID), a]));
  const all = (response.quotes ?? []).flatMap((q) => q.productQuotes ?? []);
  const matchesPosition = (q: Record<string, unknown>) => {
    if (positionId === null || positionId < 0) return true;
    const pos = q.position as { id?: number } | undefined;
    return pos?.id === undefined || pos.id === positionId || pos.id === -1;
  };
  // A part for another position is not an option for this one: no falling back to every part.
  const source = all.filter(matchesPosition);
  const options: StaffPartOption[] = [];
  for (const q of source) {
    const listPrice = Number(q.listPrice);
    if (!Number.isFinite(listPrice) || listPrice <= 0) continue;
    const app = apps.get(String(q.appID));
    const quantity = Number(app?.qtyPerCar);
    const prices: Record<string, number> = {};
    const fields: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(q)) {
      if (typeof value === "number" && Number.isFinite(value) && /price|cost|core/i.test(key)) {
        prices[key] = Math.round(value * 100) / 100;
      } else if ((typeof value === "string" && value.length <= 80) || typeof value === "number") {
        if (Object.keys(fields).length < 30) fields[key] = value;
      }
    }
    const qty = Number(q.qtyAvailable);
    options.push({
      description: String(q.partDescription ?? "").slice(0, 120),
      series: String(q.seriesDescription ?? "").slice(0, 80),
      listPrice: Math.round(listPrice * 100) / 100,
      quantity: Number.isInteger(quantity) && quantity > 0 && quantity <= 8 ? quantity : 1,
      inStockLocally: /local/i.test(String(q.availability ?? "")) && qty > 0,
      note: String(app?.applicationNote ?? "").slice(0, 160),
      prices,
      partNumber: firstString(q, PART_NUMBER_FIELDS),
      brand: firstString(q, BRAND_FIELDS),
      availability: String(q.availability ?? "").slice(0, 60),
      qtyAvailable: Number.isFinite(qty) ? qty : null,
      fields,
    });
  }
  // One row per part: local stock first, then the lower account price.
  const unique = dedupe(
    options,
    (o) => (o.partNumber ? `${o.brand}|${o.partNumber}` : `${o.series}|${o.description}|${o.listPrice}`),
    (a, b) =>
      Number(b.inStockLocally) - Number(a.inStockLocally) ||
      (a.prices.unitPrice ?? Infinity) - (b.prices.unitPrice ?? Infinity),
  );
  return unique
    .filter((o) => !BULK_PACKAGING.test(o.description))
    .sort((a, b) => a.listPrice * a.quantity - b.listPrice * b.quantity)
    .slice(0, 15);
}

export type StaffServiceQuote =
  | (Omit<Extract<ServiceQuote, { status: "ok" }>, "partOptions"> & { partOptions: StaffPartOption[] })
  | NotOk;

export async function quoteServiceForStaff(
  api: CatalogApi,
  vehicle: VehicleRef,
  serviceId: number,
  position: string | null,
): Promise<StaffServiceQuote> {
  const data = await loadServiceData(api, vehicle, serviceId, position);
  if (data.status !== "ok") return data;
  const partOptions = data.pna ? staffPartQuotes(data.pna, data.positionId) : [];
  if (partOptions.length === 0 && !data.partsNote && data.hasPartCategory) {
    const ask = await detailsNeededForParts(api, vehicle);
    if (ask) return ask;
  }
  return {
    status: "ok",
    serviceName: data.serviceName,
    position: data.position,
    laborHours: data.laborHours,
    laborNote: data.laborNote,
    primaryPartName: data.primaryPartName,
    partOptions,
    otherPartNames: data.otherPartNames,
    partsNote: data.partsNote,
  };
}

// ------------------------------------------------------------- parts only

export type StaffPartsLookup =
  | { status: "ok"; partName: string; options: StaffPartOption[] }
  | { status: "not_found"; similar: string[] };

/**
 * Staff only: price a part type with no labor operation behind it (rotors on
 * cars whose labor guide has no rotor job, a strut when the strut job's part
 * list only has the mount). Same account prices as quoteServiceForStaff.
 */
const partTypeCache = new TtlCache<PartType[]>(WEEK_MS, 2000);
const SUBCATEGORIES_TO_OPEN = 6;

/** Part types under the subcategories that best match the query (speedDIAL's third catalog level). */
async function partTypesFor(api: CatalogApi, vehicle: VehicleRef, query: string): Promise<PartType[]> {
  const { subcategories } = await vehicleCatalog(api, vehicle);
  const ranked = subcategories
    .map((sub) => ({ sub, score: Math.max(scoreService(query, sub.name), scoreService(query, `${sub.system} ${sub.name}`) * 0.8) }))
    .sort((a, b) => b.score - a.score);
  const picked = (ranked.some((r) => r.score > 0) ? ranked.filter((r) => r.score > 0) : ranked).slice(0, SUBCATEGORIES_TO_OPEN);
  const lists = await Promise.all(
    picked.map(({ sub }) =>
      partTypeCache.getOrLoad(`${vehicleCacheKey(vehicle)}|${sub.code}`, async () => {
        const detail = await api.post<CategoryResponse>("category/details", {
          attributes: attributePayload(vehicle),
          baseVehicleID: String(vehicle.baseVehicleId),
          categoryType: "replacementParts",
          categoryCode: sub.code,
        });
        return (detail.partTypes ?? [])
          .filter((p) => p.code && p.description)
          .map((p) => ({ code: p.code!, name: p.description!, system: sub.name }));
      }),
    ),
  );
  return lists.flat();
}

export async function staffPartsByName(
  api: CatalogApi,
  vehicle: VehicleRef,
  query: string,
  position: string | null,
): Promise<StaffPartsLookup> {
  const partTypes = await partTypesFor(api, vehicle, query);
  const scored = partTypes
    .map((part) => ({ part, score: Math.max(scoreService(query, part.name), scoreService(query, `${part.system} ${part.name}`) * 0.6) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.part.name.length - b.part.name.length);
  if (scored.length === 0) return { status: "not_found", similar: [] };
  const best = scored[0].part;
  const pna = await api.post<PnaResponse>("pna360_cat", {
    attributes: attributePayload(vehicle),
    partTypes: [{ requestedQuantity: 0, orderType: "ST", categoryCode: best.code, baseVehicleID: vehicle.baseVehicleId, positionID: -1 }],
  });
  const wanted = position ? normalize(position) : "";
  const quotes = (pna.quotes ?? []).map((q) => ({
    ...q,
    productQuotes: (q.productQuotes ?? []).filter((pq) => {
      if (!wanted) return true;
      const label = normalize(String((pq.position as { description?: string } | undefined)?.description ?? ""));
      return !label || label.includes(wanted) || wanted.includes(label);
    }),
  }));
  const options = staffPartQuotes({ ...pna, quotes }, null);
  if (options.length === 0) return { status: "not_found", similar: scored.slice(0, 6).map((p) => p.part.name) };
  return { status: "ok", partName: best.name, options };
}

// ------------------------------------------------------- jobs done together

export interface DoneWith {
  serviceId: number;
  position: string | null;
}

export interface SharedLabor {
  /** True when this job is the one charged at half. */
  halved: boolean;
  /** Hours to charge for this job. */
  chargedHours: number;
  otherName: string;
  otherHours: number;
}

/**
 * Read get_estimate's done_with_service_id / done_with_position. Plain fields
 * (0 and "" for none), not a nullable object: the API caps union-typed
 * parameters across strict tools at 16.
 */
export function readDoneWith(input: Record<string, unknown>): DoneWith | null {
  const serviceId = Number(input.done_with_service_id);
  if (!Number.isInteger(serviceId) || serviceId <= 0) return null;
  const position = typeof input.done_with_position === "string" && input.done_with_position.trim() ? input.done_with_position : null;
  return { serviceId, position };
}

/**
 * Shop rule for jobs done at the same time in the same place (front pads and
 * front rotors): the job with the most labor hours is charged in full and
 * the other at half. Decided the same way whichever job is quoted first, so
 * the two cards always agree. Null when the other job has no labor time.
 */
export async function sharedLabor(
  api: CatalogApi,
  vehicle: VehicleRef,
  serviceId: number,
  hours: number,
  doneWith: DoneWith | null,
): Promise<SharedLabor | null> {
  if (!doneWith || doneWith.serviceId === serviceId) return null;
  const other = await quoteService(api, vehicle, doneWith.serviceId, doneWith.position).catch(() => null);
  if (!other || other.status !== "ok") return null;
  const halved = hours < other.laborHours || (hours === other.laborHours && serviceId > doneWith.serviceId);
  return {
    halved,
    chargedHours: halved ? Math.round((hours / 2) * 100) / 100 : hours,
    otherName: `${other.serviceName}${other.position ? ` (${other.position})` : ""}`,
    otherHours: other.laborHours,
  };
}

// ------------------------------------------------------------- both sides

/**
 * The same per-side job on both sides (left and right struts, both front
 * hubs): labor-guide hours are per side, so they double, and a part the
 * catalog lists once per car (qtyPerCar 1) is needed twice. A part already
 * listed two or more per car covers both sides as it is.
 */
export function forBothSides<T extends { laborHours: number; laborNote: string; position: string; partOptions: Array<{ quantity: number }> }>(quote: T): T {
  return {
    ...quote,
    laborHours: Math.round(quote.laborHours * 2 * 100) / 100,
    position: quote.position ? `${quote.position}, both sides` : "Both sides",
    laborNote: `Both sides: labor ${quote.laborHours} h per side × 2. Parts listed once per car are doubled (left and right may be different part numbers). ${quote.laborNote}`.trim(),
    partOptions: quote.partOptions.map((p) => (p.quantity >= 2 ? p : { ...p, quantity: p.quantity * 2 })),
  };
}
