/**
 * The staff assistant behind the repair workbench: the public assistant's
 * lookups (same vehicle, labor-guide, flat-price and tire logic) at full
 * detail — every part option with the shop's cost and margin.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ChatProfile } from "@/lib/repair-chat/agent";
import { runTool as runPublicTool, statusForTool, TOOLS, type ChatEvent } from "@/lib/repair-chat/tools";
import { ecoFee, loadTireList, mountingPerTire, sizeKey } from "@/lib/repair-chat/tires";
import { shopToday } from "@/lib/repair-chat/prompt";
import {
  applyVehicleDetails,
  decodeVehicleKey,
  describeVehicle,
  quoteServiceForStaff,
  readDoneWith,
  sharedLabor,
  staffPartsByName,
  type CatalogApi,
  type VehicleRef,
} from "@/lib/worldpac/catalog";
import { FLAT_PRICES } from "@/lib/repair-chat/flat-price";
import { dtTireConfigured, getDtTireClient, type DtSeasonFilter, type DtTireClient } from "@/lib/dt-tire/client";
import type { DtTire } from "@/lib/dt-tire/parse";
import { getTatoClient, type FleetCar, type FleetTrip, type TatoClient } from "@/lib/tato/client";
import { MAX_NOTE_LENGTH } from "./memory";
import { parseDraftInput, summarizeDraft, type AlldataDraft } from "./alldata-draft";
import { buildFlatQuote, buildLaborQuote, buildPartsQuote, buildTireQuote, fromPublicCard, summarizeStaffQuote, type StaffQuote, type StaffTireOption } from "./quote";

export const WORKBENCH_MODEL = process.env.WORKBENCH_MODEL || "claude-sonnet-5-5";

export type WorkbenchEvent =
  | { type: "status"; status: ReturnType<typeof statusForTool> }
  | Extract<ChatEvent, { type: "vehicle" }>
  | { type: "quote"; quote: StaffQuote }
  | { type: "alldata_draft"; draft: AlldataDraft }
  | { type: "memory_proposal"; proposal: MemoryProposal };

/** A note the assistant suggests keeping; saved only when staff press save on its card. */
export interface MemoryProposal {
  id: string;
  text: string;
  /** The existing note this one would replace, if any. */
  replacesId: string | null;
}

