/**
 * The staff assistant behind the repair workbench: the public assistant's
 * lookups (same vehicle, labor-guide, flat-price and tire logic) at full
 * detail — every part option with the shop's cost and margin.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ChatProfile } from "@/lib/repair-chat/agent";
import { runTool as runPublicTool, statusForTool, TOOLS, withLatestVehicle, type ChatEvent } from "@/lib/repair-chat/tools";
import { shopNow } from "@/lib/repair-chat/booking";
import { applyPriceOverrides, priceOverrides, rulesFor } from "@/lib/repair-chat/house-rules";
import { getHouseRulesStore } from "./house-rules-store";
import { ecoFee, loadTireList, mountingPerTire, sizeKey, type TireListing } from "@/lib/repair-chat/tires";
import { shopToday } from "@/lib/repair-chat/prompt";
import {
  applyVehicleDetails,
  quoteExtraPartForStaff,
  decodeVehicleKey,
  forBothSides,
  describeVehicle,
  quoteServiceForStaff,
  readDoneWith,
  sharedLabor,
  staffPartsByName,
  type CatalogApi,
  type VehicleRef,
} from "@/lib/worldpac/catalog";
import { westcanLookup } from "@/lib/westcan/nexpart";
import { checkWestcanOnServer } from "./westcan-server";
import { buildUsedQuote } from "./used-part";
import { FLAT_PRICES } from "@/lib/repair-chat/flat-price";
import { dtTireConfigured, getDtTireClient, type DtTireClient } from "@/lib/dt-tire/client";
import { stockCount, type DtTire } from "@/lib/dt-tire/parse";
import { cachedDtSearch, DT_SEASONS, pickDtTires } from "@/lib/dt-tire/options";
import { getTatoClient, type FleetCar, type FleetTrip, type TatoClient } from "@/lib/tato/client";
import { getWheelmartClient, type WheelmartClient } from "@/lib/wheelmart/client";
import { liveWheelmartListings, tireMarkup } from "@/lib/wheelmart/listings";
import { MAX_NOTE_LENGTH } from "./memory";
import { laborShortfall, MIN_LABOR_HOURS, minimumLaborNote } from "@/lib/repair-chat/pricing";
import { customerText } from "./customer-text";
import { parseDraftInput, summarizeDraft, type AlldataDraft } from "./alldata-draft";
import { describePricing, extraPctOf, isPriceTier, snapPricing, TIER_LABEL, type CustomPricing, type PriceTier } from "./price-tier";
import { buildFlatQuote, buildLaborQuote, buildPartsQuote, buildTireQuote, fromPublicCard, summarizeStaffQuote, type StaffQuote, type StaffTireOption } from "./quote";

export const WORKBENCH_MODEL = process.env.WORKBENCH_MODEL || "claude-sonnet-5-5";

export type WorkbenchEvent =
  /** `detail`: what the lookup is doing right now, in words staff can read ("正在查 Westcan…"). */
  | { type: "status"; status: ReturnType<typeof statusForTool>; detail?: string }
  | Extract<ChatEvent, { type: "vehicle" }>
  | { type: "quote"; quote: StaffQuote }
  | { type: "alldata_draft"; draft: AlldataDraft }
  | { type: "memory_proposal"; proposal: MemoryProposal }
  /** The assistant asks which price to quote: the page shows the choices. */
  | { type: "price_choice" }
  /** Staff named the price in words: the conversation remembers it. */
  | { type: "price_tier"; tier: PriceTier };

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
- For repairs, find_services then get_estimate. For oil changes, mounting the customer's own tires and A/C recharges, get_flat_price; for the quick inspection ($80, waived when the repair is done at the shop) and tire puncture repairs ($20 a tire, $30 for AT tires), get_shop_service_price.
- New tires come from two suppliers. find_tires is the partner price list (good-value brands). find_brand_tires searches DT Tire Hub live for international brands (Michelin, Bridgestone, Continental, Goodyear, Pirelli, Toyo, Yokohama…), sold at MSRP. If staff name an international brand or ask for "大牌/名牌", use find_brand_tires; if they just ask for tires of a size, run both and compare.
- Each result is shown to staff as a quote card, and several jobs in one reply also get a combined quote sheet with the grand total. Write for someone new to the job (Kevin, 2026-11-14: "even a beginner should be able to quote"): in a few short lines say what the customer pays at the chosen price (parts and labour, before tax), whether the shop does the job, and when the parts arrive if they're ordered in. Don't mention cost, profit, margin, markup, stock counts or part numbers unless staff ask; they're on the card under 各项明细. Never add up totals yourself: repeat the totals on the cards and the quote sheet (the sheet adds the jobs, one option each). If an option is ordered in, say when it arrives. If a job has no price (待补价), say so in one line; don't send staff to call suppliers.
- Used parts (Kevin, 2026-11-15): only when staff ask for one (usually an engine, transmission, driveshaft or another costly assembly). Never offer a used part to the customer or mention one in text for the customer unless staff ask for that text. Call used_part without part_cost first: the card gives staff the search links (Car-Part Pro, eBay.ca, LKQ Canada) and you tell them in one line to search and come back with the yard, price, shipping and the seller's warranty. When they do, call used_part again with those details; pass the warranty exactly as relayed and never promise one of the shop's own: the customer text says only that the warranty follows the seller's statement. The card shows the used price (the yard's price × 1.3 plus shipping, plus labor); repeat it, don't add it up yourself.
- Never invent a price, cost or labor time; use only tool results. If a figure is missing (for example no cost on a part), say so.
- Reply in Chinese. When the staff message is written in English sentences, the whole reply is in English, notes to staff included; car names, part names, VINs and tire sizes in English inside a Chinese message don't count ("2018 Toyota Camry LE 前刹车片" and "205/55R16 四季胎" get Chinese replies). Be brief and practical: short lines, "•" bullets, no headings or bold.
- Say what every price is: the part's list price, the customer total with labor, or the tire's installed price. Never call a total with labor the part price.
- Don't say what a part includes beyond what the tool lists. A "strut assembly" may be a bare strut or a loaded (quick) strut with the spring and mount: unless the tool says so, tell staff to check the contents by part number before choosing the labor, since a bare strut needs the spring moved over.
- The cards show where each price came from (WorldPac, DT Tire Hub, the partner list, shop flat prices) and link buttons; the tool summary says which. Don't tell staff a supplier wasn't checked or that there are no links when the card has them.
- If staff ask for text to send a customer, write it with customer prices only, never cost or margin (the card's "copy for customer" button does the same). Put any note for staff first; then a line "—— 发给客人 ——" and the customer text, with nothing after it, so staff can copy everything below that line.
- Which price to quote (owner's rule): each conversation quotes one price, which staff choose: 原价 (retail: the customer total), 原价+8折人工 (referral: labor at $96/h), 基础价+8折人工 (friend: WorldPac parts at cost + $100 per part number, not per unit and never above the list price, other suppliers' parts and tires at cost × 1.3 with eco fee and mounting, labor at $96/h) or 成本价+8折人工 (cost: every part at its purchase cost with no markup, labor at $96/h; the card shows its totals, so point staff to the card). Staff can also add extra labor hours (0-100% on top of the guide's) with a slider; the per-turn note says when they did, and the card shows the totals. The per-turn note says which one is chosen. If none is chosen yet, before your first pricing tool call (get_estimate, quote_extra_part, get_flat_price, find_tires, find_brand_tires, find_parts) call ask_price_tier and stop there: write one short line asking which price, and quote nothing until staff choose. When staff name a price in words ("按朋友价", "客户是朋友", "原价", "成本价"), call set_price_tier with it, then go on. Once chosen, give only that price's totals (the tool results list them as customer / referral / friend), say which price it is, and don't list the other prices unless staff ask. Where an option has no friend total (no cost known, or a shop flat price), its friend price is the referral price; say so. In text for the customer, give the chosen totals without explaining how they were worked out, never cost or markup.
- When staff ask for several jobs together (front and rear rotors, pads and rotors, an oil change with brakes), quote each job with its own tool call in the same reply: the page puts them on one quote sheet with one option per job and the grand total, and the customer copy and PDF come from that sheet. A job with no price shows as 待补价 and the rest can still go to the customer. Left and right parts sold as different part numbers (common on European cars) are already one "left + right set" option on brake rotor, pad and shoe jobs and on both_sides jobs: never add the sides up yourself.

# Always leave one question (owner's rule, 2026-11-16)
- End every reply with ONE short question that guesses staff's likely next step: the other axle or side, a matching job (pads with rotors), another price tier, a copy for the customer, an ALLDATA draft, a used part for a costly assembly, or the customer's name and phone.
- When the request is vague (no vehicle, no position, "brakes" without front or rear, a symptom without a job, a size without a season), don't just answer generally: ask the one detail that gives an exact quote, and say what you'll do once you have it.
- Think one step past the quote (Kevin, 2026-11-16: "你没有多思考一步"). Re-asking which option to use is not enough on its own: after pricing, work out what this customer will need next and offer that, for example: rotors without pads (pads, a pad wear sensor and brake fluid are usually done at the same time), parts arriving tomorrow while the front job can be done today (suggest a booking day), a customer text or PDF ready to send, or an ALLDATA draft. Pick the single most valuable one as your question; if an option still has to be chosen, say in one line which one you'd pick and why (stock, arrival day, brand), then ask the deeper question.
- One question per reply, short and specific, never a list; skip it only when staff say they're done.

# Shop labor rules
- The shop doesn't repair or rebuild transmissions (fluid services are fine), replace auto glass, do wheel alignments, or repair exhaust systems and mufflers. If staff ask about those, say so and suggest referring the customer elsewhere; the labor-guide tools won't list alignment or exhaust jobs.
- Minimum labor is per order, not per job: at least 0.5 h in total. When the labor jobs you quote in one reply add up to less, a "最低工时补足" card for the difference is added automatically after the others; count it in totals. ALLDATA drafts get a "Minimum labor charge" line added the same way when their labor lines total under 0.5 h.
- Jobs done at the same time in the same place (front pads + front rotors, pads + calipers on one axle, water pump with the timing belt): the job with the most hours is charged in full and every other job at half its hours. Example: front pads 0.9 h + front rotors 0.9 h = 0.9 + 0.45 = 1.35 h. Quote both with get_estimate, each with done_with_service_id / done_with_position pointing at the other: the cards then already show the halved hours. When one of them has no labor job (priced with find_parts), apply the rule yourself and say so. Use the charged hours in ALLDATA drafts (label the reduced line "同时施工 50%").
- Labor-guide times for struts/shocks, control arms, wheel bearings/hubs, CV axles, tie rods and calipers are per side. When staff ask for both sides (两边 / 一对 / left and right), call get_estimate with both_sides true: the card, the customer text and your numbers then all show labor × 2 and both sides' parts. Never double in your reply what the card shows single. Pads and rotors are quoted per axle (left and right together), so they are never both_sides. Left and right are often different part numbers: tell staff to order one of each.
- Tires must meet the vehicle's load index and speed rating (the placard or the original tire). Never offer or approve a lower load index or speed rating, and a customer's written consent or waiver doesn't change that: say the shop can't install it and give tires that meet the spec.
- Quantities staff ask for go into the tool as they are (8 tires for two cars is count 8). If a tool refuses a number, tell staff; never quote a different number than they asked for.
- When staff narrow a choice (no studs, one SKU, one brand), pass it to the tool (studs, skus, brand) so the card and the customer text show only those; don't just leave the others out of your reply.
- If get_estimate's part list doesn't contain the part the job is about (a strut job that only lists the mount, a labor guide with no rotor job at all), price the part itself with find_parts and add the labor by hand: use a related job's time if there is one and say so, otherwise ask staff for the hours. Never invent hours.
- Electric cars (Tesla and others) and some exotic cars have no labor-guide data. Say early that labor needs a manual quote; parts can still be priced with find_parts.
- If one detail (engine, drive type) with only a few choices is missing, get_estimate quotes each choice; list them and ask which one, or for the VIN. With many choices (sub-models), ask for the VIN first, since it settles everything at once.

# Attached files
- Staff can attach photos, PDFs and text files to a message: a VIN plate, a tire sidewall, a dashboard warning light, a supplier invoice, a customer's parts list. Read them first, then carry on as usual: use a VIN you can read with identify_vehicle, a tire size with find_tires / find_brand_tires, and so on.
- Say what you read from the file in a short line (for example "VIN: 4T1B11HK5KU…", "尺寸 225/65R17") so staff can check it. If it is unclear or cut off, say so and ask for a better photo; never guess a VIN or a size.
- Earlier attachments are not re-sent on later turns, so rely on what you wrote down from them; ask staff to attach it again if you need to look again.

# ALLDATA estimates (开单 / 估价单 / 收据)
- When staff ask to make an estimate, work order or receipt in ALLDATA, call draft_alldata_estimate with the job's lines. It only shows a draft card; staff check it, pick the customer in ALLDATA and press the create button themselves. Never say the estimate was created in ALLDATA.
- Use the prices already quoted in this conversation (customer prices, never cost as the price). Parts: one line each, quantity × customer unit price, with part number and unit cost when the quote has them. Labor: kind "labor", hours × the conversation's labor rate ($120 at the retail price, $96 at the referral or friend price) unless staff give another rate. At the friend price, each part's unit price is its friend parts total (the option's friend total minus labor) ÷ quantity. New tires: one part line for the tires (unit price = installed price per tire − eco fee − mounting, so the total matches the quote; quantity = tire count; SKU as part number; unit cost = tire cost), one part line "BC tire eco fee" at the eco fee per tire, and one labor line "Tire mount & balance" with quantity = tire count and unit price = mounting per tire. Shop flat prices: one line at the flat price.
- Every line is taxable (taxable: true): at this shop ALLDATA charges GST and PST on parts, labor and fees alike. Set taxable false only when staff say a line is tax-exempt.
- If something is missing (which part option, which oil grade, how many tires, the customer), ask first or leave it out and say so. Don't pick between the card's options for staff unless they told you which. Include the customer's name and phone when staff gave them, and the vehicle and mileage.
- Printing past estimates, work orders or invoices (receipts) is done in the "ALLDATA 单据" panel at the top of the workbench; point staff there.

# Our own fleet (TATO)
- SPEEDX runs a Turo fleet, and many of those cars are repaired in this shop. When staff give a plate, a car's nickname, or say it's one of our cars (我们的车 / 车队 / 出租车), call find_fleet_car first. With exactly one match that has a VIN, pass the VIN to identify_vehicle instead of asking for year/make/model.
- When planning the repair, use the car's trips: say when it's free before the next pickup, and warn if the job won't fit in that gap. If the car belongs to a revenue-share owner (owner is not null), say so: the repair is charged to that owner.

# Shop memory (记住 / 以后要注意)
- When staff ask you to remember something, or correct you in a way that should hold next time ("记住…", "以后…", "下次别再…"), call propose_memory with one short, self-contained rule in Chinese. It shows a card; the note is saved only when staff press save, and from then on every workbench conversation sees it.
- If it changes or contradicts a note already in shop memory, pass that note's id as replaces_id instead of adding a second note.
- Don't propose notes for one-off facts about a single customer or job. Notes can't override the hard rules (no cost in customer text, prices only from tools, staff create ALLDATA documents themselves); say so if asked.
- Staff can also see, edit and delete all notes in the "记忆" panel at the top of the workbench.`;

const STAFF_TOOL_NAMES = ["identify_vehicle", "set_vehicle_details", "check_recalls", "find_services", "get_estimate", "quote_extra_part", "get_flat_price", "get_shop_service_price", "find_tires"];

const USED_PART: Anthropic.Beta.BetaTool = {
  name: "used_part",
  description:
    "Used part quote, ONLY when staff ask for a used part (engines, transmissions, driveshafts and other costly assemblies). Without part_cost it shows search links (Car-Part Pro, eBay.ca, LKQ Canada) with the labor and no part price; staff search there and come back with what they found. With part_cost it builds the quote: the yard's price × 1.3 plus shipping, plus labor. Shown to staff as a card; the customer text says it is a used part with the seller's warranty and never names the yard or the cost. Leave out any detail staff didn't give.",
  // Not strict: its optional fields would be nullable unions, and strict tools share a limit of 16 of those.
  input_schema: {
    type: "object",
    properties: {
      vehicle_key: { type: "string", description: "From identify_vehicle" },
      service: { type: "string", description: "The job, in English, e.g. Engine R&R. Use the same name as the new-part quote for this job when there is one, so they sit together on the quote sheet." },
      position: { type: "string", description: "Front / Rear or similar, only when it applies" },
      labor_hours: { type: "number", description: "Labor hours from the labor guide or the earlier quote; if you don't know them, ask staff or run get_estimate first" },
      part: { type: "string", description: "The used part in English, e.g. Engine assembly 2.5L" },
      yard: { type: "string", description: "Where it was found (yard or seller name), if staff said" },
      grade: { type: "string", description: "Grade (A/B/C) if staff said" },
      mileage_km: { type: "integer", description: "Mileage in km if staff said" },
      warranty: { type: "string", description: "The seller's warranty exactly as staff relayed it (e.g. 90 days); never invent one" },
      part_cost: { type: "number", description: "The yard's price per unit in CAD; leave out until staff have found one" },
      shipping: { type: "number", description: "Shipping for the whole order in CAD; 0 when staff pick it up" },
      quantity: { type: "integer", description: "Units; default 1" },
      eta: { type: "string", description: "How long until it arrives, as staff said it, e.g. 3 days" },
      part_number: { type: "string", description: "Part or stock number if staff gave one" },
    },
    required: ["vehicle_key", "service", "part"],
    additionalProperties: false,
  },
};

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
      count: { anyOf: [{ type: "integer" }, { type: "null" }], description: "How many tires (1–20); null means 4" },
      vehicle_key: { anyOf: [{ type: "string" }, { type: "null" }], description: "When the vehicle was identified" },
      studs: { type: "string", enum: ["any", "exclude", "only"], description: "exclude when staff don't want studded tires, only when they want studded, else any" },
      skus: { type: "string", description: "Comma-separated SKUs to show only those tires (when staff picked specific ones), else empty" },
    },
    required: ["size", "season", "brand", "count", "vehicle_key", "studs", "skus"],
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

const ASK_PRICE_TIER: Anthropic.Beta.BetaTool = {
  name: "ask_price_tier",
  description:
    "Ask staff which price this conversation should quote (retail, referral or friend). Shows them three buttons; their choice comes back as their next message. Use it before the first quote when no price is chosen yet.",
  strict: true,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
};

const SET_PRICE_TIER: Anthropic.Beta.BetaTool = {
  name: "set_price_tier",
  description: "Record the price staff named for this conversation (retail 原价, referral 原价+8折人工, friend 基础价+8折人工, cost 成本价+8折人工). Every quote card in the conversation then shows that price.",
  strict: true,
  input_schema: {
    type: "object",
    properties: { tier: { type: "string", enum: ["retail", "referral", "friend", "cost"] } },
    required: ["tier"],
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
  // The dates decide; a trip TATO still calls "ongoing" after its return time is stale data, not a car out on the road.
  const current = trips.find((t) => Date.parse(t.pickup) <= now.getTime() && Date.parse(t.return) > now.getTime());
  const stale = trips.filter((t) => t.status === "ongoing" && Date.parse(t.return) <= now.getTime());
  const upcoming = trips.filter((t) => t !== current && Date.parse(t.pickup) > now.getTime());
  const lines = [head];
  for (const t of stale) {
    const days = Math.floor((now.getTime() - Date.parse(t.return)) / 86_400_000);
    lines.push(`Stale in TATO: a trip still marked ongoing was due back ${shopTime(t.return)} (${days} days ago). Ask staff to check where the car is before planning the repair.`);
  }
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
      position: { type: "string", description: "Front / Rear / Left / Right when it matters, else empty" },
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
        "Staff view of the value-brand tires the shop sells, by sidewall size (e.g. 225/65R17) and season: the partner price list plus Wheel Mart Canada's live stock (each row says which, with Wheel Mart's stock on hand). Every matching tire with the customer's installed price per tire, the tire cost, eco fee and mounting. Shown to staff as a card.",
    };
  }
  return tool;
}).concat(FIND_BRAND_TIRES, FIND_PARTS, USED_PART, DRAFT_ALLDATA_ESTIMATE, PROPOSE_MEMORY, FIND_FLEET_CAR, ASK_PRICE_TIER, SET_PRICE_TIER);

const MAX_BRAND_TIRES = 12;
export const MAX_TIRE_COUNT = 20;

/** A tire count from the model: null means 4; anything outside 1–20 is refused, never quietly changed. */
export function readTireCount(raw: unknown): number | { error: string } {
  if (raw === null || raw === undefined) return 4;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_TIRE_COUNT ? n : { error: `Tire count must be a whole number from 1 to ${MAX_TIRE_COUNT}; ask staff how many (or split a larger order).` };
}


const SEASON_ZH: Record<string, string> = { "all-season": "四季", "all-weather": "全天候", winter: "冬季", summer: "夏季" };

function dtStock(tire: DtTire): string {
  return `DT 本地 ${tire.localStock || "0"} / 其他仓 ${tire.warehouseStock || "0"}`;
}

/**
 * DT rows priced at MSRP, installed; rows without an MSRP can't be quoted and are dropped.
 * With a brand, DT appends other brands' "related products" after its matches, so those are dropped too.
 */
export function brandTireOptions(
  tires: DtTire[],
  season: string,
  rim: number,
  now = new Date(),
  brand?: string,
  filters: { studs?: string; skus?: string[] } = {},
): StaffTireOption[] {
  return pickDtTires(tires, season, brand, filters, MAX_BRAND_TIRES).map((t) => ({
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
      ...(stockCount(t.localStock) + stockCount(t.warehouseStock) > 0 ? {} : { outOfStock: true }),
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
  const count = readTireCount(input.count);
  if (typeof count !== "number") return { content: JSON.stringify(count), isError: true, events: [] };
  const page = await cachedDtSearch(client, { size, season: DT_SEASONS[season].filter, brand });
  const options = brandTireOptions(page.tires, season, parsed.rim, new Date(), brand, {
    studs: typeof input.studs === "string" ? input.studs : "any",
    skus: typeof input.skus === "string" ? input.skus.split(/[,\s]+/) : [],
  });
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

/**
 * Every matching tire for staff: the partner price list (cost worked back
 * from the markup) and Wheel Mart's live rows (real dealer cost and stock).
 * Null when neither source is available.
 */
async function staffTires(size: string, season: string, wheelmart: () => WheelmartClient | null, now = new Date()): Promise<StaffTireOption[] | null> {
  const listings = loadTireList();
  const client = wheelmart();
  const markup = tireMarkup();
  if (!listings && !(client && markup)) return null;
  const wanted = sizeKey(size);
  if (!wanted) return [];
  const trailer = /^\s*ST/i.test(size);
  const fits = (l: TireListing) =>
    sizeKey(l.size)?.key === wanted.key &&
    (trailer ? l.category === "trailer" : l.category !== "trailer") &&
    (trailer || season === "any" || l.category === season);
  const fromList: StaffTireOption[] = (listings ?? []).filter(fits).map((l) => ({
    brand: l.brand,
    pattern: l.pattern,
    size: l.size,
    load: l.load,
    season: l.category,
    retail: l.price,
    eco: ecoFee(now),
    mounting: mountingPerTire(l, wanted.rim),
    cost: markup ? l.price / markup : null,
    stock: "价目表",
  }));
  const fromWheelmart: StaffTireOption[] = (await liveWheelmartListings(client, size, markup)).filter(fits).map((l) => ({
    brand: l.brand,
    pattern: l.pattern,
    size: l.size,
    load: l.load,
    season: l.category,
    retail: l.price,
    eco: ecoFee(now),
    mounting: mountingPerTire(l, wanted.rim),
    cost: l.cost,
    sku: l.sku,
    stock: [`Wheel Mart 库存 ${l.onHand > 0 ? l.onHandText : "0（无货）"}`, l.remarks].filter(Boolean).join(" · "),
    ...(l.onHand > 0 ? {} : { outOfStock: true }),
  }));
  return [...fromList, ...fromWheelmart].sort((a, b) => a.retail - b.retail);
}

const quoteOutcome = (quote: StaffQuote, othersUnchecked = false) => ({
  content: JSON.stringify({
    status: "ok",
    summary: summarizeStaffQuote(quote),
    ...(quote.westcan
      ? {
          westcan: quote.westcan.checked
            ? `No WorldPac local stock, so Westcan was checked just now: ${quote.westcan.checked.note ?? `${quote.westcan.checked.found} option(s)`}. The options in the summary are final (Westcan comes before WorldPac ordered-in parts).`
            : "No WorldPac local stock: the page is now checking Westcan from staff's Chrome and the card will update by itself (Westcan comes before WorldPac ordered-in parts). Say the card shows the final parts price; don't present the ordered-in price as final.",
        }
      : {}),
    // No WorldPac local stock and no Westcan check at all (Nexpart couldn't match the vehicle or part): not "nobody has it".
    ...(othersUnchecked
      ? { other_suppliers: "No WorldPac local stock, and Westcan and Lordco could NOT be checked for this part (their catalog didn't match this vehicle or part). Tell staff the other suppliers are unchecked, not out of stock, and that they should look there by hand. Never say no supplier has it." }
      : {}),
  }),
  isError: false,
  events: [{ type: "quote", quote } as WorkbenchEvent],
});

/**
 * The part category Nexpart should be asked for. WorldPac's own category code isn't always the ACES part type
 * (a Porsche rotor is N1000 while its parts say ACES 1896); the parts WorldPac returned carry the ACES id, so it wins.
 */
export function nexpartCategory(quote: Pick<StaffQuote, "options">, partCategory: string | undefined): string | undefined {
  // Only parts of the job's own category count: a rotor job's list can also carry pads (ACES 1684).
  const aces = quote.options
    .filter((o) => !partCategory || o.fields?.categoryCode === partCategory)
    .map((o) => Number(o.fields?.acaPartTerminologyID))
    .find((n) => Number.isInteger(n) && n > 0);
  return aces ? `N${aces}` : partCategory;
}

/** Nothing WorldPac has locally: the quote gets a Westcan check (Kevin, 2026-11-15). */
async function withWestcan(
  quote: StaffQuote,
  vehicle: VehicleRef,
  partCategory: string | undefined,
  position: string,
  bothSides: boolean,
  progress: (detail: string) => void = () => {},
): Promise<StaffQuote> {
  const local = quote.options.some((o) => !o.outOfStock && !o.eta && o.partNumber);
  const category = nexpartCategory(quote, partCategory);
  if (local) {
    progress("WorldPac 本地仓库有货，不用再查其他供货商");
    return quote;
  }
  if (!category) {
    progress("WorldPac 本地没货，但没有零件类别，Westcan 和 Lordco 没法查");
    return quote;
  }
  progress("WorldPac 本地没货，正在查 Westcan：先在 Nexpart 里匹配车型和零件类别…");
  const lookup = await Promise.race([
    westcanLookup(vehicle, category, position, { bothSides }).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
  if (!lookup) {
    progress("Nexpart 没能匹配这辆车或这个零件（或 8 秒内没回应），Westcan 和 Lordco 这次没查成");
    return quote;
  }
  // The server's own Nexpart sign-in first; the staff extension is the fallback.
  progress("车型已匹配，正在登录 Nexpart 查 Westcan 库存和价格…");
  return checkWestcanOnServer(quote, lookup, { onProgress: progress });
}

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
  bothSides = false,
): Promise<{ content: string; isError: boolean; events: WorkbenchEvent[] } | null> {
  if (questions.length !== 1) return null;
  const [question] = questions;
  if (question.options.length < 2 || question.options.length > MAX_VARIANTS) return null;
  const quotes: StaffQuote[] = [];
  for (const option of question.options) {
    const applied = await applyVehicleDetails(api, vehicle, [{ attribute: question.attribute, option }]);
    if (applied.status !== "ok" && applied.status !== "needs_details") continue;
    const quoted = await quoteServiceForStaff(api, applied.vehicle, serviceId, position, bothSides);
    if (quoted.status !== "ok") continue;
    const job = bothSides ? forBothSides(quoted) : quoted;
    const label = describeVehicle(applied.vehicle);
    // The label usually names the chosen option already ("… 2.4 L4"); add it when it doesn't.
    quotes.push(buildLaborQuote(label.includes(option) ? label : `${label}（${question.label}: ${option}）`, job, newEstimateId()));
  }
  // Every option priced, or none: quotes for only some engines mislead when staff have the missing one.
  if (quotes.length < question.options.length) return null;
  // The detail doesn't change the price: one card is enough.
  const same = (q: StaffQuote) => JSON.stringify([q.labor?.hours, q.options.map((o) => [o.label, o.partNumber, o.unitPrice, o.quantity])]);
  if (new Set(quotes.map(same)).size === 1) {
    const merged = { ...quotes[0], vehicle: describeVehicle(vehicle) };
    const quote = { ...merged, customerText: customerText(merged) };
    return {
      content: JSON.stringify({ status: "ok", note: `Same price for every ${question.label} (${question.options.join(", ")}).`, summary: summarizeStaffQuote(quote) }),
      isError: false,
      events: [{ type: "quote", quote } as WorkbenchEvent],
    };
  }
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
/**
 * The owner's new flat prices running today (set in 调教对外助手), so staff
 * quote the same flat prices as the website. Never blocks a quote.
 */
async function staffPriceOverrides(): Promise<Map<string, number>> {
  try {
    const rules = (await getHouseRulesStore()?.list()) ?? [];
    return priceOverrides(rulesFor(rules, shopNow(new Date()).date, null));
  } catch {
    return new Map();
  }
}

/** How many tires a patch is for: left out means one; a number outside 1 to 6 is refused rather than changed. */
function readPatchCount(raw: unknown): number {
  if (raw === null || raw === undefined) return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : Number.NaN;
}

/** The $80 quick inspection and the tire puncture repair ($20 a tire, $30 for AT tires): the same for every vehicle. */
function shopServiceQuote(input: Record<string, unknown>, id: string, prices: ReadonlyMap<string, number>, vehicle: string): StaffQuote {
  if (input.service === "inspection") {
    const quote = buildFlatQuote(
      "车辆快速检查",
      [{ label: "快速检查（客人在店里维修则免收）", quantity: 1, unitPrice: prices.get("inspection_quick") ?? FLAT_PRICES.inspection }],
      "一口价。客人决定在我们这里维修的话，检查费免收：做成报价时把这一行去掉。",
      id,
    );
    return { ...quote, vehicle };
  }
  const count = readPatchCount(input.tire_count);
  const asked = input.tire_kind === "standard" || input.tire_kind === "at" ? input.tire_kind : null;
  const rows = [
    { kind: "standard", label: "补胎 · 普通胎（每条）", unitPrice: prices.get("tire_patch_standard") ?? FLAT_PRICES.tirePatch.standard },
    { kind: "at", label: "补胎 · AT 胎（每条）", unitPrice: prices.get("tire_patch_at") ?? FLAT_PRICES.tirePatch.at },
  ].filter((r) => !asked || r.kind === asked);
  const quote = buildFlatQuote("补胎", rows.map((r) => ({ label: r.label, quantity: count, unitPrice: r.unitPrice })), "按每条轮胎收；能不能补以到店检查为准，补不了要换胎。", id);
  return { ...quote, vehicle };
}

function tireChangeQuote(input: Record<string, unknown>, id: string, prices: ReadonlyMap<string, number> = new Map()): StaffQuote {
  const parsedCount = readTireCount(input.tire_count);
  const count = typeof parsedCount === "number" ? parsedCount : 4;
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
    types.map((type) => ({ label: LABELS[type], quantity: count, unitPrice: prices.get(`tire_${type}`) ?? FLAT_PRICES.tirePerWheel[type] })),
    "按每条轮胎收，含拆装和动平衡。",
    id,
  );
}

const defaultDt = () => (dtTireConfigured() ? getDtTireClient() : null);

export async function runWorkbenchTool(
  api: CatalogApi,
  name: string,
  rawInput: Record<string, unknown>,
  newEstimateId: () => string,
  knownVehicleKey: string | null,
  dt: () => DtTireClient | null = defaultDt,
  tato: () => TatoClient | null = getTatoClient,
  wheelmart: () => WheelmartClient | null = getWheelmartClient,
  progress: (detail: string) => void = () => {},
): Promise<{ content: string; isError: boolean; events: WorkbenchEvent[] }> {
  const input = withLatestVehicle(rawInput, knownVehicleKey);
  if (name === "find_fleet_car") return findFleetCar(tato, input);
  if (name === "ask_price_tier") {
    return {
      content: JSON.stringify({ status: "shown", note: "Staff see three quick price buttons plus a parts slider and a labor slider, and confirm. Ask in one short line which price to quote, quote nothing yet, and stop." }),
      isError: false,
      events: [{ type: "price_choice" }],
    };
  }
  if (name === "set_price_tier") {
    if (!isPriceTier(input.tier) || input.tier === "custom") return { content: JSON.stringify({ error: "tier must be retail, referral or friend" }), isError: true, events: [] };
    return { content: JSON.stringify({ status: "set", tier: input.tier }), isError: false, events: [{ type: "price_tier", tier: input.tier }] };
  }
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
    const bothSides = input.both_sides === true;
    const quoted = await quoteServiceForStaff(api, vehicle, serviceId, position, bothSides);
    if (quoted.status === "need_details") {
      const variants = await quoteEachVariant(api, vehicle, serviceId, position, quoted.questions, newEstimateId, bothSides);
      if (variants) return variants;
    }
    if (quoted.status !== "ok") return { content: JSON.stringify(quoted), isError: false, events: [] };
    const job = bothSides ? forBothSides(quoted) : quoted;
    const shared = await sharedLabor(api, vehicle, serviceId, job.laborHours, readDoneWith(input));
    const charged = !shared
      ? job
      : shared.halved
        ? { ...job, laborHours: shared.chargedHours, laborNote: `与「${shared.otherName}」同时施工，工时按一半（原 ${job.laborHours} h → ${shared.chargedHours} h）。${job.laborNote}` }
        : { ...job, laborNote: `与「${shared.otherName}」同时施工：本项工时全收，对方按一半。${job.laborNote}` };
    const built = buildLaborQuote(describeVehicle(vehicle), charged, newEstimateId());
    progress(`WorldPac：${job.laborHours} h 工时，${built.options.length} 个零件选项${built.options.some((o) => !o.outOfStock && !o.eta && o.partNumber) ? "，本地有货" : "，本地没货"}`);
    const checked = await withWestcan(built, vehicle, quoted.partCategory, quoted.position, bothSides, progress);
    // A part to buy, nothing local, and Nexpart never asked: unchecked, not "nobody has it".
    const unchecked = !checked.westcan && Boolean(quoted.partCategory) && !checked.options.some((o) => !o.outOfStock && !o.eta && o.partNumber);
    return quoteOutcome(checked, unchecked);
  }
  if (name === "quote_extra_part") {
    const vehicle = typeof input.vehicle_key === "string" ? decodeVehicleKey(input.vehicle_key) : null;
    if (!vehicle) return { content: JSON.stringify({ error: "Unknown vehicle_key. Call identify_vehicle first." }), isError: true, events: [] };
    const part = input.part === "brake_rotor" || input.part === "brake_caliper" ? input.part : null;
    const position = input.position === "Front" || input.position === "Rear" ? input.position : null;
    if (!part || !position) return { content: JSON.stringify({ error: "Say which part (brake_rotor or brake_caliper) and Front or Rear." }), isError: true, events: [] };
    const found = await quoteExtraPartForStaff(api, vehicle, part, position, part === "brake_caliper" && Number(input.count) === 2 ? 2 : 1);
    if (found.status === "has_labor_job") {
      return { content: JSON.stringify({ status: "use_get_estimate", service_id: found.serviceId, name: found.name }), isError: false, events: [] };
    }
    if (found.status === "no_parts") return { content: JSON.stringify({ status: "not_found", note: "No priced part found by name; try find_parts." }), isError: false, events: [] };
    return quoteOutcome(buildLaborQuote(describeVehicle(vehicle), found.job, newEstimateId()));
  }
  if (name === "used_part") {
    const vehicle = typeof input.vehicle_key === "string" ? decodeVehicleKey(input.vehicle_key) : null;
    if (!vehicle) return { content: JSON.stringify({ error: "Unknown vehicle_key. Call identify_vehicle first." }), isError: true, events: [] };
    const str = (v: unknown) => (typeof v === "string" ? v : null);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const quote = buildUsedQuote(
      {
        vehicle: describeVehicle(vehicle),
        service: str(input.service) ?? "",
        position: str(input.position),
        laborHours: num(input.labor_hours),
        part: str(input.part) ?? "",
        yard: str(input.yard),
        grade: str(input.grade),
        mileageKm: num(input.mileage_km),
        warranty: str(input.warranty),
        partCost: num(input.part_cost),
        shipping: num(input.shipping),
        quantity: num(input.quantity),
        eta: str(input.eta),
        partNumber: str(input.part_number),
      },
      newEstimateId(),
    );
    if (!quote) return { content: JSON.stringify({ error: "A used part needs the labor hours and the part name. Ask staff, or run get_estimate for the job first." }), isError: true, events: [] };
    return quoteOutcome(quote);
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
  if (name === "get_shop_service_price") {
    const key = typeof input.vehicle_key === "string" && input.vehicle_key ? input.vehicle_key : knownVehicleKey;
    const decoded = key ? decodeVehicleKey(key) : null;
    if (input.service !== "inspection" && input.service !== "tire_repair") return { content: JSON.stringify({ error: "Unknown service." }), isError: true, events: [] };
    if (input.service === "tire_repair" && Number.isNaN(readPatchCount(input.tire_count))) return { content: JSON.stringify({ error: "Tire count must be a whole number from 1 to 6; ask staff how many." }), isError: true, events: [] };
    return quoteOutcome(shopServiceQuote(input, newEstimateId(), await staffPriceOverrides(), decoded ? describeVehicle(decoded) : "—"));
  }
  if (name === "get_flat_price" && input.service === "tire_change" && !(typeof input.vehicle_key === "string" && decodeVehicleKey(input.vehicle_key))) {
    return quoteOutcome(tireChangeQuote(input, newEstimateId(), await staffPriceOverrides()));
  }
  if (name === "find_tires") {
    const size = typeof input.size === "string" ? input.size.slice(0, 40) : "";
    if (!sizeKey(size)) return { content: JSON.stringify({ error: "Could not read a tire size." }), isError: true, events: [] };
    const season = typeof input.season === "string" ? input.season : "any";
    const count = readTireCount(input.count);
    if (typeof count !== "number") return { content: JSON.stringify(count), isError: true, events: [] };
    const options = await staffTires(size, season, wheelmart);
    if (options === null) return { content: JSON.stringify({ status: "no_price_list", note: "Neither the tire price list nor Wheel Mart is set up on the server." }), isError: false, events: [] };
    if (options.length === 0) return { content: JSON.stringify({ status: "not_found", note: "No tire of that size and season on the price list." }), isError: false, events: [] };
    const key = typeof input.vehicle_key === "string" && input.vehicle_key ? input.vehicle_key : knownVehicleKey;
    const decoded = key ? decodeVehicleKey(key) : null;
    return quoteOutcome(buildTireQuote(decoded ? describeVehicle(decoded) : "—", size.toUpperCase(), options, count, newEstimateId()));
  }
  // Vehicle lookup, service search and the shop's flat prices are the public tools as they are.
  const prices = name === "get_flat_price" ? await staffPriceOverrides() : new Map<string, number>();
  const outcome = await runPublicTool(api, name, input, newEstimateId, "zh-CN", knownVehicleKey, undefined, undefined, (card) => applyPriceOverrides(card, prices));
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

/** What the assistant is told about the conversation's price each turn. */
export function priceTierNote(tier: PriceTier | undefined, pricing?: CustomPricing | null): string {
  if (tier === "custom") {
    return pricing
      ? `Price for this conversation: ${TIER_LABEL.custom} (${describePricing(pricing)}: parts ${pricing.partsPct}% of the way from cost to suggested retail, labor $${pricing.laborRate}/h). The summary lists retail, referral and friend totals only; the card shows the custom totals, so point staff to the card and don't state a dollar total of your own.`
      : "No price chosen for this conversation yet: call ask_price_tier before the first quote.";
  }
  const extra = extraPctOf(pricing);
  const extraNote = extra > 0 ? ` Staff added ${extra}% extra labor hours on top of the guide's: the summary's labor hours and totals don't include them, so point staff to the card and don't state a dollar total of your own.` : "";
  if (tier === "cost") return `Price for this conversation: ${TIER_LABEL.cost} (cost): parts at purchase cost with no markup, labor at $96/h. The summary doesn't list it; the card shows the totals, so point staff to the card and don't state a dollar total of your own.${extraNote}`;
  return tier
    ? `Price for this conversation: ${TIER_LABEL[tier]} (${tier}). Quote that price's totals.${extraNote}`
    : "No price chosen for this conversation yet: call ask_price_tier before the first quote.";
}

/** What a tool is about to do, for the "typing" line (Kevin, 2026-11-16: say which site is being searched). */
export function toolStatusDetail(name: string, input: Record<string, unknown> = {}): string | undefined {
  const text = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  switch (name) {
    case "identify_vehicle":
      return text("vin") ? `正在用 VIN ${text("vin")} 向 WorldPac 查车辆…` : "正在向 WorldPac 查这辆车…";
    case "find_services":
      return `正在查 WorldPac 工时手册里的维修项目${text("query") ? `：${text("query")}` : ""}…`;
    case "get_estimate":
      return "正在向 WorldPac 查这个项目的工时和零件价格…";
    case "quote_extra_part":
    case "find_parts":
      return "正在向 WorldPac 查零件价格…";
    case "get_flat_price":
    case "get_shop_service_price":
      return "正在查店里的一口价…";
    case "find_tires":
      return `正在查合作轮胎价目表和 Wheel Mart${text("size") ? `（${text("size")}）` : ""}…`;
    case "find_brand_tires":
      return `正在查 DT Tire Hub 的大牌轮胎${text("size") ? `（${text("size")}）` : ""}…`;
    case "used_part":
      return "正在整理二手件的搜索链接…";
    case "find_fleet_car":
      return "正在 TATO 里找这辆车队的车…";
    case "draft_alldata_estimate":
      return "正在整理 ALLDATA 草稿…";
    default:
      return undefined;
  }
}

export const WORKBENCH_PROFILE: ChatProfile<WorkbenchEvent> = {
  model: WORKBENCH_MODEL,
  effort: "medium",
  system: WORKBENCH_PROMPT,
  tools: WORKBENCH_TOOLS,
  turnContext: (request, _earlier, vehicle) =>
    [
      `Today at the shop (Vancouver time): ${shopToday(new Date())}.`,
      priceTierNote(isPriceTier(request.priceTier) ? request.priceTier : undefined, snapPricing(request.pricing)),
      vehicle ? `Vehicle already confirmed in this conversation: ${vehicle.label} (vehicle_key: ${vehicle.key}). Reuse it unless staff switch vehicles.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  runTool: (api, name, input, newEstimateId, _cardLocale, knownVehicleKey, progress) =>
    runWorkbenchTool(api, name, input, newEstimateId, knownVehicleKey, undefined, undefined, undefined, progress),
  statusEvent: (name, input, detail) => {
    const text = detail ?? toolStatusDetail(name, input);
    return { type: "status", status: statusForTool(name), ...(text ? { detail: text } : {}) };
  },
  toolFailure: (catalogDown) =>
    catalogDown ? "WorldPac is not responding right now. Tell staff to try again in a minute." : "The lookup failed. Tell staff to try again.",
  // The shop's minimum labor is per order: one top-up card when this reply's labor jobs add up to less.
  finishTurn: (events, newEstimateId) => {
    const labor = events.flatMap((e) => (e.type === "quote" && e.quote.kind === "labor" && e.quote.labor && e.quote.labor.hours > 0 ? [e.quote] : []));
    const hours = laborShortfall(labor.map((q) => q.labor!.hours));
    if (!hours) return [];
    const total = Math.round(labor.reduce((sum, q) => sum + q.labor!.hours, 0) * 100) / 100;
    const quote = buildLaborQuote(
      labor[0].vehicle,
      {
        serviceName: "最低工时补足（整单不足 0.5 小时）",
        position: "",
        laborHours: hours,
        laborNote: `店里每单最低收 ${MIN_LABOR_HOURS} h 工时；上面几项一共 ${total} h。`,
        primaryPartName: "",
        otherPartNames: [],
        partsNote: "",
        partOptions: [],
      },
      newEstimateId(),
    );
    return [{ type: "quote", quote }];
  },
  orderNote: (events) =>
    // Staff cards show exact amounts, not the public 10% ranges.
    minimumLaborNote(events.flatMap((e) => (e.type === "quote" && e.quote.kind === "labor" && e.quote.labor ? [e.quote.labor.hours] : [])), true),
};
