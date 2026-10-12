import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { locales } from "@/i18n/config";
import { runChat, type ChatTurn, type MessagesClient } from "@/lib/repair-chat/agent";
import {
  createLeadNotifier,
  estimateLeadEvent,
  parseLead,
  type Lead,
  type LeadNotifier,
} from "@/lib/repair-chat/lead";
import { createFollowUpHandler, createMailer } from "@/lib/repair-chat/followup";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore } from "@/lib/repair-chat/session";
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
  | { type: "session"; id: string }
  | { type: "error"; code: "unavailable" | "busy" | "invalid" }
  | { type: "done" };

export interface ChatRequestBody {
  locale: string;
  history: ChatTurn[];
  message: string;
  vehicleKey: string | null;
  lead: Lead;
  sessionId: string | null;
}

export function parseBody(raw: unknown): ChatRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.locale !== "string" || !(locales as readonly string[]).includes(body.locale)) return null;
  const lead = parseLead(body.lead);
  if (!lead) return null;
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

function clientIp(request: Request): string {
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
let anthropic: MessagesClient | null = null;

export interface RouteDeps {
  client: () => MessagesClient;
  catalog: () => CatalogApi;
  limiter: RateLimiter;
  configured: () => boolean;
  notify: LeadNotifier;
  sessions: SessionStore;
}

const defaultDeps: RouteDeps = {
  client: () => (anthropic ??= new Anthropic()),
  catalog: () => getWorldpacClient(),
  limiter,
  configured: () => isConfigured(),
  notify: createLeadNotifier(),
  sessions: new SessionStore(
    createFollowUpHandler(() => (isConfigured() ? (anthropic ??= new Anthropic()) : null), createMailer()),
  ),
};

function foreignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && !ALLOWED_ORIGINS.some((pattern) => pattern.test(origin)));
}

/** Called once when a visitor submits name + phone to open the assistant. */
export async function handleLead(
  request: Request,
  deps: Pick<RouteDeps, "configured" | "notify" | "sessions"> & { limiter: RateLimiter },
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
  if (deps.limiter.check(clientIp(request))) return Response.json({ error: "busy" }, { status: 429 });
  await deps.notify({ type: "lead_started", lead, locale, at: new Date().toISOString() });
  const session = deps.sessions.create(lead, locale);
  return Response.json({ ok: true, sessionId: session.id });
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
  const limited = deps.limiter.check(clientIp(request));
  if (limited) return Response.json({ error: "busy" }, { status: 429 });

  const request_ = body;
  const session =
    deps.sessions.get(request_.sessionId) ?? deps.sessions.create(request_.lead, request_.locale);
  deps.sessions.record(session.id, { role: "user", text: request_.message });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pendingNotices: Array<Promise<void>> = [];
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        if (event.type === "estimate") {
          deps.sessions.recordEstimate(session.id, event.estimate);
          pendingNotices.push(deps.notify(estimateLeadEvent(request_.lead, request_.locale, event.estimate)));
        }
      };
      if (session.id !== request_.sessionId) send({ type: "session", id: session.id });
      try {
        const result = await runChat(
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
        deps.sessions.record(session.id, { role: "assistant", text: result.text });
        send({ type: "message", text: result.text });
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
