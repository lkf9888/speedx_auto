/**
 * RockAuto as one more place to buy a part (Kevin, 2026-11-20). Asked only when
 * no supplier has the job locally (WorldPac, Westcan and Lordco all come first):
 * the part numbers WorldPac listed for the job are searched on RockAuto and a
 * priced match is added as an extra option. It is shipped in, so it is never
 * preferred over local stock, and it never replaces the WorldPac rows.
 *
 * Price rule (Kevin, 2026-11-20): the customer pays (RockAuto's price × quantity
 * + shipping) × 1.3. RockAuto's real shipping isn't on its search page (it
 * depends on the warehouse and the cart), so each part number counts a flat
 * ROCKAUTO_SHIPPING estimate in the cost. Staff screens only: the customer copy
 * says "到货时间待确认" like any ordered-in part and never names RockAuto.
 */
import { partKey, searchRockAuto, type RockAutoRow } from "@/lib/rockauto/search";
import { customerText } from "./customer-text";
import { finish, FRIEND_OTHER_MARKUP, type StaffQuote, type StaffQuoteOption } from "./quote";

export const ROCKAUTO_MARKUP = 1.3;
/** Shipping estimate per RockAuto part number, CAD (parts usually ship from different warehouses). */
export const ROCKAUTO_SHIPPING = 15;
/** Part numbers searched per quote: RockAuto is asked politely, one at a time. */
export const MAX_ROCKAUTO_PARTS = 4;
const TOTAL_TIMEOUT_MS = 40_000;

const money = (value: number) => Math.round(value * 100) / 100;

/** A WorldPac row that names a single part number (a left + right set is two numbers: not searched). */
const candidates = (quote: StaffQuote) =>
  quote.options.filter((o) => !o.source && o.partNumber && !/[+,]/.test(o.partNumber) && partKey(o.partNumber).length >= 3);

/** Anything the shop can pick up today: WorldPac local stock, or a Westcan / Lordco branch with it in stock. */
const hasLocal = (quote: StaffQuote) =>
  quote.options.some((o) => !o.outOfStock && !o.eta && (o.source ? o.source !== "used" && o.source !== "rockauto" : Boolean(o.partNumber)));

/** Whether RockAuto is worth asking: a parts job with WorldPac part numbers, nothing local anywhere, not asked yet. */
export function needsRockAuto(quote: StaffQuote): boolean {
  return quote.kind === "labor" && quote.supplier === "worldpac" && !quote.rockauto && !hasLocal(quote) && candidates(quote).length > 0;
}

const brandKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Same maker: equal names, or one is the other plus whole extra words ("Akebono" / "Akebono Brake"), never a fragment ("ATE" in "GATES"). */
const sameBrand = (a: string, b: string) => {
  const words = (v: string) => v.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const x = words(a);
  const y = words(b);
  if (x.length === 0 || y.length === 0) return false;
  if (brandKey(a) === brandKey(b)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w, i) => long[i] === w);
};

/** RockAuto's cheapest listing of this exact part (same number, and same maker when WorldPac named one). */
function bestMatch(option: StaffQuoteOption, rows: RockAutoRow[]): RockAutoRow | null {
  const same = rows.filter((r) => partKey(r.partNumber) === partKey(option.partNumber) && (!option.brand || sameBrand(option.brand, r.brand)));
  return same.sort((a, b) => a.price - b.price)[0] ?? null;
}

function toOption(source: StaffQuoteOption, row: RockAutoRow, quote: StaffQuote): StaffQuoteOption {
  const quantity = source.quantity;
  const costTotal = money(row.price * quantity + ROCKAUTO_SHIPPING);
  const partsTotal = money(costTotal * ROCKAUTO_MARKUP);
  const unitPrice = money(partsTotal / quantity);
  const walkIn = quote.labor?.walkIn ?? 0;
  const referral = quote.labor?.referral ?? 0;
  return finish({
    label: row.description && !/^remanufactured$/i.test(row.description) ? row.description : source.label,
    brand: row.brand,
    partNumber: row.partNumber,
    quantity,
    unitPrice,
    unitCost: row.price,
    core: row.core > 0 ? row.core : null,
    stock: "RockAuto 有货",
    eta: "到货时间待确认",
    source: "rockauto",
    customerTotal: money(partsTotal + walkIn),
    referralTotal: money(partsTotal + referral),
    friendTotal: money(costTotal * FRIEND_OTHER_MARKUP + referral),
    costTotal,
    prices: { priceCost: row.price },
    fields: { supplier: "RockAuto", currency: "CAD", shipping: ROCKAUTO_SHIPPING,...(row.category ? { category: row.category } : {}) },
  });
}

