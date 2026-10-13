import type Anthropic from "@anthropic-ai/sdk";
import {
  applyVehicleDetails,
  decodeVehicleKey,
  describeVehicle,
  encodeVehicleKey,
  findServices,
  identifyByVin,
  identifyByYearMakeModel,
  quoteService,
  refineVehicle,
  serviceById,
  type CatalogApi,
  type VehicleLookup,
  type VehicleRef,
} from "@/lib/worldpac/catalog";
import { bookableDays, isBookable, parseClosedDates, SLOT_TIMES } from "./booking";
import {
  cylinderCount,
  FLAT_SERVICES,
  flatWord,
  quoteFlatService,
  vehicleFacts,
  type FlatRequest,
  type FlatService,
  type Fuel,
  type OilGrade,
  type Refrigerant,
  type TireType,
  type VehicleSize,
} from "./flat-price";
import { findTires, loadTireList, seasonsForSize, sizeKey, type TireSeason } from "./tires";
import {
  buildEstimate,
  buildTireEstimate,
  buildFlatEstimate,
  buildTeamQuoteCard,
  summarizeEstimateForModel,
  type EstimateCard,
} from "./pricing";

export type StatusKey = "thinking" | "vehicle" | "services" | "estimate";

export type ChatEvent =
  | { type: "status"; status: StatusKey }
  /** The customer asked in the chat for this appointment slot (shop time). */
  | { type: "appointment"; date: string; time: string }
  | { type: "estimate"; estimate: EstimateCard }
  | { type: "vehicle"; vehicle: { key: string; label: string } };

const nullableEnum = (values: readonly string[], description: string) => ({
  anyOf: [{ type: "string", enum: [...values] }, { type: "null" }],
  description,
});