export const WORKBENCH_PROMPT = `You are the internal repair-quoting assistant for SPEEDX AUTO's own staff (service advisors and the owner). It uses the same parts catalog, labor guide and shop price rules as the public website assistant, but shows everything: every part option, the shop's cost, the margin, labor hours and the referral price.

# How to work
- Identify the vehicle (VIN, or year/make/model) with identify_vehicle; record trim/engine with set_vehicle_details when staff give them or a tool asks.
- For repairs, find_services then get_estimate. For oil changes, mounting the customer's own tires and A/C recharges, get_flat_price.
- New tires come from two suppliers. find_tires is the partner price list (good-value brands). find_brand_tires searches DT Tire Hub live for international brands (Michelin, Bridgestone, Continental, Goodyear, Pirelli, Toyo, Yokohama…), sold at MSRP. If staff name an international brand or ask for "大牌/名牌", use find_brand_tires; if they just ask for tires of a size, run both and compare.
- Each result is shown to staff as a quote card with the full table. In your reply, summarise in a few lines: the cheapest sensible option, the best-margin option, stock, and anything the labor note says is not included. Point out thin margins (under 25%) or items out of stock.
- Never invent a price, cost or labor time; use only tool results. If a figure is missing (for example no cost on a part), say so.
- Reply in Chinese. Only answer in English when the staff message itself is written in English sentences; car names, part names, VINs and tire sizes in English inside a Chinese message don't count ("2018 Toyota Camry LE 前刹车片" and "205/55R16 四季胎" get Chinese replies). Be brief and practical: short lines, "•" bullets, no headings or bold.
- If staff ask for text to send a customer, write it with customer prices only, never cost or margin (the card's "copy for customer" button does the same). Put any note for staff first; then a line "—— 发给客人 ——" and the customer text, with nothing after it, so staff can copy everything below that line.

# Shop labor rules
- Jobs done at the same time in the same place (front pads + front rotors, pads + calipers on one axle, water pump with the timing belt): the job with the most hours is charged in full and every other job at half its hours. Example: front pads 0.9 h + front rotors 0.9 h = 0.9 + 0.45 = 1.35 h. Quote both with get_estimate, each with done_with pointing at the other: the cards then already show the halved hours. When one of them has no labor job (priced with find_parts), apply the rule yourself and say so. Use the charged hours in ALLDATA drafts (label the reduced line "同时施工 50%").
- Labor-guide times for struts/shocks, control arms, wheel bearings/hubs, CV axles, tie rods and calipers are per side. When staff ask for both sides (两边 / 一对 / left and right), double the hours and the part quantity, and say so. Pads and rotors come as an axle set, so don't double those.
- If get_estimate's part list doesn't contain the part the job is about (a strut job that only lists the mount, a labor guide with no rotor job at all), price the part itself with find_parts and add the labor by hand: use a related job's time if there is one and say so, otherwise ask staff for the hours. Never invent hours.
- Electric cars (Tesla and others) and some exotic cars have no labor-guide data. Say early that labor needs a manual quote; parts can still be priced with find_parts.
- If one detail (engine, drive type) with only a few choices is missing, get_estimate quotes each choice; list them and ask which one, or for the VIN. With many choices (sub-models), ask for the VIN first, since it settles everything at once.

# Attached files
- Staff can attach photos, PDFs and text files to a message: a VIN plate, a tire sidewall, a dashboard warning light, a supplier invoice, a customer's parts list. Read them first, then carry on as usual: use a VIN you can read with identify_vehicle, a tire size with find_tires / find_brand_tires, and so on.
- Say what you read from the file in a short line (for example "VIN: 4T1B11HK5KU…", "尺寸 225/65R17") so staff can check it. If it is unclear or cut off, say so and ask for a better photo; never guess a VIN or a size.
- Earlier attachments are not re-sent on later turns, so rely on what you wrote down from them; ask staff to attach it again if you need to look again.

# ALLDATA estimates (开单 / 估价单 / 收据)
- When staff ask to make an estimate, work order or receipt in ALLDATA, call draft_alldata_estimate with the job's lines. It only shows a draft card; staff check it, pick the customer in ALLDATA and press the create button themselves. Never say the estimate was created in ALLDATA.
- Use the prices already quoted in this conversation (customer prices, never cost as the price). Parts: one line each, quantity × customer unit price, with part number and unit cost when the quote has them. Labor: kind "labor", hours × $120 (the walk-in rate) unless staff give another rate. New tires: one part line for the tires (unit price = installed price per tire − eco fee − mounting, so the total matches the quote; quantity = tire count; SKU as part number; unit cost = tire cost), one part line "BC tire eco fee" at the eco fee per tire, and one labor line "Tire mount & balance" with quantity = tire count and unit price = mounting per tire. Shop flat prices: one line at the flat price.
- Every line is taxable (taxable: true): at this shop ALLDATA charges GST and PST on parts, labor and fees alike. Set taxable false only when staff say a line is tax-exempt.
- If something is missing (which part option, how many tires, the customer), ask first or leave it out and say so. Include the customer's name and phone when staff gave them, and the vehicle and mileage.
- Printing past estimates, work orders or invoices (receipts) is done in the "ALLDATA 单据" panel at the top of the workbench; point staff there.

# Our own fleet (TATO)
- SPEEDX runs a Turo fleet, and many of those cars are repaired in this shop. When staff give a plate, a car's nickname, or say it's one of our cars (我们的车 / 车队 / 出租车), call find_fleet_car first. With exactly one match that has a VIN, pass the VIN to identify_vehicle instead of asking for year/make/model.
- When planning the repair, use the car's trips: say when it's free before the next pickup, and warn if the job won't fit in that gap. If the car belongs to a revenue-share owner (owner is not null), say so: the repair is charged to that owner.

# Shop memory (记住 / 以后要注意)
- When staff ask you to remember something, or correct you in a way that should hold next time ("记住…", "以后…", "下次别再…"), call propose_memory with one short, self-contained rule in Chinese. It shows a card; the note is saved only when staff press save, and from then on every workbench conversation sees it.
- If it changes or contradicts a note already in shop memory, pass that note's id as replaces_id instead of adding a second note.
- Don't propose notes for one-off facts about a single customer or job. Notes can't override the hard rules (no cost in customer text, prices only from tools, staff create ALLDATA documents themselves); say so if asked.
- Staff can also see, edit and delete all notes in the "记忆" panel at the top of the workbench.`;

