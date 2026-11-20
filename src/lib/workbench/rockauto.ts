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
import { parseRockAutoSearch, partKey, searchRockAuto, type RockAutoRow } from "@/lib/rockauto/search";
import type { RockAutoPage } from "./alldata-bridge";
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

/**
 * WorldPac's brand field is sometimes a description, not a maker ("100% New",
 * "OE Replacement - 100% New", "Techno Polymer Impeller"). Such a brand can't be
 * matched against RockAuto's maker names.
 */
function descriptiveBrand(brand: string): boolean {
  const b = brand.trim();
  // Only clear description words: a real maker may contain digits ("555") or words like "Standard" ("Standard Motor Products").
  return !b || /%/.test(b) || /^(premium|economy|standard|original|genuine|value|quality)$/i.test(b) || /\b(new|replacement|oe|oem|impeller|polymer|remanufactured|reman|rebuilt|refurbished|aftermarket)\b/i.test(b);
}

/** Words that don't say which part it is ("Starter Motor" is a starter, "Control Arm Kit" a control arm). */
const CATEGORY_NOISE = new Set(["and", "for", "the", "with", "motor", "assembly", "assy", "unit", "kit", "set"]);

/**
 * Whether RockAuto's category ("Water Pump", "Alternator / Generator", "Oxygen
 * (O2) Sensor") names what this job is about: every word of one of its
 * alternatives must be in the job text ("Pump" alone would also fit a fuel pump).
 */
function categoryFits(category: string, job: string): boolean {
  const text = job.toLowerCase();
  const lower = category.toLowerCase();
  // "Oxygen (O2) Sensor" is also "O2 Sensor"; "A / B" is either.
  const variants = [lower.replace(/\s*\([^)]*\)/g, ""), lower.replace(/[a-z0-9]+\s*\(([^)]*)\)/g, "$1")];
  return variants
    .flatMap((v) => v.split("/"))
    .some((alt) => {
      const words = alt.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !CATEGORY_NOISE.has(w));
      return words.length > 0 && words.every((w) => text.includes(w.replace(/s$/, "")));
    });
}

/**
 * RockAuto's cheapest listing of this exact part number. With a real WorldPac
 * maker it must be the same maker. When WorldPac's brand is only a description
 * the maker can't be compared, so the number must also be in a category the job
 * is about (a number shared by a clutch kit and a starter is not the part) and
 * every listing that fits must come from one maker (two makers sharing a number
 * are two different parts: no match).
 */
function bestMatch(option: StaffQuoteOption, rows: RockAutoRow[], job: string): RockAutoRow | null {
  const exact = rows.filter((r) => partKey(r.partNumber) === partKey(option.partNumber));
  const cheapest = (list: RockAutoRow[]) => [...list].sort((a, b) => a.price - b.price)[0] ?? null;
  // A real maker must be the same maker; a description is never compared against maker names ("Premium" is not "Premium Guard").
  if (!descriptiveBrand(option.brand)) return cheapest(exact.filter((r) => sameBrand(option.brand, r.brand)));
  const fits = exact.filter((r) => categoryFits(r.category, job));
  return new Set(fits.map((r) => brandKey(r.brand))).size === 1 ? cheapest(fits) : null;
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
    fields: { supplier: "RockAuto", currency: "CAD", shipping: ROCKAUTO_SHIPPING, ...(row.category ? { category: row.category } : {}) },
  });
}

export type RockAutoAnswers = Map<string, RockAutoRow[]>;

const NOTE_ROW = `RockAuto 零件按（它的价格（加元）+ 运费估算 $${ROCKAUTO_SHIPPING}/个零件号）× 1.3 报价，不含核心件押金。运费是估的，下单时核对真实运费。RockAuto 是邮寄，不当本地现货。`;

/**
 * The quote with RockAuto's rows merged in as extra options (pure: the lookups
 * are done by the caller). Part numbers the server couldn't read (`unread`) are
 * left for staff's own browser to ask (RockAuto blocks data-centre IPs), unless
 * `browser` says this answer already came from a browser.
 */