/** Queries that belong to get_flat_price, not the labor guide. */
const FLAT_QUERY = /\b(oil (and filter )?change|change (the )?oil|engine oil (and filter )?(change|service)|tires? (change|swap|mount|install)|(change|swap|mount|install) (the )?tires?|winter tires?|snow tires?|refrigerant|a\/?c (re)?charge|a\/?c gas|freon)\b/i;

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "identify_vehicle",
    description:
      "Look up the customer's vehicle in the parts catalog. Pass a 17-character VIN when the customer gives one; otherwise pass year, make and model. Returns a vehicle_key for the other tools, or questions about trim/engine that must be answered first, or candidate model names when the model was unclear.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        vin: { anyOf: [{ type: "string" }, { type: "null" }], description: "17-character VIN, or null" },
        year: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Model year, e.g. 2019" },
        make: { anyOf: [{ type: "string" }, { type: "null" }], description: "Make in English, e.g. Toyota" },
        model: { anyOf: [{ type: "string" }, { type: "null" }], description: "Model in English, e.g. Camry" },
      },
      required: ["vin", "year", "make", "model"],
      additionalProperties: false,
    },
  },
  {
    name: "set_vehicle_details",
    description:
      "Record the customer's answers to the trim/engine/body questions returned by identify_vehicle. Use the exact attribute names and option labels the tool returned.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        vehicle_key: { type: "string" },
        selections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              attribute: { type: "string", description: "Attribute name, e.g. SubModel" },
              option: { type: "string", description: "Option label exactly as returned, e.g. LE" },
            },
            required: ["attribute", "option"],
            additionalProperties: false,
          },
        },
      },
      required: ["vehicle_key", "selections"],
      additionalProperties: false,
    },
  },
  {
    name: "find_services",
    description:
      "Search the labor guide for repair operations on a confirmed vehicle. Query in English with the component and action, e.g. 'brake pads', 'alternator', 'front struts', 'water pump'. Returns service_id values for get_estimate. Try a different wording if nothing fits.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        vehicle_key: { type: "string" },
        query: { type: "string" },
      },
      required: ["vehicle_key", "query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_estimate",
    description:
      "Build a price estimate for one service on the confirmed vehicle from the shop's labor rate, the labor guide time, and current parts list prices. The estimate is shown to the customer as a card automatically. If the service has several positions (e.g. Front / Rear) the tool asks which one.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        vehicle_key: { type: "string" },
        service_id: { type: "integer" },
        position: { anyOf: [{ type: "string" }, { type: "null" }], description: "e.g. Front or Rear, when asked" },
      },
      required: ["vehicle_key", "service_id", "position"],
      additionalProperties: false,
    },
  },
  {
    name: "get_flat_price",
    description:
      "Shop flat price for an oil change, a tire change (mounting the customer's tires, priced per tire), or an A/C refrigerant recharge, on a confirmed vehicle. Use this instead of find_services for these three services. The result is shown to the customer as a card. Leave oil_grade, tire_type, tire_count or refrigerant null unless the customer said; the card then lists the options.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        vehicle_key: { type: "string" },
        service: { type: "string", enum: [...FLAT_SERVICES] },
        vehicle_size: {
          type: "string",
          enum: ["car", "small_suv", "large_suv_or_pickup"],
          description:
            "Your judgement from the model: car (sedans, hatchbacks, coupes, minivans); small_suv (compact and mid-size crossovers such as RAV4, CR-V, Rogue, Highlander); large_suv_or_pickup (full-size SUVs such as Tahoe, Expedition, Sequoia, and all pickup trucks and full-size vans).",
        },
        fuel: {
          type: "string",
          enum: ["gasoline", "hybrid", "diesel", "electric", "unknown"],
          description: "Diesel only when the customer said so or the vehicle/engine is clearly a diesel.",
        },
        oil_grade: nullableEnum(["standard", "premium"], "Only if the customer chose regular (0W-20) or premium (0W-30) oil"),
        tire_type: nullableEnum(
          ["up_to_18", "over_18", "run_flat", "off_road"],
          "All-season/winter tires up to 18 inch or over 18 inch, run-flat, or AT/RT/MT off-road tires; only if known",
        ),
        tire_count: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Number of tires; null means 4" },
        refrigerant: nullableEnum(["r134a", "r1234yf"], "Only if the customer said which refrigerant"),
        new_price_over_120k: {
          type: "boolean",
          description: "True if this vehicle sold new for more than CAD $120,000.",
        },
      },
      required: [
        "vehicle_key",
        "service",
        "vehicle_size",
        "fuel",
        "oil_grade",
        "tire_type",
        "tire_count",
        "refrigerant",
        "new_price_over_120k",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "find_tires",
    description:
      "Price NEW tires the shop sells (good-value brands), installed. Needs the tire size from the sidewall, e.g. 225/65R17, LT245/75R16 or 33x12.50R18. Shows the customer a card with up to three options; the price per tire already includes mounting and fees. For mounting tires the customer already has, use get_flat_price (tire_change) instead.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        size: { type: "string", description: "Tire size as the customer gave it" },
        season: {
          type: "string",
          enum: ["all_season", "all_weather", "winter", "off_road", "any"],
          description:
            "all_season (no snowflake), all_weather (on-road, snowflake), winter (snow tires), off_road (A/T, M/T, R/T), or any if the customer hasn't said",
        },
        count: { anyOf: [{ type: "integer" }, { type: "null" }], description: "How many tires; null means 4" },
        vehicle_key: { anyOf: [{ type: "string" }, { type: "null" }], description: "When the vehicle was identified" },
        new_price_over_120k: { type: "boolean", description: "True if this vehicle sold new for more than CAD $120,000." },
      },
      required: ["size", "season", "count", "vehicle_key", "new_price_over_120k"],
      additionalProperties: false,
    },
  },
  {
    name: "request_appointment",
    description:
      "Send the shop an appointment request for the day and time the customer named in the chat. Slots are every half hour from 11:00 to 16:30, Monday to Saturday, shop time, not on holidays. The shop confirms by phone or WhatsApp. If the slot isn't open, the result lists open times to offer instead.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD, worked out from today's date" },
        time: { type: "string", enum: [...SLOT_TIMES], description: "Half-hour slot, 24-hour clock" },
      },
      required: ["date", "time"],
      additionalProperties: false,
    },
  },
  {
    name: "request_team_quote",
    description:
      "Show the customer a card asking them to contact the team for a price. Use only when a job cannot be priced online: body, collision or paint work; identify_vehicle returned not_found for the vehicle; or find_services found nothing matching after two different wordings.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        vehicle_key: { anyOf: [{ type: "string" }, { type: "null" }], description: "When the vehicle was identified" },
        vehicle_description: {
          type: "string",
          description: "Year, make and model in English as the customer gave them, e.g. 2023 BYD Atto 3",
        },
        service: { type: "string", description: "The job in a few English words, e.g. Front brake pads" },
      },
      required: ["vehicle_key", "vehicle_description", "service"],
      additionalProperties: false,
    },
  },
];