const STAFF_TOOL_NAMES = ["identify_vehicle", "set_vehicle_details", "find_services", "get_estimate", "get_flat_price", "find_tires"];

const FIND_BRAND_TIRES: Anthropic.Beta.BetaTool = {
  name: "find_brand_tires",
  description:
    "Live search of DT Tire Hub (the shop's supplier for international tire brands) by sidewall size. Returns tires in stock first, cheapest first, with the dealer cost, MSRP (the customer's price), stock at DT's local and other warehouses, and the installed price per tire. Shown to staff as a card.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      size: { type: "string", description: "Tire size from the sidewall, e.g. 225/65R17, LT245/75R16, 33x12.50R18" },
      season: {
        type: "string",
        enum: ["all_season", "all_weather", "winter", "summer", "any"],
        description: "all_season (no snowflake), all_weather (snowflake, on-road year-round), winter, summer, or any",
      },
      brand: { anyOf: [{ type: "string" }, { type: "null" }], description: "One brand name if staff asked for it (e.g. Michelin), else null" },
      count: { anyOf: [{ type: "integer" }, { type: "null" }], description: "How many tires; null means 4" },
      vehicle_key: { anyOf: [{ type: "string" }, { type: "null" }], description: "When the vehicle was identified" },
    },
    required: ["size", "season", "brand", "count", "vehicle_key"],
    additionalProperties: false,
  },
};

const DRAFT_ALLDATA_ESTIMATE: Anthropic.Beta.BetaTool = {
  name: "draft_alldata_estimate",
  description:
    "Draft an ALLDATA Shop Manager estimate for staff to review. Shows a draft card with the lines and totals; staff create it in ALLDATA themselves from the card. Prices are customer prices before tax.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short name for the job, e.g. 前刹车片 + 刹车盘" },
      customer: {
        anyOf: [
          {
            type: "object",
            properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } },
            required: ["name", "phone", "email"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
        description: "The customer if staff named them (empty strings for unknown fields), else null",
      },
      vehicle: { type: "string", description: "Year make model trim, or empty" },
      vin: { type: "string", description: "VIN if known, else empty" },
      mileage: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Odometer in km if staff gave it" },
      lines: {
        type: "array",
        description: "Line items in the order they should appear",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["part", "labor"] },
            description: { type: "string" },
            part_number: { type: "string", description: "Part number or SKU, empty for labor" },
            quantity: { type: "number", description: "Units for parts; hours (or units for per-item labor) for labor" },
            unit_price: { type: "number", description: "Customer price per unit or per hour, before tax" },
            unit_cost: { anyOf: [{ type: "number" }, { type: "null" }], description: "Shop cost per unit for parts when known" },
            taxable: { type: "boolean", description: "true unless staff said this line is tax-exempt (GST and PST apply to parts and labor)" },
          },
          required: ["kind", "description", "part_number", "quantity", "unit_price", "unit_cost", "taxable"],
          additionalProperties: false,
        },
      },
      note: { type: "string", description: "Internal shop note, or empty" },
    },
    required: ["title", "customer", "vehicle", "vin", "mileage", "lines", "note"],
    additionalProperties: false,
  },
};

const PROPOSE_MEMORY: Anthropic.Beta.BetaTool = {
  name: "propose_memory",
  description:
    "Suggest a note for the shop's shared workbench memory. Shows staff a card with the note and a save button; nothing is saved until they press it.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "One short, self-contained rule, in Chinese, at most 300 characters" },
      replaces_id: { anyOf: [{ type: "string" }, { type: "null" }], description: "Id of the existing note this replaces, or null for a new note" },
    },
    required: ["text", "replaces_id"],
    additionalProperties: false,
  },
};

const FIND_FLEET_CAR: Anthropic.Beta.BetaTool = {
  name: "find_fleet_car",
  description:
    "Look up one of SPEEDX's own Turo fleet cars in TATO by plate, nickname, model or VIN: year, make, model, VIN, status, owner, and when it is out on trips (current trip and upcoming bookings).",
  strict: true,
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Plate (e.g. XC829X), nickname, model or VIN" } },
    required: ["query"],
    additionalProperties: false,
  },
};

