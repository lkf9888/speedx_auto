/**
 * /api/hosting-estimate/chat and /api/hosting-estimate/lead.
 *
 * Like the repair estimate assistant, the income report is held on the
 * server until the owner leaves a name and phone number; the shop then gets
 * an email with the contact, the car and the numbers shown. Name and phone
 * never go to the AI model.
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { locales } from "@/i18n/config";
import type { MessagesClient } from "@/lib/repair-chat/agent";
import { createMailer, type Mailer } from "@/lib/repair-chat/followup";
import { parseLead, type Lead } from "@/lib/repair-chat/lead";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { runHostingChat, type AssistantEvent, type ChatTurn } from "./assistant";
import type { IncomeCard } from "./estimate";

const MAX_HISTORY = 20;
const MAX_MESSAGE = 800;
const MAX_TURN_TEXT = 3000;
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const ALLOWED_ORIGINS = [/^https:\/\/(www\.)?speedxrental\.com$/, /^http:\/\/localhost(:\d+)?$/];

export type HostingStreamEvent =
  | AssistantEvent
  | { type: "session"; id: string }
  | { type: "message"; text: string }
  /** The report waits until the browser collects name and phone. */
  | { type: "lead_required" }
  | { type: "error"; code: "busy" | "unavailable" }
  | { type: "done" };

interface HostingSession {
  id: string;
  locale: string;
  lead: Lead | null;
  transcript: ChatTurn[];
  cards: IncomeCard[];
  held: { text: string; cards: IncomeCard[] } | null;
  lastAt: number;
}

export class HostingSessions {
  private readonly sessions = new Map<string, HostingSession>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get(id: string | null): HostingSession | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session || this.now() - session.lastAt > SESSION_TTL_MS) return null;
    session.lastAt = this.now();
    return session;
  }

  create(locale: string): HostingSession {
    if (this.sessions.size > 2000) {
      for (const [id, s] of this.sessions) if (this.now() - s.lastAt > SESSION_TTL_MS) this.sessions.delete(id);
    }
    const session: HostingSession = { id: randomBytes(16).toString("hex"), locale, lead: null, transcript: [], cards: [], held: null, lastAt: this.now() };
    this.sessions.set(session.id, session);
    return session;
  }
}

export interface HostingDeps {
  client: () => MessagesClient;
  configured: () => boolean;
  limiter: RateLimiter;
  leadLimiter: RateLimiter;
  sessions: HostingSessions;
  mailer: Mailer;
  newId?: () => string;
  today?: () => Date;
}

const SHARED = Symbol.for("speedx.hostingEstimate.shared");
function shared(): { sessions: HostingSessions; mailer: Mailer } {
  const holder = globalThis as { [SHARED]?: { sessions: HostingSessions; mailer: Mailer } };
  holder[SHARED] ??= { sessions: new HostingSessions(), mailer: createMailer() };
  return holder[SHARED];
}

let anthropic: MessagesClient | null = null;

export function defaultHostingDeps(): HostingDeps {
  return {
    client: () => (anthropic ??= new Anthropic()),
    configured: () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.HOSTING_ESTIMATE_ENABLED !== "false",
    limiter: (globalThis as { __hostingLimiter?: RateLimiter }).__hostingLimiter ??= new RateLimiter({
      perIpWindowMs: 10 * 60 * 1000,
      perIpWindowMax: 12,
      perIpDailyMax: 40,
      globalDailyMax: 800,
    }),
    leadLimiter: (globalThis as { __hostingLeadLimiter?: RateLimiter }).__hostingLeadLimiter ??= new RateLimiter({
      perIpWindowMs: 10 * 60 * 1000,
      perIpWindowMax: 5,
      perIpDailyMax: 20,
      globalDailyMax: 300,
    }),
    sessions: shared().sessions,
    mailer: shared().mailer,
  };
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function foreignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && !ALLOWED_ORIGINS.some((pattern) => pattern.test(origin)));
}

const isLocale = (value: unknown): value is string => typeof value === "string" && (locales as readonly string[]).includes(value);
const sessionIdOf = (value: unknown) => (typeof value === "string" && /^[a-f0-9]{32}$/.test(value) ? value : null);

export interface HostingChatBody {
  locale: string;
  history: ChatTurn[];
  message: string;
  lead: Lead | null;
  sessionId: string | null;
}

export function parseHostingBody(raw: unknown): HostingChatBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (!isLocale(body.locale) || typeof body.message !== "string") return null;
  const message = body.message.trim();
  if (!message || message.length > MAX_MESSAGE) return null;
  const lead = body.lead == null ? null : parseLead(body.lead);
  if (body.lead != null && !lead) return null;
  if (!Array.isArray(body.history) || body.history.length > MAX_HISTORY) return null;
  const history: ChatTurn[] = [];
  for (const turn of body.history) {
    const t = turn as Record<string, unknown>;
    if ((t?.role !== "user" && t?.role !== "assistant") || typeof t.text !== "string") return null;
    if (t.text.trim()) history.push({ role: t.role, text: t.text.slice(0, MAX_TURN_TEXT) });
  }
  while (history.length && history[0].role !== "user") history.shift();
  return { locale: body.locale, history, message, lead, sessionId: sessionIdOf(body.sessionId) };
}

