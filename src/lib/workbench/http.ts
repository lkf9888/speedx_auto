/**
 * /api/workbench/chat — the staff assistant. Every request must carry a
 * verified Cloudflare Access sign-in (see access.ts); requests are logged
 * with the staff member's email.
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { runChat, type ChatTurn, type MessagesClient } from "@/lib/repair-chat/agent";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import type { CatalogApi } from "@/lib/worldpac/catalog";
import { getWorldpacClient } from "@/lib/worldpac/client";
import { staffUser, type StaffUser } from "./access";
import { WORKBENCH_PROFILE, type WorkbenchEvent } from "./assistant";

const MAX_HISTORY = 40;
const MAX_MESSAGE = 2000;
const MAX_TURN_TEXT = 6000;

export type WorkbenchStreamEvent =
  | WorkbenchEvent
  | { type: "message"; text: string }
  | { type: "error"; code: "busy" | "unavailable" }
  | { type: "done" };

export interface WorkbenchBody {
  history: ChatTurn[];
  message: string;
  vehicleKey: string | null;
}

export function parseWorkbenchBody(raw: unknown): WorkbenchBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.message !== "string") return null;
  const message = body.message.trim();
  if (!message || message.length > MAX_MESSAGE) return null;
  if (!Array.isArray(body.history) || body.history.length > MAX_HISTORY) return null;
  const history: ChatTurn[] = [];
  for (const turn of body.history) {
    const t = turn as Record<string, unknown>;
    if ((t?.role !== "user" && t?.role !== "assistant") || typeof t.text !== "string") return null;
    if (t.text.trim()) history.push({ role: t.role, text: t.text.slice(0, MAX_TURN_TEXT) });
  }
  while (history.length > 0 && history[0].role !== "user") history.shift();
  const vehicleKey = typeof body.vehicleKey === "string" && body.vehicleKey.length <= 2000 ? body.vehicleKey : null;
  return { history, message, vehicleKey };
}

export interface WorkbenchDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  client: () => MessagesClient;
  catalog: () => CatalogApi;
  limiter: RateLimiter;
  configured: () => boolean;
  log: (entry: Record<string, unknown>) => void;
}

let anthropic: MessagesClient | null = null;

const defaultDeps: WorkbenchDeps = {
  user: (request) => staffUser(request.headers),
  client: () => (anthropic ??= new Anthropic()),
  catalog: () => getWorldpacClient(),
  // Per staff member, generous: it's a work tool, but it still spends money.
  limiter: new RateLimiter({ perIpWindowMs: 10 * 60 * 1000, perIpWindowMax: 80, perIpDailyMax: 600, globalDailyMax: 3000 }),
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY && process.env.WORLDPAC_USERNAME && process.env.WORLDPAC_PASSWORD),
  log: (entry) => console.info("workbench", JSON.stringify(entry)),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function handleWorkbenchChat(request: Request, deps: WorkbenchDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!deps.configured()) return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  let body: WorkbenchBody | null = null;
  try {
    body = parseWorkbenchBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) return Response.json({ error: "invalid" }, { status: 400, headers: NO_STORE });
  if (deps.limiter.check(user.email)) return Response.json({ error: "busy" }, { status: 429, headers: NO_STORE });
  deps.log({ email: user.email, at: new Date().toISOString(), message: body.message.slice(0, 300) });

  const request_ = body;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: WorkbenchStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await runChat<WorkbenchEvent>(
          deps.client(),
          deps.catalog(),
          { history: request_.history, message: request_.message, locale: "zh-CN", vehicleKey: request_.vehicleKey },
          send,
          () => `W-${randomBytes(4).toString("hex").toUpperCase()}`,
          WORKBENCH_PROFILE,
        );
        send({ type: "message", text: result.text });
      } catch (error) {
        const busy = error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError;
        console.error("workbench chat failed", error instanceof Error ? `${error.name} ${error.message.slice(0, 300)}` : "unknown");
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
