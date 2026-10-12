import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { locales } from "@/i18n/config";
import { runChat, type ChatTurn, type MessagesClient } from "@/lib/repair-chat/agent";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
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
  | { type: "error"; code: "unavailable" | "busy" | "invalid" }
  | { type: "done" };

export interface ChatRequestBody {
  locale: string;
  history: ChatTurn[];
  message: string;
  vehicleKey: string | null;
}

export function parseBody(raw: unknown): ChatRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.locale !== "string" || !(locales as readonly string[]).includes(body.locale)) return null;
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
  return { locale: body.locale, history, message, vehicleKey };
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
let anthropic: MessagesClient | null = null;

export interface RouteDeps {
  client: () => MessagesClient;
  catalog: () => CatalogApi;
  limiter: RateLimiter;
  configured: () => boolean;
}

const defaultDeps: RouteDeps = {
  client: () => (anthropic ??= new Anthropic()),
  catalog: () => getWorldpacClient(),
  limiter,
  configured: () => isConfigured(),
};

export async function handleChat(request: Request, deps: RouteDeps): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.some((pattern) => pattern.test(origin))) {
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
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
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
        send({ type: "message", text: result.text });
      } catch (error) {
        const busy = error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError;
        console.error("repair-chat failed", error instanceof Error ? error.name : "unknown");
        send({ type: "error", code: busy ? "busy" : "unavailable" });
      } finally {
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
