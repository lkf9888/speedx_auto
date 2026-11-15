/**
 * Westcan parts on a staff quote (Kevin, 2026-11-15). The workbench asks
 * staff's own Chrome to look the job up in Westcan's Nexpart (the extension's
 * westcanSearch) and sends the rows here. Westcan parts sell at cost × 1.3.
 *
 * Order of suppliers: WorldPac local stock → Westcan (our Richmond branch,
 * then its other branches, next day) → WorldPac ordered in → 待补价.
 *
 * The rows come from a staff browser, so every field is checked again here.
 */
import { customerText } from "./customer-text";
import { etaLabel, finish, FRIEND_OTHER_MARKUP, type StaffQuote, type StaffQuoteOption } from "./quote";

/** Westcan parts: our cost times this is the customer's part price. */
export const WESTCAN_MARKUP = 1.3;
const MAX_OPTIONS = 8;
const MAX_ROWS = 50;

const money = (value: number) => Math.round(value * 100) / 100;
const str = (value: unknown, max = 120) => (typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "");
const count = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 9999) : 0;
};

interface Part {
  brand: string;
  partNumber: string;
  description: string;
  position: string;
  side?: "L" | "R";
  unitCost: number;
  list: number | null;
  quantity: number;
  here: number;
  other: number;
  eta: string;
}

/** Rows Westcan can actually sell: priced, not special order, in stock at some branch. */
export function readWestcanRows(raw: unknown, multiplier = 1, partTypes: number[] = []): Part[] {
  if (!Array.isArray(raw)) return [];
  const parts: Part[] = [];
  for (const row of raw.slice(0, MAX_ROWS)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const unitCost = Number(r.cost);
    if (r.specialOrder === true || !Number.isFinite(unitCost) || unitCost <= 0 || unitCost > 20_000) continue;
    // Only the part asked for: a row of another part type is someone else's search.
    const partType = Number(r.partType);
    if (partTypes.length && Number.isFinite(partType) && partType > 0 && !partTypes.includes(partType)) continue;
    const here = count(r.stockHere);
    const other = count(r.stockOther);
    if (here + other === 0) continue;
    const perCar = Number(r.perCar);
    const position = str(r.position, 60);
    const left = /\bleft\b/i.test(position);
    const right = /\bright\b/i.test(position);
    // A part listed for both left and right fits either side: not a one-side part.
    const side = left && !right ? "L" : right && !left ? "R" : undefined;
    const list = Number(r.list);
    const partNumber = str(r.partNumber, 40);
    // The description goes to the customer: no part numbers in it.
    const description = (partNumber ? str(r.description).split(partNumber).join("") : str(r.description)).replace(/\s+/g, " ").trim();
    parts.push({
      brand: str(r.brand, 80),
      partNumber,
      description: description || "Part",
      position,
      ...(side ? { side } : {}),
      unitCost: money(unitCost),
      list: Number.isFinite(list) && list > 0 ? money(list) : null,
      // Nexpart's per-car count already covers the axle (2 rotors); the job's multiplier only adds to a one-per-car part.
      quantity: Number.isInteger(perCar) && perCar > 1 && perCar <= 8 ? perCar : side ? 1 : multiplier,
      here,
      other,
      eta: str(r.eta, 60),
    });
  }
  return parts;
}

/**
 * A left part and a right part (European cars sell them as different part
 * numbers) make one set, cheapest of each per brand; a side with no partner
 * can't do the job and isn't offered.
 */
function pairSides(parts: Part[]): Part[] {
  const plain = parts.filter((p) => !p.side);
  const byBrand = new Map<string, { L?: Part; R?: Part }>();
  for (const p of parts.filter((x) => x.side)) {
    const entry = byBrand.get(p.brand) ?? {};
    const current = entry[p.side!];
    if (!current || p.unitCost < current.unitCost) entry[p.side!] = p;
    byBrand.set(p.brand, entry);
  }
  const sets: Part[] = [];
  for (const { L, R } of byBrand.values()) {
    if (!L || !R) continue;
    sets.push({
      brand: L.brand,
      partNumber: `${L.partNumber} + ${R.partNumber}`,
      description: `${L.description} (left + right set)`,
      position: L.position.replace(/\s*left\b/i, "").trim(),
      unitCost: money(L.unitCost * L.quantity + R.unitCost * R.quantity),
      list: L.list !== null && R.list !== null ? money(L.list * L.quantity + R.list * R.quantity) : null,
      quantity: 1,
      // The set is here only when both sides are.
      here: Math.min(L.here, R.here),
      other: Math.min(L.here + L.other, R.here + R.other),
      eta: L.eta || R.eta,
    });
  }
  return [...plain, ...sets];
}