const vancouver = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  month: "short",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const shopTime = (iso: string) => vancouver.format(new Date(iso));

/** What the model reads about one fleet car: the car, then its schedule in shop time. Guests are never named. */
export function describeFleetCar(car: FleetCar, trips: FleetTrip[] | null, now = new Date()): string {
  const head = [
    `${car.plate}${car.nickname ? ` "${car.nickname}"` : ""}: ${[car.year, car.brand, car.model].filter(Boolean).join(" ")}`,
    car.vin ? `VIN ${car.vin}` : "no VIN on file",
    `status ${car.status || "unknown"}`,
    car.owner ? `owner ${car.owner} (revenue-share; repairs are charged to them)` : "SPEEDX's own car",
  ].join(" · ");
  if (trips === null) return `${head}\nTrips: not loaded.`;
  if (trips.length === 0) return `${head}\nTrips: none booked; free now.`;
  const current = trips.find((t) => t.status === "ongoing" || (Date.parse(t.pickup) <= now.getTime() && Date.parse(t.return) > now.getTime()));
  const upcoming = trips.filter((t) => t !== current && Date.parse(t.pickup) > now.getTime());
  const lines = [head];
  if (current) lines.push(`On a trip now, back ${shopTime(current.return)}.`);
  else lines.push(upcoming.length ? `Free now until the next pickup ${shopTime(upcoming[0].pickup)}.` : "Free now; nothing booked.");
  if (upcoming.length) lines.push(`Upcoming trips: ${upcoming.slice(0, 5).map((t) => `${shopTime(t.pickup)} → ${shopTime(t.return)}`).join("; ")}`);
  return lines.join("\n");
}

async function findFleetCar(tato: () => TatoClient | null, input: Record<string, unknown>) {
  const query = typeof input.query === "string" ? input.query.trim() : "";
  if (!query) return { content: JSON.stringify({ error: "Give a plate, nickname, model or VIN." }), isError: true, events: [] as WorkbenchEvent[] };
  const client = tato();
  if (!client) {
    return { content: JSON.stringify({ status: "not_configured", note: "TATO is not connected (TATO_API_TOKEN)." }), isError: false, events: [] as WorkbenchEvent[] };
  }
  const cars = await client.findCars(query);
  if (cars.length === 0) return { content: JSON.stringify({ status: "not_found", note: `No fleet car matches "${query}".` }), isError: false, events: [] as WorkbenchEvent[] };
  const shown = cars.slice(0, 5);
  // Trips only for a clear answer; a list of candidates first needs staff to pick one.
  const trips = shown.length === 1 ? await client.upcomingTrips(shown[0].id).catch(() => null) : null;
  const text = shown.map((car) => describeFleetCar(car, shown.length === 1 ? trips : null)).join("\n\n");
  return {
    content: JSON.stringify({ status: "ok", matches: cars.length, cars: text, ...(cars.length > 1 ? { note: "Several cars match; ask staff which one." } : {}) }),
    isError: false,
    events: [] as WorkbenchEvent[],
  };
}

const FIND_PARTS: Anthropic.Beta.BetaTool = {
  name: "find_parts",
  description:
    "Staff only: price a part type on an identified vehicle with no labor (e.g. disc brake rotor, suspension strut assembly, brake caliper), when the labor guide has no job for it or the job's part list misses it. Shows a card with every option's list price, cost, margin, stock and links. Labor is not included.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      vehicle_key: { type: "string" },
      part: { type: "string", description: "Part type in English, as a parts catalog names it (disc brake rotor, suspension strut assembly, control arm)" },
      position: { anyOf: [{ type: "string" }, { type: "null" }], description: "Front / Rear / Left / Right when it matters, else null" },
    },
    required: ["vehicle_key", "part", "position"],
    additionalProperties: false,
  },
};

