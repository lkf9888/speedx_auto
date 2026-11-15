/**
 * Westcan from the server's own Nexpart session (WESTCAN_USERNAME /
 * WESTCAN_PASSWORD), tried before staff's Chrome extension. When the server
 * can answer, the quote comes back already checked; when it can't (not set up,
 * refused, verification wanted, error), the quote keeps the lookup and the
 * workbench page asks the extension as before.
 */
import { getWestcanClient, westcanServerConfigured, WestcanServerError, type WestcanClient, type WestcanServerStatus } from "@/lib/westcan/client";
import type { WestcanLookup } from "@/lib/westcan/nexpart";
import { mergeWestcan } from "./westcan";
import type { StaffQuote } from "./quote";

const SERVER_TIMEOUT_MS = 30_000;

export interface ServerWestcanDeps {
  client?: () => Pick<WestcanClient, "search"> | null;
  timeoutMs?: number;
  now?: Date;
}

const defaultClient = () => (westcanServerConfigured() ? getWestcanClient() : null);

/** The quote with its Westcan check done by the server, or with only the lookup (and why) when the server couldn't. */
export async function checkWestcanOnServer(quote: StaffQuote, lookup: WestcanLookup, deps: ServerWestcanDeps = {}): Promise<StaffQuote> {
  const pending: StaffQuote = { ...quote, westcan: { lookup } };
  const client = (deps.client ?? defaultClient)();
  if (!client) return pending;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      client.search(lookup),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new WestcanServerError("Nexpart took too long", "error")), deps.timeoutMs ?? SERVER_TIMEOUT_MS);
      }),
    ]);
    return mergeWestcan(pending, answer, deps.now);
  } catch (error) {
    const status: WestcanServerStatus = error instanceof WestcanServerError ? error.status : "error";
    // Status only: never the message body, which could carry account details.
    console.warn(`[westcan] server lookup unavailable: ${status}`);
    return { ...pending, westcan: { lookup, server: status } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
