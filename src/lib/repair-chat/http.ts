import Anthropic from "@anthropic-ai/sdk";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { BlockList } from "node:net";
import { locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { company } from "@/lib/company";
import { runChat, type ChatTurn, type MessagesClient } from "@/lib/repair-chat/agent";
import {
  createLeadNotifier,
  estimateLeadEvent,
  parseLead,
  type Lead,
  type LeadNotifier,
} from "@/lib/repair-chat/lead";
import { isBookable, bookableDays, parseClosedDates, SLOT_TIMES } from "@/lib/repair-chat/booking";
import { composeBookingEmail, createFollowUpHandler, createMailer, type Mailer } from "@/lib/repair-chat/followup";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore } from "@/lib/repair-chat/session";
import { registerShutdownFlush } from "@/lib/repair-chat/shutdown";
import {
  DAILY_OPEN_LIMIT,
  DailyOpenCounter,
  isAllowlisted,
  parseAllowlist,
} from "@/lib/repair-chat/visitor";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import type { ChatEvent } from "@/lib/repair-chat/tools";
import type { CatalogApi } from "@/lib/worldpac/catalog";
import { getWorldpacClient } from "@/lib/worldpac/client";

const MAX_HISTORY = 30;
const MAX_MESSAGE = 1500;
const MAX_TURN_TEXT = 4000;
const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?speedxrental\.com$/, /^http:\/\/localhost(:\d+)?$/];

export type StreamEvent =
  | ChatEvent
  | { type: "message"; text: string }
  /** The reply has estimates: the browser must collect name and phone to see it. */
  | { type: "lead_required" }
  /** Over today's limit: the reply is the fixed "please call us" text. */
  | { type: "capped" }
  | { type: "session"; id: string }
  | { type: "error"; code: "unavailable" | "busy" | "invalid" }
  | { type: "done" };

export interface ChatRequestBody {
  locale: string;
  history: ChatTurn[];
  message: string;
  vehicleKey: string | null;
  /** Absent until the visitor gives name and phone. */
  lead: Lead | null;
  sessionId: string | null;
}

export function parseBody(raw: unknown): ChatRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.locale !== "string" || !(locales as readonly string[]).includes(body.locale)) return null;
  const lead = body.lead == null ? null : parseLead(body.lead);
  if (body.lead != null && !lead) return null;
  if (typeof body.message !== "string") return null;
  const message = body.message.trim();
  if (!message || message.length > MAX_MESSAGE) return null;
  if (!Array.isArray(body.history) || body.history.length > MAX_HISTORY) return null;
  const history: ChatTurn[] = [];
  for (const turn of body.history) {
    const t = turn as Record<string, unknown>;
    if ((t?.role !== "user" && t?.role !== "assistant") || typeof t.text !== "string") return null;
    if (!t.text.trim()) continue;
    history.push({ role: t.role, text: t.text.slice(0, MAX_TURN_TEXT) });
  }
  if (history.length > 0 && history[0].role !== "user") return null;
  const vehicleKey =
    typeof body.vehicleKey === "string" && body.vehicleKey.length <= 2000 ? body.vehicleKey : null;
  const sessionId =
    typeof body.sessionId === "string" && /^[a-f0-9]{32}$/.test(body.sessionId) ? body.sessionId : null;
  return { locale: body.locale, history, message, vehicleKey, lead, sessionId };
}

export function isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.ANTHROPIC_API_KEY &&
      env.WORLDPAC_USERNAME &&
      env.WORLDPAC_PASSWORD &&
      env.REPAIR_CHAT_ENABLED !== "false",
  );
}

/**
 * Evaluation runs (scripted test customers) send this header. They skip lead
 * emails/webhooks and the per-IP limit, under their own daily cap. Only the
 * SHA-256 of the token is in the repo; override with REPAIR_EVAL_TOKEN_SHA256.
 */
const EVAL_TOKEN_SHA256 =
  process.env.REPAIR_EVAL_TOKEN_SHA256 ?? "3b681a313d5aec4e57950bfeac55f5b8a8a10bc7734cfc6d52c348e21dc70fb0";