export type RockAutoAnswers = Map<string, RockAutoRow[]>;

/** The quote with RockAuto's rows merged in as extra options (pure: the lookups are done by the caller). */
export function mergeRockAuto(quote: StaffQuote, answers: RockAutoAnswers, now = new Date(), failed = 0): StaffQuote {
  if (quote.rockauto) return quote;
  const at = now.toISOString();
  const added: StaffQuoteOption[] = [];
  for (const option of candidates(quote)) {
    const row = bestMatch(option, answers.get(partKey(option.partNumber)) ?? []);
    if (!row) continue;
    if (added.some((a) => partKey(a.partNumber) === partKey(row.partNumber) && brandKey(a.brand) === brandKey(row.brand))) continue;
    added.push(toOption(option, row, quote));
  }
  const note =
    added.length > 0
      ? undefined
      : failed > 0
        ? "RockAuto 这次没查成（没有回应或出错了），请手动搜一下。"
        : "RockAuto 上也没有这些零件号的现货。";
  if (added.length === 0) return { ...quote, rockauto: { at, found: 0, ...(note ? { note } : {}) } };
  const merged: StaffQuote = {
    ...quote,
    options: [...quote.options, ...added].map((o) => {
      const { eta, ...rest } = o;
      return eta ? { ...rest, eta } : rest;
    }),
    notes: [
      ...quote.notes.filter((n) => !n.startsWith("RockAuto")),
      `RockAuto 零件按（它的价格（加元）+ 运费估算 $${ROCKAUTO_SHIPPING}/个零件号）× 1.3 报价，不含核心件押金。运费是估的，下单时核对真实运费。RockAuto 是邮寄，不当本地现货。`,
    ],
    rockauto: { at, found: added.length },
  };
  return { ...merged, customerText: customerText(merged) };
}

export interface RockAutoDeps {
  search?: (partNumber: string) => Promise<RockAutoRow[]>;
  now?: Date;
  timeoutMs?: number;
  onProgress?: (detail: string) => void;
}

/** Asks RockAuto for the quote's part numbers (a few, one at a time) and merges what it has. Never throws. */
export async function checkRockAuto(quote: StaffQuote, deps: RockAutoDeps = {}): Promise<StaffQuote> {
  if (!needsRockAuto(quote)) return quote;
  const say = deps.onProgress ?? (() => {});
  const search = deps.search ?? ((part: string) => searchRockAuto(part));
  const numbers = [...new Set(candidates(quote).map((o) => o.partNumber.trim()))].slice(0, MAX_ROCKAUTO_PARTS);
  say(`本地都没货，正在 RockAuto 查 ${numbers.length} 个零件号的价格…`);
  const answers: RockAutoAnswers = new Map();
  let failed = 0;
  const deadline = Date.now() + (deps.timeoutMs ?? TOTAL_TIMEOUT_MS);
  for (const part of numbers) {
    if (Date.now() > deadline) {
      failed += 1;
      continue;
    }
    try {
      const left = deadline - Date.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        answers.set(
          partKey(part),
          await Promise.race([
            search(part),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("RockAuto took too long")), Math.max(left, 1));
            }),
          ]),
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (error) {
      failed += 1;
      // Status only, never page content.
      console.warn(`[rockauto] lookup failed: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
    }
  }
  const merged = mergeRockAuto(quote, answers, deps.now, failed);
  const found = merged.options.filter((o) => o.source === "rockauto").length;
  say(found > 0 ? `RockAuto：找到 ${found} 个有价格的零件` : failed > 0 ? "RockAuto 这次没查成" : "RockAuto：没有这些零件号的现货");
  return merged;
}