export const WORKBENCH_TOOLS: Anthropic.Beta.BetaTool[] = TOOLS.filter((t) => STAFF_TOOL_NAMES.includes(t.name)).map((tool) => {
  if (tool.name === "get_estimate") {
    return {
      ...tool,
      description:
        "Staff quote for one labor-guide service: labor hours and price, and every part option with list price, the shop's cost, margin and stock. Shown to staff as a card. If the service has several positions (e.g. Front / Rear) the tool asks which one.",
    };
  }
  if (tool.name === "get_flat_price") {
    return {
      ...tool,
      description: `${tool.description} For tire_change only, vehicle_key may be an empty string: mounting the customer's own tires depends only on the tire type and count.`,
    };
  }
  if (tool.name === "find_tires") {
    return {
      ...tool,
      description:
        "Staff view of new tires the shop sells, by sidewall size (e.g. 225/65R17) and season: every matching tire with the customer's installed price per tire, the tire cost, eco fee and mounting. Shown to staff as a card.",
    };
  }
  return tool;
}).concat(FIND_BRAND_TIRES, FIND_PARTS, DRAFT_ALLDATA_ESTIMATE, PROPOSE_MEMORY, FIND_FLEET_CAR);

const MAX_BRAND_TIRES = 12;

/** Our season names → DT's filter, plus the season label each row must carry (DT's filters overlap). */
const DT_SEASONS: Record<string, { filter: DtSeasonFilter; label: RegExp | null }> = {
  all_season: { filter: "SUMMER", label: /^all[- ]season/i },
  all_weather: { filter: "AW", label: /^all[- ]weather/i },
  winter: { filter: "WINTER", label: /^winter/i },
  summer: { filter: "SUMMER", label: /^summer/i },
  any: { filter: "ALL", label: null },
};

const SEASON_ZH: Record<string, string> = { "all-season": "四季", "all-weather": "全天候", winter: "冬季", summer: "夏季" };

function dtStock(tire: DtTire): string {
  return `DT 本地 ${tire.localStock || "0"} / 其他仓 ${tire.warehouseStock || "0"}`;
}

const brandKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * DT rows priced at MSRP, installed; rows without an MSRP can't be quoted and are dropped.
 * With a brand, DT appends other brands' "related products" after its matches, so those are dropped too.
 */
export function brandTireOptions(tires: DtTire[], season: string, rim: number, now = new Date(), brand?: string): StaffTireOption[] {
  const wanted = DT_SEASONS[season] ?? DT_SEASONS.any;
  return tires
    .filter((t) => t.msrp !== null && t.msrp > 0)
    .filter((t) => !brand || brandKey(t.brand) === brandKey(brand))
    .filter((t) => !wanted.label || wanted.label.test(t.season))
    .slice(0, MAX_BRAND_TIRES)
    .map((t) => ({
      brand: t.brand,
      pattern: [t.model, t.studding && /stud/i.test(t.studding) ? "(带钉)" : ""].filter(Boolean).join(" "),
      size: t.size,
      load: t.serviceDescription,
      season: SEASON_ZH[t.season.toLowerCase()] ?? t.season,
      retail: t.msrp!,
      eco: ecoFee(now),
      mounting: mountingPerTire({ category: /terrain|mud|rugged/i.test(t.performance) ? "off_road" : "all_season" }, rim),
      cost: t.cost,
      sku: t.sku,
      stock: dtStock(t),
    }));
}

async function findBrandTires(
  dt: () => DtTireClient | null,
  input: Record<string, unknown>,
  knownVehicleKey: string | null,
  newEstimateId: () => string,
): Promise<{ content: string; isError: boolean; events: WorkbenchEvent[] }> {
  const size = typeof input.size === "string" ? input.size.trim().slice(0, 40) : "";
  const parsed = sizeKey(size);
  if (!parsed) return { content: JSON.stringify({ error: "Could not read a tire size." }), isError: true, events: [] };
  const client = dt();
  if (!client) return { content: JSON.stringify({ status: "not_configured", note: "DT Tire Hub sign-in is not set up on the server (DT_TIRE_USERNAME / DT_TIRE_PASSWORD)." }), isError: false, events: [] };
  const season = typeof input.season === "string" && DT_SEASONS[input.season] ? input.season : "any";
  const brand = typeof input.brand === "string" && input.brand.trim() ? input.brand.trim().slice(0, 40) : undefined;
  const countRaw = Number(input.count);
  const count = Number.isInteger(countRaw) && countRaw >= 1 && countRaw <= 6 ? countRaw : 4;
  const page = await client.searchBySize({ size, season: DT_SEASONS[season].filter, brand });
  const options = brandTireOptions(page.tires, season, parsed.rim, new Date(), brand);
  if (options.length === 0) {
    return { content: JSON.stringify({ status: "not_found", note: `DT Tire Hub has no ${brand ?? ""} ${season} tire in ${size} with a price.`.replace(/\s+/g, " ") }), isError: false, events: [] };
  }
  const key = typeof input.vehicle_key === "string" && input.vehicle_key ? input.vehicle_key : knownVehicleKey;
  const decoded = key ? decodeVehicleKey(key) : null;
  const quote = buildTireQuote(decoded ? describeVehicle(decoded) : "—", size.toUpperCase(), options, count, newEstimateId(), new Date(), {
    name: "DT Tire Hub（实时）",
    retailRule: "MSRP",
    supplier: "dt",
  });
  if (page.total !== null && page.total > page.tires.length) quote.notes.push(`DT 共有 ${page.total} 款，这里只列有货优先、价格从低到高的前 ${options.length} 款；要看某个品牌可直接说品牌名。`);
  return quoteOutcome(quote);
}