export interface ToolOutcome {
  content: string;
  isError: boolean;
  events: ChatEvent[];
}

function vehiclePayload(lookup: VehicleLookup) {
  switch (lookup.status) {
    case "ok":
      return {
        status: "ok",
        vehicle_key: encodeVehicleKey(lookup.vehicle),
        vehicle: describeVehicle(lookup.vehicle),
      };
    case "needs_details":
      // Usable now: most jobs don't depend on these. get_estimate asks for
      // a detail only when the labor guide needs it.
      return {
        status: "ok",
        vehicle_key: encodeVehicleKey(lookup.vehicle),
        vehicle: describeVehicle(lookup.vehicle),
        optional_details: lookup.questions,
        note: "Do not ask about these up front. Use them only to record details the customer already gave (set_vehicle_details), or when get_estimate returns need_details.",
      };
    case "ambiguous":
      return { status: "ambiguous", candidates: lookup.candidates };
    case "not_found":
      return { status: "not_found", reason: lookup.reason };
  }
}

function vehicleEvents(lookup: VehicleLookup): ChatEvent[] {
  if (lookup.status !== "ok" && lookup.status !== "needs_details") return [];
  return [
    {
      type: "vehicle",
      vehicle: { key: encodeVehicleKey(lookup.vehicle), label: describeVehicle(lookup.vehicle) },
    },
  ];
}

const ok = (payload: unknown, events: ChatEvent[] = []): ToolOutcome => ({
  content: JSON.stringify(payload),
  isError: false,
  events,
});
const fail = (message: string): ToolOutcome => ({
  content: JSON.stringify({ error: message }),
  isError: true,
  events: [],
});

function readVehicle(input: Record<string, unknown>): VehicleRef | null {
  return typeof input.vehicle_key === "string" ? decodeVehicleKey(input.vehicle_key) : null;
}

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;

/** Free text the model passes onto a card: short, printable, no markup. */
function cardText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[^\p{L}\p{N} .,/()&+'#-]/gu, "").trim().slice(0, max) : "";
}

function teamQuote(vehicle: string, service: string, reason: string, newEstimateId: () => string): ToolOutcome {
  const card = buildTeamQuoteCard(vehicle, service, reason, newEstimateId());
  return ok(
    { status: "team_quote", summary: summarizeEstimateForModel(card) },
    [{ type: "estimate", estimate: card }],
  );
}

/**
 * Engine size decides whether a flat price applies (8+ cylinders never get
 * one). When the engine isn't recorded and some versions of the model have
 * 8+ cylinders, the customer has to say which engine they have.
 */
async function withKnownCylinders(
  api: CatalogApi,
  vehicle: VehicleRef,
): Promise<{ vehicle: VehicleRef } | { ask: VehicleLookup & { status: "needs_details" } }> {
  if (vehicle.attributes.some((a) => a.name === "EngineBase")) return { vehicle };
  const refined = await refineVehicle(api, vehicle);
  if (refined.status === "ok") return { vehicle: refined.vehicle };
  if (refined.status !== "needs_details") return { vehicle };
  const engine = refined.questions.find((q) => q.attribute === "EngineBase");
  const counts = engine?.options.map((o) => cylinderCount(o) ?? 0) ?? [];
  if (engine && counts.some((c) => c >= 8) && counts.some((c) => c < 8)) {
    return { ask: { ...refined, questions: [engine] } };
  }
  if (engine && counts.length > 0 && counts.every((c) => c >= 8)) {
    return {
      vehicle: {
        ...refined.vehicle,
        attributes: [...refined.vehicle.attributes, { name: "EngineBase", id: 0, label: engine.options[0] }],
      },
    };
  }
  return { vehicle: refined.vehicle };
}