const LANGUAGE_LABEL: Record<string, string> = { en: "英文", "zh-CN": "简体中文", "zh-TW": "繁体中文" };

export function leadEmail(session: { locale: string; transcript: ChatTurn[] }, lead: Lead, cards: IncomeCard[]) {
  const vehicles = [...new Set(cards.map((c) => c.vehicle))].join("、");
  return {
    subject: `【网站托管估价线索】${lead.name} ${lead.phone}${vehicles ? ` · ${vehicles}` : ""}`,
    text: [
      "网站租车托管页的 AI 估价助手有一位车主留了联系方式，请跟进。",
      "",
      `车主姓名：${lead.name}`,
      `车主电话：${lead.phone}`,
      `使用语言：${LANGUAGE_LABEL[session.locale] ?? session.locale}`,
      "",
      "—— 给车主看到的估价（已扣 30% 管理费的净收益，不含车主自付成本）——",
      ...cards.map(
        (c) =>
          `${c.id} · ${c.vehicle} · 未来 12 个月净收益约 $${c.annualNet}（区间 $${c.annualLow}–$${c.annualHigh}），月均约 $${c.monthlyAverage}${c.observed ? "（我们管过这个车型）" : "（按相近车型估算）"}`,
      ),
      "",
      "—— 对话记录 ——",
      ...session.transcript.map((t) => `${t.role === "user" ? "车主" : "助手"}：${t.text}`),
    ].join("\n"),
  };
}

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function handleHostingChat(request: Request, deps: HostingDeps = defaultHostingDeps()): Promise<Response> {
  if (foreignOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  if (!deps.configured()) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  let body: HostingChatBody | null = null;
  try {
    body = parseHostingBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  if (deps.limiter.check(clientIp(request))) return Response.json({ error: "busy" }, { status: 429, headers: NO_STORE });

  const session = deps.sessions.get(body.sessionId) ?? deps.sessions.create(body.locale);
  if (body.lead && !session.lead) session.lead = body.lead;
  const request_ = body;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: HostingStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "session", id: session.id });
      try {
        // Cards are not streamed: without name and phone they stay on the server.
        const result = await runHostingChat(
          deps.client(),
          { history: request_.history, message: request_.message, locale: request_.locale },
          (event) => {
            if (event.type === "status") send(event);
          },
          deps.newId ?? (() => `H-${randomBytes(3).toString("hex").toUpperCase()}`),
          deps.today?.(),
        );
        session.transcript.push({ role: "user", text: request_.message }, { role: "assistant", text: result.text });
        session.cards.push(...result.cards);
        if (result.cards.length && !session.lead) {
          session.held = { text: result.text, cards: result.cards };
          send({ type: "lead_required" });
        } else {
          for (const card of result.cards) send({ type: "income_estimate", estimate: card });
          send({ type: "message", text: result.text });
          if (result.cards.length && session.lead) await deps.mailer(leadEmail(session, session.lead, result.cards));
        }
      } catch (error) {
        const busy = error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError;
        console.error("hosting-estimate chat failed", error instanceof Error ? `${error.name} ${error.message.slice(0, 300)}` : "unknown");
        send({ type: "error", code: busy ? "busy" : "unavailable" });
      } finally {
        send({ type: "done" });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Content-Type-Options": "nosniff", ...NO_STORE },
  });
}

/** Name and phone given: release the held report and tell the shop. */
export async function handleHostingLead(request: Request, deps: HostingDeps = defaultHostingDeps()): Promise<Response> {
  if (foreignOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  let raw: Record<string, unknown> | null = null;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    raw = null;
  }
  const lead = parseLead(raw?.lead);
  if (!lead || !isLocale(raw?.locale)) return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  if (deps.leadLimiter.check(clientIp(request))) return Response.json({ error: "busy" }, { status: 429, headers: NO_STORE });
  const session = deps.sessions.get(sessionIdOf(raw?.sessionId));
  // Lost session (server restarted): the browser asks its last question again, with the contact.
  if (!session) return Response.json({ pending: null }, { headers: NO_STORE });
  session.lead = lead;
  const pending = session.held;
  session.held = null;
  try {
    await deps.mailer(leadEmail(session, lead, session.cards));
  } catch (error) {
    console.error("hosting-estimate lead email failed", (error as Error).message, JSON.stringify(leadEmail(session, lead, session.cards)));
  }
  return Response.json({ pending }, { headers: NO_STORE });
}