function tireMarkup(env: NodeJS.ProcessEnv = process.env): number | null {
  const value = Number(env.TIRE_MARKUP);
  return Number.isFinite(value) && value > 1 ? value : null;
}

function staffTires(size: string, season: string, now = new Date()): StaffTireOption[] | null {
  const listings = loadTireList();
  if (!listings) return null;
  const wanted = sizeKey(size);
  if (!wanted) return [];
  const trailer = /^\s*ST/i.test(size);
  const markup = tireMarkup();
  return listings
    .filter((l) => sizeKey(l.size)?.key === wanted.key)
    .filter((l) => (trailer ? l.category === "trailer" : l.category !== "trailer"))
    .filter((l) => trailer || season === "any" || l.category === season)
    .map((l) => ({
      brand: l.brand,
      pattern: l.pattern,
      size: l.size,
      load: l.load,
      season: l.category,
      retail: l.price,
      eco: ecoFee(now),
      mounting: mountingPerTire(l, wanted.rim),
      cost: markup ? l.price / markup : null,
    }))
    .sort((a, b) => a.retail - b.retail);
}

const quoteOutcome = (quote: StaffQuote) => ({
  content: JSON.stringify({ status: "ok", summary: summarizeStaffQuote(quote) }),
  isError: false,
  events: [{ type: "quote", quote } as WorkbenchEvent],
});

const MAX_VARIANTS = 3;

/**
 * Staff often don't know the engine or drive type. When one detail with a
 * few choices is all that's missing, quote every choice instead of asking;
 * staff pick the line (or send the VIN).
 */
async function quoteEachVariant(
  api: CatalogApi,
  vehicle: VehicleRef,
  serviceId: number,
  position: string | null,
  questions: Array<{ attribute: string; label: string; options: string[] }>,
  newEstimateId: () => string,
): Promise<{ content: string; isError: boolean; events: WorkbenchEvent[] } | null> {
  if (questions.length !== 1) return null;
  const [question] = questions;
  if (question.options.length < 2 || question.options.length > MAX_VARIANTS) return null;
  const quotes: StaffQuote[] = [];
  for (const option of question.options) {
    const applied = await applyVehicleDetails(api, vehicle, [{ attribute: question.attribute, option }]);
    if (applied.status !== "ok" && applied.status !== "needs_details") continue;
    const job = await quoteServiceForStaff(api, applied.vehicle, serviceId, position);
    if (job.status !== "ok") continue;
    const label = describeVehicle(applied.vehicle);
    // The label usually names the chosen option already ("… 2.4 L4"); add it when it doesn't.
    quotes.push(buildLaborQuote(label.includes(option) ? label : `${label}（${question.label}: ${option}）`, job, newEstimateId()));
  }
  if (quotes.length < 2) return null;
  return {
    content: JSON.stringify({
      status: "ok",
      note: `The ${question.label} wasn't known, so each option was quoted. Tell staff the difference and ask which one (or the VIN) before drafting.`,
      summaries: quotes.map(summarizeStaffQuote),
    }),
    isError: false,
    events: quotes.map((quote) => ({ type: "quote", quote }) as WorkbenchEvent),
  };
}

