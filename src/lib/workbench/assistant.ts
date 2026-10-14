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
import { decodeVehicleKey, describeVehicle, quoteServiceForStaff, type CatalogApi } from "@/lib/worldpac/catalog";
import { buildLaborQuote, buildTireQuote, fromPublicCard, summarizeStaffQuote, type StaffQuote, type StaffTireOption } from "./quote";

export const WORKBENCH_MODEL = process.env.WORKBENCH_MODEL || "claude-sonnet-5-5";

export type WorkbenchEvent =
  | { type: "status"; status: ReturnType<typeof statusForTool> }
  | Extract<ChatEvent, { type: "vehicle" }>
  | { type: "quote"; quote: StaffQuote };

export const WORKBENCH_PROMPT = `You are the internal repair-quoting assistant for SPEEDX AUTO's own staff (service advisors and the owner). It uses the same parts catalog, labor guide and shop price rules as the public website assistant, but shows everything: every part option, the shop's cost, the margin, labor hours and the referral price.

# How to work
- Identify the vehicle (VIN, or year/make/model) with identify_vehicle; record trim/engine with set_vehicle_details when staff give them or a tool asks.
- For repairs, find_services then get_estimate. For oil changes, mounting the customer's own tires and A/C recharges, get_flat_price. For new tires, find_tires.
- Each result is shown to staff as a quote card with the full table. In your reply, summarise in a few lines: the cheapest sensible option, the best-margin option, stock, and anything the labor note says is not included. Point out thin margins (under 25%) or items out of stock.
- Never invent a price, cost or labor time; use only tool results. If a figure is missing (for example no cost on a part), say so.
- Staff may ask in Chinese or English; reply in the language of their message. Be brief and practical: short lines, "•" bullets, no headings or bold.
- If staff ask for text to send a customer, write it with customer prices only, never cost or margin (the card's "copy for customer" button does the same).`;

const STAFF_TOOL_NAMES = ["identify_vehicle", "set_vehicle_details", "find_services", "get_estimate", "get_flat_price", "find_tires"];

export const WORKBENCH_TOOLS: Anthropic.Beta.BetaTool[] = TOOLS.filter((t) => STAFF_TOOL_NAMES.includes(t.name)).map((tool) => {
  if (tool.name === "get_estimate") {
    return {
      ...tool,
      description:
        "Staff quote for one labor-guide service: labor hours and price, and every part option with list price, the shop's cost, margin and stock. Shown to staff as a card. If the service has several positions (e.g. Front / Rear) the tool asks which one.",
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
});

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

export async function runWorkbenchTool(
  api: CatalogApi,
  name: string,
  input: Record<string, unknown>,
  newEstimateId: () => string,
  knownVehicleKey: string | null,
): Promise<{ content: string; isError: boolean; events: WorkbenchEvent[] }> {
  if (name === "get_estimate") {
    const vehicle = typeof input.vehicle_key === "string" ? decodeVehicleKey(input.vehicle_key) : null;
    if (!vehicle) return { content: JSON.stringify({ error: "Unknown vehicle_key. Call identify_vehicle first." }), isError: true, events: [] };
    const serviceId = Number(input.service_id);
    if (!Number.isInteger(serviceId) || serviceId <= 0) return { content: JSON.stringify({ error: "Invalid service_id." }), isError: true, events: [] };
    const position = typeof input.position === "string" && input.position.trim() ? input.position : null;
    const job = await quoteServiceForStaff(api, vehicle, serviceId, position);
    if (job.status !== "ok") return { content: JSON.stringify(job), isError: false, events: [] };
    return quoteOutcome(buildLaborQuote(describeVehicle(vehicle), job, newEstimateId()));
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
