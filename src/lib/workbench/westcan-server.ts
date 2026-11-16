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
  /** Says what is being asked and how it went, for the "typing" line. */
  onProgress?: (detail: string) => void;
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

const WHY: Record<WestcanServerStatus, string> = {
  not_configured: "服务器没设置这个账号",
  login_failed: "登录被拒绝（账号或密码不对）",
  verification_required: "对方要求验证，需要人工处理",
  error: "没有回应或出错了",
};

/** The quote with its Westcan check done by the server, or with only the lookup (and why) when the server couldn't. */
export async function checkWestcanOnServer(quote: StaffQuote, lookup: WestcanLookup, deps: ServerWestcanDeps = {}): Promise<StaffQuote> {
  const say = deps.onProgress ?? (() => {});
  const pending: StaffQuote = { ...quote, westcan: { lookup } };
  const client = (deps.client ?? defaultClient)();
  if (!client) {
    say("服务器没有 Westcan 账号，改由这台电脑的 Chrome 扩展去查");
    return pending;
  }
  const ms = deps.timeoutMs ?? SERVER_TIMEOUT_MS;
  let merged: StaffQuote;
  let westcanOk = false;
  try {
    const answer = await withTimeout(client.search(lookup), ms);
    merged = mergeWestcan(pending, answer, deps.now);
    westcanOk = answer.status === "ok";
    const found = merged.options.filter((o) => o.source === "westcan").length;
    say(westcanOk ? (found > 0 ? `Westcan：找到 ${found} 个可用零件` : "Westcan：没有可用零件") : "Westcan：没有查到结果");
  } catch (error) {
    // Status only: never the message body, which could carry account details.
    console.warn(`[westcan] server lookup unavailable: ${statusOf(error)}`);
    say(`Westcan 这次没查成：${WHY[statusOf(error)]}，改由 Chrome 扩展再试`);
    return { ...pending, westcan: { lookup, server: statusOf(error) } };
  }
  // Lordco is next in line, only when Westcan answered and nothing is local yet.
  const lordco = westcanOk && needsLordco(merged) ? (deps.lordco ?? defaultLordco)() : null;
  if (!lordco) return merged;
  say("Westcan 没有现货，正在查 Lordco…");
  try {
    const withLordco = mergeLordco(merged, await withTimeout(lordco.search(lookup), ms), deps.now);
    const found = withLordco.options.filter((o) => o.source === "lordco").length;
    say(found > 0 ? `Lordco：找到 ${found} 个可用零件` : "Lordco：没有可用零件");
    return withLordco;
  } catch (error) {
    console.warn(`[lordco] server lookup unavailable: ${statusOf(error)}`);
    say(`Lordco 这次没查成：${WHY[statusOf(error)]}`);
    return merged;
  }
}
