/**
 * Westcan (and, after it, Lordco) from the server's own Nexpart sign-ins
 * (WESTCAN_USERNAME / WESTCAN_PASSWORD, LORDCO_USERNAME / LORDCO_PASSWORD),
 * tried before staff's Chrome extension. When the server can answer, the quote
 * comes back already checked; when it can't (not set up, refused, verification
 * wanted, error), the quote keeps the lookup and the workbench page asks the
 * extension as before. Lordco has no extension fallback.
 */
import { getLordcoClient, getWestcanClient, lordcoServerConfigured, westcanServerConfigured, WestcanServerError, type NexpartClient, type WestcanServerStatus } from "@/lib/westcan/client";
import type { WestcanLookup } from "@/lib/westcan/nexpart";
import { mergeLordco, mergeWestcan, needsLordco } from "./westcan";
import type { StaffQuote } from "./quote";

const SERVER_TIMEOUT_MS = 30_000;

export interface ServerWestcanDeps {
  client?: () => Pick<NexpartClient, "search"> | null;
  /** Lordco's own Nexpart account; asked only when Westcan has nothing local. */
  lordco?: () => Pick<NexpartClient, "search"> | null;
  timeoutMs?: number;
  now?: Date;
}

const defaultClient = () => (westcanServerConfigured() ? getWestcanClient() : null);
const defaultLordco = () => (lordcoServerConfigured() ? getLordcoClient() : null);

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WestcanServerError("Nexpart took too long", "error")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const statusOf = (error: unknown): WestcanServerStatus => (error instanceof WestcanServerError ? error.status : "error");

/** The quote with its Westcan check done by the server, or with only the lookup (and why) when the server couldn't. */
export async function checkWestcanOnServer(quote: StaffQuote, lookup: WestcanLookup, deps: ServerWestcanDeps = {}): Promise<StaffQuote> {
  const pending: StaffQuote = { ...quote, westcan: { lookup } };
  const client = (deps.client ?? defaultClient)();
  if (!client) return pending;
  const ms = deps.timeoutMs ?? SERVER_TIMEOUT_MS;
  let merged: StaffQuote;
  let westcanOk = false;
  try {
    const answer = await withTimeout(client.search(lookup), ms);
    merged = mergeWestcan(pending, answer, deps.now);
    westcanOk = answer.status === "ok";
  } catch (error) {
    // Status only: never the message body, which could carry account details.
    console.warn(`[westcan] server lookup unavailable: ${statusOf(error)}`);
    return { ...pending, westcan: { lookup, server: statusOf(error) } };
  }
  // Lordco is next in line, only when Westcan answered and nothing is local yet.
  const lordco = westcanOk && needsLordco(merged) ? (deps.lordco ?? defaultLordco)() : null;
  if (!lordco) return merged;
  try {
    return mergeLordco(merged, await withTimeout(lordco.search(lookup), ms), deps.now);
  } catch (error) {
    console.warn(`[lordco] server lookup unavailable: ${statusOf(error)}`);
    return merged;
  }
}
