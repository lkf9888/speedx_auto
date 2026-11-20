/**
 * RockAuto price lookup by part number (Kevin, 2026-11-20: "add RockAuto as a
 * sourcing channel"). RockAuto has no public API, so this reads the public part
 * search page the way a person would: one GET per part number, no login, no
 * catalog crawling. robots.txt allows /en/partsearch/ for ordinary clients (it
 * does disallow /info/ and /cgi-bin/, which are never touched).
 *
 * Being a good guest: an honest User-Agent, at most MAX_LOOKUPS part numbers per
 * quote, one request at a time with a pause between them, and a 15-minute cache
 * so staff re-asking the same job doesn't hit the site again. Prices come back in
 * CAD (RockAuto's Canadian storefront); shipping is not on the search page.
 */

const SEARCH_URL = "https://www.rockauto.com/en/partsearch/?partnum=";
const USER_AGENT = "SpeedXRepairWorkbench/1.0 (shop price check, one part number at a time)";
const TIMEOUT_MS = 15_000;
const PAUSE_MS = 1_200;
const CACHE_MS = 15 * 60_000;
const MAX_BYTES = 3_000_000;
const MAX_CACHE = 200;

export interface RockAutoRow {
  brand: string;
  partNumber: string;
  description: string;
  category: string;
  /** What RockAuto charges per part, CAD. */
  price: number;
  /** Refundable core charge per part, CAD (0 when none). */
  core: number;
}

const decode = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const amount = (text: string) => {
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** Normalised part number for comparing: letters and digits only, upper case. */
export const partKey = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/**
 * The priced rows of a RockAuto part-search page. A row with no price
 * ("Out of Stock") is left out: RockAuto can't sell it.
 */
export function parseRockAutoSearch(html: string): RockAutoRow[] {
  const rows: RockAutoRow[] = [];
  for (const chunk of html.split(/(?=<tbody id="listingcontainer\[\d+\]")/).slice(1)) {
    const block = chunk.split("</tbody>")[0];
    const brand = block.match(/class="listing-final-manufacturer[^"]*"[^>]*>([^<]*)</)?.[1];
    const partNumber = block.match(/class="listing-final-partnumber[^"]*"[^>]*>([^<]*)</)?.[1];
    if (!brand || !partNumber) continue;
    // Prices in the order they appear: the part price, then the core charge ("CAD$0.00" when none).
    const amounts = [...block.matchAll(/CAD\$(\d[\d,]*(?:\.\d{1,2})?)/g)].map((m) => amount(m[1]));
    const unit = amounts[0];
    if (unit === null || unit === undefined || unit <= 0 || !/id="dprice\[\d+\]\[v\]"/.test(block)) continue;
    const core = amounts[1];
    rows.push({
      brand: decode(brand),
      partNumber: decode(partNumber),
      description: decode(block.match(/class="span-link-underline-remover"[^>]*>([^<]*)</)?.[1] ?? ""),
      category: decode(block.match(/Category:\s*([^<]*)</)?.[1] ?? ""),
      price: unit,
      core: core ?? 0,
    });
  }
  return rows;
}

export interface RockAutoDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const cache = new Map<string, { at: number; rows: RockAutoRow[] }>();
let queue: Promise<unknown> = Promise.resolve();

/** Test hook: forget cached answers. */
export function clearRockAutoCache(): void {
  cache.clear();
}

async function readLimited(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) throw new Error("RockAuto page too large");
  // The page is windows-1252.
  return new TextDecoder("windows-1252").decode(buffer);
}

/** Every priced RockAuto listing for this part number (any brand), or throws when the site can't be read. */
export async function searchRockAuto(partNumber: string, deps: RockAutoDeps = {}): Promise<RockAutoRow[]> {
  const key = partKey(partNumber);
  if (!/^[A-Z0-9]{3,30}$/.test(key)) return [];
  const now = deps.now ?? Date.now;
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_MS) return hit.rows;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // One request at a time across the whole server, with a pause after each.
  const run = queue.then(async () => {
    try {
      const response = await fetchImpl(`${SEARCH_URL}${encodeURIComponent(partNumber.trim())}`, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-CA,en;q=0.8" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`RockAuto answered ${response.status}`);
      const html = await readLimited(response);
      const found = parseRockAutoSearch(html);
      // A 200 that is not RockAuto's search page (a block or captcha page) is a failure, not "no stock".
      if (found.length === 0 && !html.includes('id="frm_partsearch"')) throw new Error("RockAuto page not recognised");
      return found;
    } finally {
      await sleep(PAUSE_MS);
    }
  });
  queue = run.catch(() => undefined);
  const rows = await run;
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now(), rows });
  return rows;
}