function toOption(p: Part, quote: StaffQuote): StaffQuoteOption & { local: boolean } {
  const unitPrice = money(p.unitCost * WESTCAN_MARKUP);
  const partsTotal = money(unitPrice * p.quantity);
  const walkIn = quote.labor?.walkIn ?? 0;
  const referral = quote.labor?.referral ?? 0;
  const local = p.here > 0;
  const said = etaLabel(p.eta);
  const eta = local ? undefined : said && said !== "到货时间待确认" ? said : "明天到";
  return {
    ...finish({
      label: p.description,
      brand: p.brand,
      partNumber: p.partNumber,
      quantity: p.quantity,
      unitPrice,
      unitCost: p.unitCost,
      core: null,
      stock: local ? `Westcan Richmond 有货（${p.here}）` : `Westcan 其他分店有货（${p.other}）`,
      ...(eta ? { eta } : {}),
      source: "westcan",
      customerTotal: money(partsTotal + walkIn),
      referralTotal: money(partsTotal + referral),
      friendTotal: money(p.unitCost * p.quantity * FRIEND_OTHER_MARKUP + referral),
      costTotal: money(p.unitCost * p.quantity),
      prices: { priceCost: p.unitCost, ...(p.list !== null ? { priceList: p.list } : {}) },
      fields: { supplier: "Westcan", position: p.position },
    }),
    local,
  };
}

/** A WorldPac option offered from local stock (not ordered in, not hidden, not the labor-only line). */
const worldpacLocal = (o: StaffQuoteOption) => !o.source && !o.outOfStock && !o.eta && Boolean(o.partNumber);
const laborOnly = (o: StaffQuoteOption) => !o.source && !o.partNumber && o.unitPrice === 0;

export type WestcanAnswer =
  | { status: "ok"; vehicle?: unknown; rows?: unknown }
  | { status: "need_engine" | "no_vehicle"; engines?: unknown };

/** The quote with Westcan's answer merged in, marked as checked. */
export function mergeWestcan(quote: StaffQuote, answer: WestcanAnswer, now = new Date()): StaffQuote {
  if (!quote.westcan) return quote;
  const at = now.toISOString();
  const vehicle = answer.status === "ok" ? str(answer.vehicle, 160) : "";
  if (answer.status !== "ok") {
    const engines = Array.isArray(answer.engines) ? answer.engines.map((e) => str(e, 40)).filter(Boolean).slice(0, 8) : [];
    const note =
      answer.status === "need_engine"
        ? `Westcan 要先知道发动机（${engines.join(" / ")}），请告诉助手发动机或 VIN 后重新报价。`
        : "Westcan 的目录里没找到这台车。";
    return { ...quote, westcan: { ...quote.westcan, checked: { at, found: 0, note } } };
  }
  const offered = pairSides(readWestcanRows(answer.rows, quote.westcan.lookup.multiplier, quote.westcan.lookup.partTypes))
    .map((p) => toOption(p, quote))
    .sort((a, b) => Number(b.local) - Number(a.local) || a.customerTotal - b.customerTotal);
  const unique = offered.filter((o, i) => offered.findIndex((x) => x.brand === o.brand && x.partNumber === o.partNumber) === i).slice(0, MAX_OPTIONS);
  const checked = (found: number, note?: string) => ({ at, found, ...(vehicle ? { vehicle } : {}), ...(note ? { note } : {}) });
  if (unique.length === 0) return { ...quote, westcan: { ...quote.westcan, checked: checked(0, "Westcan 也没有能用的现货。") } };
  // WorldPac local stock still comes first.
  if (quote.options.some(worldpacLocal)) {
    return { ...quote, westcan: { ...quote.westcan, checked: checked(unique.length, "WorldPac 本地有货，先用 WorldPac。") } };
  }
  const anyHere = unique.some((o) => o.local);
  const westcanOptions = unique.map(({ local, ...o }) => (anyHere && !local ? { ...o, eta: undefined, outOfStock: true } : o));
  // Westcan comes before WorldPac ordered-in parts: those are no longer offered.
  const worldpac = quote.options.filter((o) => !laborOnly(o) && !o.source).map((o) => (o.outOfStock ? o : { ...o, outOfStock: true, eta: undefined }));
  const merged: StaffQuote = {
    ...quote,
    options: [...westcanOptions, ...worldpac].map((o) => {
      const { eta, ...rest } = o;
      return eta ? { ...rest, eta } : rest;
    }),
    notes: [...quote.notes.filter((n) => !n.startsWith("Westcan")), "Westcan 零件按拿货价 × 1.3 报价。顺序：WorldPac 本地有货 → Westcan → WorldPac 调货。"],
    westcan: { ...quote.westcan, checked: checked(unique.length) },
  };
  // Saved final prices point at option numbers that just moved.
  delete merged.final;
  return { ...merged, customerText: customerText(merged) };
}
