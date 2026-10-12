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
  type CatalogApi,
  type VehicleLookup,
  type VehicleRef,
} from "@/lib/worldpac/catalog";
import { buildEstimate, summarizeEstimateForModel, type EstimateCard } from "./pricing";

export type StatusKey = "vehicle" | "services" | "estimate";

export type ChatEvent =
  | { type: "status"; status: StatusKey }
  | { type: "estimate"; estimate: EstimateCard }
  | { type: "vehicle"; vehicle: { key: string; label: string } };

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
      return {
        status: "needs_details",
        vehicle_key: encodeVehicleKey(lookup.vehicle),
        vehicle: describeVehicle(lookup.vehicle),
        questions: lookup.questions,
      };
    case "ambiguous":
      return { status: "ambiguous", candidates: lookup.candidates };
    case "not_found":
      return { status: "not_found", reason: lookup.reason };
  }
}

function vehicleEvents(lookup: VehicleLookup): ChatEvent[] {
  if (lookup.status !== "ok") return [];
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

export async function runTool(
  api: CatalogApi,
  name: string,
  input: Record<string, unknown>,
  newEstimateId: () => string,
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
      if (quote.status !== "ok") return ok(quote);
      const card = buildEstimate(describeVehicle(vehicle), quote, newEstimateId());
      return ok(
        { status: "ok", summary: summarizeEstimateForModel(card) },
        [{ type: "estimate", estimate: card }],
      );
    }
    default:
      return fail(`Unknown tool ${name}.`);
  }
}

export function statusForTool(name: string): StatusKey {
  if (name === "find_services") return "services";
  if (name === "get_estimate") return "estimate";
  return "vehicle";
}