export async function runTool(
  api: CatalogApi,
  name: string,
  input: Record<string, unknown>,
  newEstimateId: () => string,
  locale = "en",
): Promise<ToolOutcome> {
  switch (name) {
    case "identify_vehicle": {
      const vin = typeof input.vin === "string" ? input.vin.trim() : "";
      if (vin) {
        const lookup = await identifyByVin(api, vin);
        return ok(vehiclePayload(lookup), vehicleEvents(lookup));
      }
      const year = Number(input.year);
      const make = typeof input.make === "string" ? input.make.trim() : "";
      const model = typeof input.model === "string" ? input.model.trim() : "";
      if (!Number.isInteger(year) || !make || !model) {
        return fail("Provide a VIN, or year + make + model.");
      }
      const lookup = await identifyByYearMakeModel(api, year, make, model);
      return ok(vehiclePayload(lookup), vehicleEvents(lookup));
    }
    case "set_vehicle_details": {
      const vehicle = readVehicle(input);
      if (!vehicle) return fail("Unknown vehicle_key. Call identify_vehicle first.");
      const selections = Array.isArray(input.selections)
        ? (input.selections as Array<{ attribute?: unknown; option?: unknown }>)
            .filter((s) => typeof s?.attribute === "string" && typeof s?.option === "string")
            .slice(0, 6)
            .map((s) => ({ attribute: s.attribute as string, option: s.option as string }))
        : [];
      if (selections.length === 0) return fail("No selections provided.");
      const lookup = await applyVehicleDetails(api, vehicle, selections);
      return ok(vehiclePayload(lookup), vehicleEvents(lookup));
    }
    case "find_services": {
      const vehicle = readVehicle(input);
      if (!vehicle) return fail("Unknown vehicle_key. Call identify_vehicle first.");
      const query = typeof input.query === "string" ? input.query.slice(0, 120) : "";
      if (!query.trim()) return fail("Empty query.");
      if (FLAT_QUERY.test(query)) {
        return ok({
          services: [],
          note: "Oil changes, mounting the customer's own tires and A/C refrigerant recharges have shop flat prices: use get_flat_price. For buying new tires use find_tires.",
        });
      }
      const services = await findServices(api, vehicle, query);
      return ok({
        services: services.map((s) => ({ service_id: s.serviceId, name: s.name, system: s.system })),
      });
    }
    case "get_estimate": {
      const vehicle = readVehicle(input);
      if (!vehicle) return fail("Unknown vehicle_key. Call identify_vehicle first.");
      const serviceId = Number(input.service_id);
      if (!Number.isInteger(serviceId) || serviceId <= 0) return fail("Invalid service_id.");
      const position = typeof input.position === "string" && input.position.trim() ? input.position : null;
      const quote = await quoteService(api, vehicle, serviceId, position);
      if (quote.status === "unavailable") {
        const service = (await serviceById(api, vehicle, serviceId).catch(() => undefined))?.name ?? "Requested service";
        return teamQuote(describeVehicle(vehicle), service, quote.reason, newEstimateId);
      }
      if (quote.status !== "ok") return ok(quote);
      const card = buildEstimate(describeVehicle(vehicle), quote, newEstimateId());
      return ok(
        { status: "ok", summary: summarizeEstimateForModel(card) },
        [{ type: "estimate", estimate: card }],
      );
    }
    case "get_flat_price": {
      const decoded = readVehicle(input);
      if (!decoded) return fail("Unknown vehicle_key. Call identify_vehicle first.");
      const service = pick<FlatService>(input.service, FLAT_SERVICES);
      if (!service) return fail("Unknown service.");
      const known = await withKnownCylinders(api, decoded);
      if ("ask" in known) {
        return ok({
          status: "need_details",
          questions: known.ask.questions,
          vehicle_key: encodeVehicleKey(known.ask.vehicle),
          note: "Ask which engine; the flat price depends on it. Then record it with set_vehicle_details.",
        });
      }
      const count = Number(input.tire_count);
      const request: FlatRequest = {
        service,
        size: pick<VehicleSize>(input.vehicle_size, ["car", "small_suv", "large_suv_or_pickup"]) ?? "car",
        fuel: pick<Fuel>(input.fuel, ["gasoline", "hybrid", "diesel", "electric", "unknown"]) ?? "unknown",
        oilGrade: pick<OilGrade>(input.oil_grade, ["standard", "premium"]),
        tireType: pick<TireType>(input.tire_type, ["up_to_18", "over_18", "run_flat", "off_road"]),
        tireCount: Number.isInteger(count) ? count : null,
        refrigerant: pick<Refrigerant>(input.refrigerant, ["r134a", "r1234yf"]),
        premiumClaimed: input.new_price_over_120k === true,
      };
      const facts = vehicleFacts(known.vehicle);
      const quote = quoteFlatService(facts, request);
      if (quote.status === "not_applicable") return ok(quote);
      if (quote.status === "team_quote") {
        const reason =
          quote.reason === "eight_cylinders"
            ? "8 or more cylinders: no flat price, the team quotes it."
            : "Vehicle sold new above CAD $120,000: no flat price, the team quotes it.";
        return teamQuote(facts.description, flatWord(locale, service), reason, newEstimateId);
      }
      const card = buildFlatEstimate(facts.description, quote, locale, newEstimateId());
      return ok(
        { status: "ok", summary: summarizeEstimateForModel(card) },
        [{ type: "estimate", estimate: card }],
      );
    }
    case "find_tires": {
      const size = typeof input.size === "string" ? input.size.slice(0, 40) : "";
      if (!sizeKey(size)) {
        return fail("Could not read a tire size. Ask for the numbers on the tire sidewall, e.g. 225/65R17.");
      }
      const season = pick<TireSeason | "any">(input.season, ["all_season", "all_weather", "winter", "off_road", "any"]) ?? "any";
      const countRaw = Number(input.count);
      const count = Number.isInteger(countRaw) && countRaw >= 1 && countRaw <= 6 ? countRaw : 4;
      const decoded = typeof input.vehicle_key === "string" ? decodeVehicleKey(input.vehicle_key) : null;
      const vehicle = decoded ? describeVehicle(decoded) : "—";
      const serviceName = `${flatWord(locale, "tires_new")} · ${size.toUpperCase().replace(/\s+/g, " ").trim()}`;
      // Same rule as the shop's other posted prices: V8+ and premium vehicles are quoted by the team.
      if (decoded) {
        const facts = vehicleFacts(decoded);
        if ((facts.cylinders ?? 0) >= 8 || facts.premium || input.new_price_over_120k === true) {
          return teamQuote(vehicle, serviceName, "8+ cylinders or premium vehicle: no posted tire price.", newEstimateId);
        }
      } else if (input.new_price_over_120k === true) {
        return teamQuote(vehicle, serviceName, "Premium vehicle: no posted tire price.", newEstimateId);
      }
      const listings = loadTireList();
      if (!listings) return teamQuote(vehicle, serviceName, "Tire price list not loaded.", newEstimateId);
      const options = findTires(listings, size, season, count);
      if (options.length === 0) {
        const available = seasonsForSize(listings, size);
        if (available.length > 0 && season !== "any") {
          return ok({ status: "not_in_this_season", available_seasons: available });
        }
        return teamQuote(vehicle, serviceName, "Size not on the tire price list.", newEstimateId);
      }
      const card = buildTireEstimate(vehicle, serviceName, options, flatWord(locale, "tires_note"), newEstimateId());
      return ok({ status: "ok", summary: summarizeEstimateForModel(card) }, [{ type: "estimate", estimate: card }]);
    }
    case "request_appointment": {
      const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : "";
      const time = typeof input.time === "string" ? input.time : "";
      const closed = parseClosedDates(process.env.REPAIR_BOOKING_CLOSED_DATES);
      const now = new Date();
      if (!date || !isBookable(date, time, now, closed)) {
        const open = bookableDays(now, closed);
        const sameDay = open.find((d) => d.date === date);
        return ok({
          status: "not_available",
          reason: sameDay
            ? "That time is not an open slot on that day."
            : "The shop takes appointments Monday to Saturday (not holidays), up to 30 days ahead, with 2 hours' notice.",
          open_slots_that_day: sameDay?.slots ?? [],
          next_open_days: open.slice(0, 3).map((d) => ({ date: d.date, first: d.slots[0], last: d.slots[d.slots.length - 1] })),
        });
      }
      return ok(
        {
          status: "requested",
          summary: `Appointment request for ${date} at ${time} sent to the shop. Tell the customer the shop will call or WhatsApp to confirm it; it is not confirmed yet.`,
        },
        [{ type: "appointment", date, time }],
      );
    }
    case "request_team_quote": {
      const known = readVehicle(input);
      const vehicle = known ? describeVehicle(known) : cardText(input.vehicle_description, 80);
      const service = cardText(input.service, 80);
      if (!vehicle || !service) return fail("Give the vehicle and the service.");
      return teamQuote(vehicle, service, "Could not be priced online.", newEstimateId);
    }
    default:
      return fail(`Unknown tool ${name}.`);
  }
}

export function statusForTool(name: string): StatusKey {
  if (name === "find_services") return "services";
  if (name === "get_estimate" || name === "get_flat_price" || name === "find_tires" || name === "request_team_quote") return "estimate";
  if (name === "request_appointment") return "thinking";
  return "vehicle";
}