export function isEvalRequest(request: Request, expectedSha256: string = EVAL_TOKEN_SHA256): boolean {
  const token = request.headers.get("x-repair-eval");
  if (!token || !expectedSha256) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(expectedSha256, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

const limiter = new RateLimiter();
const leadLimiter = new RateLimiter({
  perIpWindowMs: 10 * 60 * 1000,
  perIpWindowMax: 5,
  perIpDailyMax: 20,
  globalDailyMax: 500,
});
const evalLimiter = new RateLimiter({
  perIpWindowMs: 60 * 1000,
  perIpWindowMax: 1000,
  perIpDailyMax: 3000,
  globalDailyMax: 3000,
});
let anthropic: MessagesClient | null = null;

export interface RouteDeps {
  client: () => MessagesClient;
  catalog: () => CatalogApi;
  limiter: RateLimiter;
  configured: () => boolean;
  notify: LeadNotifier;
  sessions: SessionStore;
  evalLimiter?: RateLimiter;
  /** Conversations opened per IP today; without it nobody is capped. */
  opens?: DailyOpenCounter;
  /** Owner/shop IPs that skip the daily cap and per-IP limits. */
  allowlist?: BlockList;
  /** Sends booking requests to the shop. */
  mailer?: Mailer;
}

/**
 * The lead, chat and finish routes must share one session store and one
 * counter, so they live on globalThis rather than in a module instance.
 */
const SHARED = Symbol.for("speedx.repairChat.shared");

interface Shared {
  sessions: SessionStore;
  opens: DailyOpenCounter;
  mailer: Mailer;
}

function shared(): Shared {
  const holder = globalThis as { [SHARED]?: Shared };
  if (!holder[SHARED]) {
    const mailer = createMailer();
    const sessions = new SessionStore(
      createFollowUpHandler(() => (isConfigured() ? (anthropic ??= new Anthropic()) : null), mailer),
    );
    if (process.env.NODE_ENV === "production") registerShutdownFlush(sessions);
    holder[SHARED] = { sessions, opens: new DailyOpenCounter(), mailer };
  }
  return holder[SHARED];
}

const defaultDeps: RouteDeps = {
  client: () => (anthropic ??= new Anthropic()),
  catalog: () => getWorldpacClient(),
  limiter,
  configured: () => isConfigured(),
  notify: createLeadNotifier(),
  evalLimiter,
  sessions: shared().sessions,
  opens: shared().opens,
  allowlist: parseAllowlist(process.env.REPAIR_CHAT_IP_ALLOWLIST),
  mailer: shared().mailer,
};

const bookingLimiter = new RateLimiter({
  perIpWindowMs: 10 * 60 * 1000,
  perIpWindowMax: 5,
  perIpDailyMax: 10,
  globalDailyMax: 300,
});

/** Fixed reply for a visitor over the daily limit; the AI is not called. */
export function cappedReply(locale: string): string {
  return getDictionary(locale as Locale).repairChat.capped.replaceAll("{phone}", company.phoneDisplay);
}

function trusted(request: Request, allowlist: BlockList | undefined): boolean {
  return allowlist ? isAllowlisted(allowlist, clientIp(request)) : false;
}

function foreignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && !ALLOWED_ORIGINS.some((pattern) => pattern.test(origin)));
}

/**
 * The visitor gave name and phone on the "your estimate is ready" form.
 * Attaches them to the conversation, tells the shop, and releases the reply
 * that was held back. If the session was lost (restart), `pending` is null
 * and the browser asks its last question again.
 */