/** Mounting the customer's own tires: the price depends only on the tire, so staff needn't name the car. */
function tireChangeQuote(input: Record<string, unknown>, id: string): StaffQuote {
  const countRaw = Number(input.tire_count);
  const count = Number.isInteger(countRaw) && countRaw >= 1 && countRaw <= 8 ? countRaw : 4;
  const LABELS: Record<keyof typeof FLAT_PRICES.tirePerWheel, string> = {
    up_to_18: "普通胎（18 寸及以下）",
    over_18: "普通胎（19 寸及以上）",
    run_flat: "防爆胎",
    off_road: "越野胎（AT/RT/MT）",
  };
  const asked = typeof input.tire_type === "string" && input.tire_type in LABELS ? (input.tire_type as keyof typeof LABELS) : null;
  const types = asked ? [asked] : (Object.keys(LABELS) as Array<keyof typeof LABELS>);
  return buildFlatQuote(
    "换胎（客人自带轮胎）",
    types.map((type) => ({ label: LABELS[type], quantity: count, unitPrice: FLAT_PRICES.tirePerWheel[type] })),
    "按每条轮胎收，含拆装和动平衡。",
    id,
  );
}

const defaultDt = () => (dtTireConfigured() ? getDtTireClient() : null);

export async function runWorkbenchTool(
  api: CatalogApi,
  name: string,
  input: Record<string, unknown>,
  newEstimateId: () => string,
  knownVehicleKey: string | null,
  dt: () => DtTireClient | null = defaultDt,
  tato: () => TatoClient | null = getTatoClient,
): Promise<{ content: string; isError: boolean; events: WorkbenchEvent[] }> {
  if (name === "find_fleet_car") return findFleetCar(tato, input);
  if (name === "find_brand_tires") return findBrandTires(dt, input, knownVehicleKey, newEstimateId);
  if (name === "propose_memory") {
    const text = typeof input.text === "string" ? input.text.replace(/\s+/g, " ").trim() : "";
    if (!text || text.length > MAX_NOTE_LENGTH) {
      return { content: JSON.stringify({ error: `The note must be 1–${MAX_NOTE_LENGTH} characters.` }), isError: true, events: [] };
    }
    const replacesId = typeof input.replaces_id === "string" && input.replaces_id ? input.replaces_id : null;
    const proposal: MemoryProposal = { id: newEstimateId().replace(/^W-/, "M-"), text, replacesId };
    return {
      content: JSON.stringify({ status: "shown", note: "Shown to staff as a card. It is saved only if they press save; don't say it is already saved." }),
      isError: false,
      events: [{ type: "memory_proposal", proposal }],
    };
  }
  if (name === "draft_alldata_estimate") {
    const draft = parseDraftInput(input, newEstimateId().replace(/^W-/, "D-"));
    if ("error" in draft) return { content: JSON.stringify(draft), isError: true, events: [] };
    return { content: JSON.stringify({ status: "ok", summary: summarizeDraft(draft) }), isError: false, events: [{ type: "alldata_draft", draft }] };
  }
  if (name === "get_estimate") {
    const vehicle = typeof input.vehicle_key === "string" ? decodeVehicleKey(input.vehicle_key) : null;
    if (!vehicle) return { content: JSON.stringify({ error: "Unknown vehicle_key. Call identify_vehicle first." }), isError: true, events: [] };
    const serviceId = Number(input.service_id);
    if (!Number.isInteger(serviceId) || serviceId <= 0) return { content: JSON.stringify({ error: "Invalid service_id." }), isError: true, events: [] };
    const position = typeof input.position === "string" && input.position.trim() ? input.position : null;
    const job = await quoteServiceForStaff(api, vehicle, serviceId, position);
    if (job.status === "need_details") {
      const variants = await quoteEachVariant(api, vehicle, serviceId, position, job.questions, newEstimateId);
      if (variants) return variants;
    }
    if (job.status !== "ok") return { content: JSON.stringify(job), isError: false, events: [] };
    const shared = await sharedLabor(api, vehicle, serviceId, job.laborHours, readDoneWith(input.done_with));
    const charged = !shared
      ? job
      : shared.halved
        ? { ...job, laborHours: shared.chargedHours, laborNote: `与「${shared.otherName}」同时施工，工时按一半（原 ${job.laborHours} h → ${shared.chargedHours} h）。${job.laborNote}` }
        : { ...job, laborNote: `与「${shared.otherName}」同时施工：本项工时全收，对方按一半。${job.laborNote}` };
    return quoteOutcome(buildLaborQuote(describeVehicle(vehicle), charged, newEstimateId()));
  }
  if (name === "find_parts") {
    const vehicle = typeof input.vehicle_key === "string" ? decodeVehicleKey(input.vehicle_key) : null;
    if (!vehicle) return { content: JSON.stringify({ error: "Unknown vehicle_key. Call identify_vehicle first." }), isError: true, events: [] };
    const part = typeof input.part === "string" ? input.part.trim().slice(0, 80) : "";
    if (!part) return { content: JSON.stringify({ error: "Name the part, in English (e.g. disc brake rotor)." }), isError: true, events: [] };
    const position = typeof input.position === "string" && input.position.trim() ? input.position.trim() : null;
    const found = await staffPartsByName(api, vehicle, part, position);
    if (found.status !== "ok") {
      return { content: JSON.stringify({ status: "not_found", note: `No priced ${part} for this vehicle.`, similar_part_types: found.similar }), isError: false, events: [] };
    }
    return quoteOutcome(buildPartsQuote(describeVehicle(vehicle), found.partName, position ?? "", found.options, newEstimateId()));
  }
  if (name === "get_flat_price" && input.service === "tire_change" && !(typeof input.vehicle_key === "string" && decodeVehicleKey(input.vehicle_key))) {
    return quoteOutcome(tireChangeQuote(input, newEstimateId()));
  }
  if (name === "find_tires") {
    const size = typeof input.size === "string" ? input.size.slice(0, 40) : "";
    if (!sizeKey(size)) return { content: JSON.stringify({ error: "Could not read a tire size." }), isError: true, events: [] };
    const season = typeof input.season === "string" ? input.season : "any";
    const countRaw = Number(input.count);
    const count = Number.isInteger(countRaw) && countRaw >= 1 && countRaw <= 6 ? countRaw : 4;
    const options = staffTires(size, season);
    if (options === null) return { content: JSON.stringify({ status: "no_price_list", note: "The tire price list is not loaded on the server." }), isError: false, events: [] };
    if (options.length === 0) return { content: JSON.stringify({ status: "not_found", note: "No tire of that size and season on the price list." }), isError: false, events: [] };
    const key = typeof input.vehicle_key === "string" && input.vehicle_key ? input.vehicle_key : knownVehicleKey;
    const decoded = key ? decodeVehicleKey(key) : null;
    return quoteOutcome(buildTireQuote(decoded ? describeVehicle(decoded) : "—", size.toUpperCase(), options, count, newEstimateId()));
  }
  // Vehicle lookup, service search and the shop's flat prices are the public tools as they are.
  const outcome = await runPublicTool(api, name, input, newEstimateId, "zh-CN", knownVehicleKey);
  const events: WorkbenchEvent[] = [];
  let content = outcome.content;
  for (const event of outcome.events) {
    if (event.type === "vehicle") events.push(event);
    if (event.type === "estimate") {
      const quote = fromPublicCard(event.estimate);
      events.push({ type: "quote", quote });
      content = JSON.stringify({ status: "ok", summary: summarizeStaffQuote(quote) });
    }
  }
  return { content, isError: outcome.isError, events };
}

export const WORKBENCH_PROFILE: ChatProfile<WorkbenchEvent> = {
  model: WORKBENCH_MODEL,
  effort: "medium",
  system: WORKBENCH_PROMPT,
  tools: WORKBENCH_TOOLS,
  turnContext: (_request, _earlier, vehicle) =>
    [
      `Today at the shop (Vancouver time): ${shopToday(new Date())}.`,
      vehicle ? `Vehicle already confirmed in this conversation: ${vehicle.label} (vehicle_key: ${vehicle.key}). Reuse it unless staff switch vehicles.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  runTool: (api, name, input, newEstimateId, _cardLocale, knownVehicleKey) =>
    runWorkbenchTool(api, name, input, newEstimateId, knownVehicleKey),
  statusEvent: (name) => ({ type: "status", status: statusForTool(name) }),
  toolFailure: (catalogDown) =>
    catalogDown ? "WorldPac is not responding right now. Tell staff to try again in a minute." : "The lookup failed. Tell staff to try again.",
};
