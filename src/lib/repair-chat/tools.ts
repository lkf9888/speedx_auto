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
import {
  buildEstimate,
  buildFlatEstimate,
  buildTeamQuoteCard,
  summarizeEstimateForModel,
  type EstimateCard,
} from "./pricing";

export type StatusKey = "vehicle" | "services" | "estimate";

export type ChatEvent =
  | { type: "status"; status: StatusKey }
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
          note: "Oil changes, tire changes and A/C refrigerant recharges have shop flat prices: use get_flat_price.",
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
  if (name === "get_estimate" || name === "get_flat_price" || name === "request_team_quote") return "estimate";
  return "vehicle";
}