export async function handleLead(
  request: Request,
  deps: Pick<RouteDeps, "configured" | "notify" | "sessions" | "opens" | "allowlist"> & { limiter: RateLimiter },
): Promise<Response> {
  if (foreignOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!deps.configured()) return Response.json({ error: "unavailable" }, { status: 503 });
  let raw: Record<string, unknown> | null = null;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    raw = null;
  }
  const lead = parseLead(raw?.lead);
  const locale = typeof raw?.locale === "string" && (locales as readonly string[]).includes(raw.locale) ? raw.locale : null;
  if (!lead || !locale) return Response.json({ error: "invalid" }, { status: 400 });
  if (isEvalRequest(request)) return Response.json({ ok: true, sessionId: null, pending: null });
  const ip = clientIp(request);
  if (!trusted(request, deps.allowlist) && deps.limiter.check(ip)) {
    return Response.json({ error: "busy" }, { status: 429 });
  }
  const sessionId = typeof raw?.sessionId === "string" && /^[a-f0-9]{32}$/.test(raw.sessionId) ? raw.sessionId : null;
  const at = new Date().toISOString();
  const session = deps.sessions.get(sessionId) ?? deps.sessions.create(lead, locale);
  const firstTime = !session.lead || session.id !== sessionId;
  deps.sessions.attachLead(session.id, lead);
  if (firstTime) {
    await deps.notify({ type: "lead_started", lead, locale, at });
    await Promise.all(session.estimates.map((card) => deps.notify(estimateLeadEvent(lead, locale, card))));
  }
  const pending = deps.sessions.takeReply(session.id) ?? null;
  return Response.json({ ok: true, sessionId: session.id, pending });
}

/** Sent by the browser (sendBeacon) when the visitor leaves the page. */
export async function handleFinish(request: Request, deps: Pick<RouteDeps, "sessions">): Promise<Response> {
  if (foreignOrigin(request)) return new Response(null, { status: 403 });
  let id: unknown = null;
  try {
    id = ((await request.json()) as Record<string, unknown>)?.sessionId;
  } catch {
    id = null;
  }
  if (typeof id === "string" && /^[a-f0-9]{32}$/.test(id)) {
    void deps.sessions.finish(id, "left_page");
  }
  return new Response(null, { status: 204 });
}

export function handleDefaultFinish(request: Request): Promise<Response> {
  return handleFinish(request, defaultDeps);
}

export function handleDefaultLead(request: Request): Promise<Response> {
  return handleLead(request, {
    configured: defaultDeps.configured,
    notify: defaultDeps.notify,
    sessions: defaultDeps.sessions,
    opens: defaultDeps.opens,
    allowlist: defaultDeps.allowlist,
    limiter: leadLimiter,
  });
}