export function mergeRockAuto(quote: StaffQuote, answers: RockAutoAnswers, now = new Date(), unread: string[] = [], browser = false): StaffQuote {
  if (quote.rockauto) return quote;
  const at = now.toISOString();
  const via = browser ? ({ via: "browser" } as const) : {};
  const added: StaffQuoteOption[] = [];
  for (const option of candidates(quote)) {
    const row = bestMatch(option, answers.get(partKey(option.partNumber)) ?? [], `${quote.service} ${quote.position} ${option.label}`);
    if (!row) continue;
    if (added.some((a) => partKey(a.partNumber) === partKey(row.partNumber) && brandKey(a.brand) === brandKey(row.brand))) continue;
    added.push(toOption(option, row, quote));
  }
  if (added.length === 0) {
    if (unread.length > 0 && !browser) {
      return { ...quote, rockauto: { at, found: 0, note: "服务器这次读不了 RockAuto，改由这台电脑的浏览器去查。", pending: { parts: unread.slice(0, MAX_ROCKAUTO_PARTS) } } };
    }
    const note = unread.length > 0 ? "RockAuto 这次没查成（页面没有正常打开），请点“RockAuto 搜索”手动查。" : "RockAuto 上也没有这些零件号的现货。";
    return { ...quote, rockauto: { at, found: 0, note, ...via } };
  }
  const merged: StaffQuote = {
    ...quote,
    options: [...quote.options, ...added].map((o) => {
      const { eta, ...rest } = o;
      return eta ? { ...rest, eta } : rest;
    }),
    notes: [...quote.notes.filter((n) => !n.startsWith("RockAuto")), NOTE_ROW],
    // Some part numbers found here, others unread: the unread ones still go to staff's browser.
    rockauto: { at, found: added.length, ...via, ...(unread.length > 0 && !browser ? { pending: { parts: unread.slice(0, MAX_ROCKAUTO_PARTS) } } : {}) },
  };
  return { ...merged, customerText: customerText(merged) };
}

/** Most characters taken from one page; a staff browser's answer is checked again here. */
const MAX_PAGE_CHARS = 250_000;

/**
 * Staff's browser read RockAuto for the parts the server couldn't. Each page is
 * parsed with the same parser as the server's own reads; a page that isn't
 * RockAuto's search page, or whose prices aren't in CAD, counts as not read.
 */
export function mergeRockAutoFromBrowser(quote: StaffQuote, pages: unknown, now = new Date()): StaffQuote {
  const pending = quote.rockauto?.pending;
  if (!pending) return quote;
  const answers: RockAutoAnswers = new Map();
  const unread: string[] = [];
  const list = Array.isArray(pages) ? (pages as Array<Partial<RockAutoPage> | null>) : [];
  for (const part of pending.parts) {
    const page = list.find((p) => p && typeof p.part === "string" && partKey(p.part) === partKey(part));
    const html = page && typeof page.html === "string" ? page.html.slice(0, MAX_PAGE_CHARS) : "";
    const rows = parseRockAutoSearch(html);
    const pricedButNotCad = rows.length === 0 && /id="dprice\[\d+\]\[v\]"/.test(html);
    if (!page || page.recognised !== true || pricedButNotCad) unread.push(part);
    else answers.set(partKey(part), rows);
  }
  const { rockauto: _asked, ...rest } = quote;
  void _asked;
  // Local stock turned up meanwhile (Westcan or Lordco answered in staff's Chrome): RockAuto isn't needed.
  if (hasLocal(rest as StaffQuote)) return { ...quote, rockauto: { at: now.toISOString(), found: 0, note: "已经有本地有货，没用 RockAuto。", via: "browser" } };
  const merged = mergeRockAuto(rest as StaffQuote, answers, now, unread, true);
  // Part numbers the server already found keep counting.
  const total = (quote.rockauto?.found ?? 0) + (merged.rockauto?.found ?? 0);
  return total > 0 && merged.rockauto ? { ...merged, rockauto: { at: merged.rockauto.at, found: total, via: "browser" } } : merged;
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
  const unread: string[] = [];
  const deadline = Date.now() + (deps.timeoutMs ?? TOTAL_TIMEOUT_MS);
  let blocked = false;
  for (const part of numbers) {
    // Once RockAuto has refused the server, the other part numbers aren't tried here: staff's browser gets them all.
    if (blocked || Date.now() > deadline) {
      unread.push(part);
      continue;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const left = deadline - Date.now();
      answers.set(
        partKey(part),
        await Promise.race([
          search(part),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("RockAuto took too long")), Math.max(left, 1));
          }),
        ]),
      );
    } catch (error) {
      unread.push(part);
      blocked = true;
      // Status only, never page content.
      console.warn(`[rockauto] lookup failed: ${error instanceof Error ? error.message.slice(0, 80) : "error"}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const merged = mergeRockAuto(quote, answers, deps.now, unread);
  const found = merged.options.filter((o) => o.source === "rockauto").length;
  say(found > 0 ? `RockAuto：找到 ${found} 个有价格的零件` : merged.rockauto?.pending ? "服务器读不了 RockAuto，改由这台电脑的浏览器去查" : "RockAuto：没有这些零件号的现货");
  return merged;
}