export async function handleChat(request: Request, deps: RouteDeps): Promise<Response> {
  if (foreignOrigin(request)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!deps.configured()) {
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  let body: ChatRequestBody | null = null;
  try {
    body = parseBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) return Response.json({ error: "invalid" }, { status: 400 });
  const evaluation = isEvalRequest(request);
  const ip = clientIp(request);
  const owner = !evaluation && trusted(request, deps.allowlist);
  const request_ = body;
  // Evaluation traffic never opens a follow-up session or notifies the shop.
  const sessions = evaluation ? new SessionStore(async () => {}) : deps.sessions;
  const known = sessions.get(request_.sessionId);
  // A conversation the server hasn't seen counts toward today's limit.
  const opensToday = known?.opensToday ?? (evaluation || owner ? 0 : (deps.opens?.record(ip) ?? 0));
  const capped = known ? known.capped : opensToday > DAILY_OPEN_LIMIT;

  const limited = capped || owner
    ? null
    : evaluation
      ? (deps.evalLimiter ?? deps.limiter).check("eval")
      : deps.limiter.check(ip);
  if (limited) return Response.json({ error: "busy" }, { status: 429 });

  const notify: LeadNotifier = evaluation ? async () => {} : deps.notify;
  const session = known ?? sessions.create(request_.lead, request_.locale, { opensToday, capped });
  if (!session.lead && request_.lead) sessions.attachLead(session.id, request_.lead);
  // A session this process doesn't know was opened before a restart: keep
  // the earlier part of the conversation for the shop's email.
  if (!known) sessions.seed(session.id, request_.history);
  sessions.record(session.id, { role: "user", text: request_.message });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pendingNotices: Array<Promise<void>> = [];
      // Without name and phone, estimates (and the reply quoting them) stay on the server.
      const held: EstimateCard[] = [];
      const send = (event: StreamEvent) => {
        if (event.type === "estimate") {
          sessions.recordEstimate(session.id, event.estimate);
          if (!session.lead) {
            held.push(event.estimate);
            return;
          }
          pendingNotices.push(notify(estimateLeadEvent(session.lead, request_.locale, event.estimate)));
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      if (!evaluation && session.id !== request_.sessionId) send({ type: "session", id: session.id });
      try {
        const result = capped
          ? { text: cappedReply(request_.locale), events: [] }
          : await runChat(
          deps.client(),
          deps.catalog(),
          {
            history: request_.history,
            message: request_.message,
            locale: request_.locale,
            vehicleKey: request_.vehicleKey,
          },
          send,
          () => `E-${randomBytes(4).toString("hex").toUpperCase()}`,
        );
        sessions.record(session.id, { role: "assistant", text: result.text });
        if (evaluation) await sessions.finish(session.id, "idle"); // drop the throwaway session's timer
        if (capped) send({ type: "capped" });
        if (held.length > 0) {
          sessions.holdReply(session.id, { text: result.text, estimates: held });
          send({ type: "lead_required" });
        } else {
          send({ type: "message", text: result.text });
        }
      } catch (error) {
        const busy = error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError;
        const status = error instanceof Anthropic.APIError ? error.status : undefined;
        console.error(
          "repair-chat failed",
          error instanceof Error ? error.name : "unknown",
          status ?? "",
          error instanceof Error ? error.message.slice(0, 500) : "",
        );
        send({ type: "error", code: busy ? "busy" : "unavailable" });
      } finally {
        await Promise.allSettled(pendingNotices);
        send({ type: "done" });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function handleDefaultChat(request: Request): Promise<Response> {
  return handleChat(request, defaultDeps);
}

// ------------------------------------------------------------------ booking

function closedDates() {
  return parseClosedDates(process.env.REPAIR_BOOKING_CLOSED_DATES);
}

/** Open days and half-hour slots for the booking card. */
export function handleBookingSlots(now = new Date()): Response {
  return Response.json(
    { days: bookableDays(now, closedDates()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** The visitor picked a time on the booking card: email the shop to confirm it. */
export async function handleBooking(
  request: Request,
  deps: Pick<RouteDeps, "configured" | "notify" | "sessions" | "allowlist" | "mailer"> & { limiter: RateLimiter },
  now = new Date(),
): Promise<Response> {
  if (foreignOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!deps.configured()) return Response.json({ error: "unavailable" }, { status: 503 });
  let raw: Record<string, unknown> | null = null;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    raw = null;
  }
  const lead = parseLead(raw?.lead);
  const locale = typeof raw?.locale === "string" && (locales as readonly string[]).includes(raw.locale) ? raw.locale : null;
  const date = typeof raw?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  const time = typeof raw?.time === "string" && (SLOT_TIMES as readonly string[]).includes(raw.time) ? raw.time : null;
  if (!lead || !locale || !date || !time) return Response.json({ error: "invalid" }, { status: 400 });
  if (!isBookable(date, time, now, closedDates())) return Response.json({ error: "slot" }, { status: 409 });
  if (isEvalRequest(request)) return Response.json({ ok: true });
  if (!trusted(request, deps.allowlist) && deps.limiter.check(clientIp(request))) {
    return Response.json({ error: "busy" }, { status: 429 });
  }

  const sessionId = typeof raw?.sessionId === "string" && /^[a-f0-9]{32}$/.test(raw.sessionId) ? raw.sessionId : null;
  const session = deps.sessions.get(sessionId);
  if (session) deps.sessions.recordBooking(session.id, { date, time });
  const email = composeBookingEmail(lead, locale, { date, time }, session);
  try {
    await (deps.mailer ?? createMailer())(email);
  } catch (error) {
    // Never lose the booking: keep the full email in the log if sending fails.
    console.error("repair-booking email failed", (error as Error).message, JSON.stringify(email));
  }
  await deps.notify({ type: "booking_requested", lead, locale, at: now.toISOString(), date, time });
  return Response.json({ ok: true });
}

export function handleDefaultBooking(request: Request): Promise<Response> {
  return handleBooking(request, {
    configured: defaultDeps.configured,
    notify: defaultDeps.notify,
    sessions: defaultDeps.sessions,
    allowlist: defaultDeps.allowlist,
    mailer: defaultDeps.mailer,
    limiter: bookingLimiter,
  });
}
