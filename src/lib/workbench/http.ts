/**
 * /api/workbench/chat — the staff assistant. Every request must carry a
 * verified Cloudflare Access sign-in (see access.ts); requests are logged
 * with the staff member's email.
 */
import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { runChat, type ChatTurn, type MessagesClient } from "@/lib/repair-chat/agent";
import { estimateRanges, type EstimateCard } from "@/lib/repair-chat/pricing";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import type { CatalogApi } from "@/lib/worldpac/catalog";
import { getWorldpacClient } from "@/lib/worldpac/client";
import { staffUser, type StaffUser } from "./access";
import { attachmentBlocks, parseAttachments, type WorkbenchAttachment } from "./attachments";
import { WORKBENCH_PROFILE, type WorkbenchEvent } from "./assistant";
import { getMemoryStore, memoryPrompt, type MemoryNote, type MemoryStore } from "./memory";
import { getConversationStore, newTurnId, type ConversationStore } from "./conversations";
import { ASSISTANT, type Turn, type Vehicle } from "./conversation-types";
import type { AlldataDraft } from "./alldata-draft";
import type { MemoryProposal } from "./assistant";
import type { StaffQuote } from "./quote";

const MAX_HISTORY = 40;
const MAX_MESSAGE = 2000;
const MAX_TURN_TEXT = 6000;

const REPLY_ERRORS: Record<string, string> = {
  busy: "请求太频繁，请稍后再试。",
  unavailable: "暂时无法查询，请稍后再试。",
  empty: "没有得到回复，请换个说法再试一次。",
};

export type WorkbenchStreamEvent =
  | WorkbenchEvent
  | { type: "message"; text: string }
  | { type: "saved"; turns: Turn[] }
  | { type: "error"; code: "busy" | "unavailable" }
  | { type: "done" };

export interface WorkbenchBody {
  /** The shared conversation this message belongs to; its stored turns are the history. */
  conversationId: string | null;
  history: ChatTurn[];
  message: string;
  vehicleKey: string | null;
  attachments: WorkbenchAttachment[];
}

export function parseWorkbenchBody(raw: unknown): WorkbenchBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.message !== "string") return null;
  const attachments = parseAttachments(body.attachments);
  if (!attachments) return null;
  // Files alone are a valid message ("what is this?").
  const message = body.message.trim() || (attachments.length ? "请看附件。" : "");
  if (!message || message.length > MAX_MESSAGE) return null;
  const conversationId = typeof body.conversationId === "string" && /^c[a-z0-9]{6,40}$/.test(body.conversationId) ? body.conversationId : null;
  if (body.history === undefined && conversationId) body.history = [];
  if (!Array.isArray(body.history) || body.history.length > MAX_HISTORY) return null;
  const history: ChatTurn[] = [];
  for (const turn of body.history) {
    const t = turn as Record<string, unknown>;
    if ((t?.role !== "user" && t?.role !== "assistant") || typeof t.text !== "string") return null;
    if (t.text.trim()) history.push({ role: t.role, text: t.text.slice(0, MAX_TURN_TEXT) });
  }
  while (history.length > 0 && history[0].role !== "user") history.shift();
  const vehicleKey = typeof body.vehicleKey === "string" && body.vehicleKey.length <= 2000 ? body.vehicleKey : null;
  return { conversationId, history, message, vehicleKey, attachments };
}

export interface WorkbenchDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  client: () => MessagesClient;
  catalog: () => CatalogApi;
  limiter: RateLimiter;
  configured: () => boolean;
  log: (entry: Record<string, unknown>) => void;
  /** The shared notes, or null when they aren't set up. */
  memory?: () => MemoryStore | null;
  /** The shared conversations, or null when they aren't set up. */
  conversations?: () => ConversationStore | null;
}

/** The model's view of a stored conversation: the text of each turn, with earlier files named. */
/** One line per estimate card a website customer was shown: what they were quoted. */
function websiteCardLine(card: EstimateCard): string {
  const { totalLow, totalHigh } = estimateRanges(card);
  const total = totalLow === totalHigh ? `$${totalLow}` : `$${totalLow}–$${totalHigh}`;
  return `[客人看到的报价卡：${[card.vehicle, card.service, card.position].filter((x) => x && x !== "—").join(" · ")}，${total}（客户价）]`;
}

export function historyFromTurns(turns: Turn[]): ChatTurn[] {
  const history = turns
    .filter((t) => !t.localOnly && (t.text.trim() || t.attachments?.length))
    .slice(-MAX_HISTORY)
    .map((t) => ({
      role: t.role,
      // Earlier files aren't sent again; the model is told they existed.
      text: [
        t.source === "website" ? (t.role === "user" ? "[网站客人在公开估价页上问]" : "[网站 AI 客服回复客人]") : "",
        t.text,
        t.attachments?.length ? `[附件：${t.attachments.map((a) => a.name).join("、")}]` : "",
        ...(t.estimates ?? []).map(websiteCardLine),
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, MAX_TURN_TEXT),
    }));
  while (history.length > 0 && history[0].role !== "user") history.shift();
  return history;
}

/** The shared notes; a memory outage never blocks a quote. */
async function loadNotes(deps: WorkbenchDeps): Promise<MemoryNote[]> {
  try {
    return (await deps.memory?.()?.list()) ?? [];
  } catch (error) {
    console.error("workbench memory unavailable", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return [];
  }
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
  memory: () => getMemoryStore(),
  conversations: () => getConversationStore(),
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
  deps.log({
    email: user.email,
    at: new Date().toISOString(),
    message: body.message.slice(0, 300),
    ...(body.attachments.length ? { attachments: body.attachments.map((a) => a.name) } : {}),
  });

  const request_ = body;
  const store = body.conversationId ? (deps.conversations?.() ?? null) : null;
  const stored = store && body.conversationId ? await store.get(body.conversationId).catch(() => null) : null;
  if (stored) {
    request_.history = historyFromTurns(stored.turns);
    request_.vehicleKey = stored.vehicle?.key ?? request_.vehicleKey;
  }
  const notes = await loadNotes(deps);
  const profile = notes.length ? { ...WORKBENCH_PROFILE, system: `${WORKBENCH_PROFILE.system}\n\n${memoryPrompt(notes)}` } : WORKBENCH_PROFILE;
  const encoder = new TextEncoder();
  const conversationId = request_.conversationId;
  const userTurn: Turn = {
    id: newTurnId(),
    role: "user",
    text: request_.message,
    author: user.email,
    at: Date.now(),
    quotes: [],
    ...(request_.attachments.length ? { attachments: request_.attachments.map(({ name, mediaType }) => ({ name, mediaType })) } : {}),
  };
  // Others see the question (and that it's being answered) right away.
  if (store && conversationId) {
    store.pending.set(conversationId, { by: user.email, status: "thinking", since: Date.now() });
    await store
      .append(conversationId, user.email, [userTurn], undefined, request_.message || request_.attachments[0]?.name)
      .catch((error) => console.error("workbench conversation save failed", error instanceof Error ? error.message.slice(0, 200) : "unknown"));
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reply: { text: string; quotes: StaffQuote[]; drafts: AlldataDraft[]; memories: MemoryProposal[]; vehicle?: Vehicle; error: string | null } = {
        text: "",
        quotes: [],
        drafts: [],
        memories: [],
        error: null,
      };
      const send = (event: WorkbenchStreamEvent) => {
        if (event.type === "quote") reply.quotes.push(event.quote);
        else if (event.type === "alldata_draft") reply.drafts.push(event.draft);
        else if (event.type === "memory_proposal") reply.memories.push(event.proposal);
        else if (event.type === "vehicle") reply.vehicle = event.vehicle;
        else if (event.type === "status" && store && conversationId) store.pending.set(conversationId, { by: user.email, status: event.status, since: Date.now() });
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        const result = await runChat<WorkbenchEvent>(
          deps.client(),
          deps.catalog(),
          {
            history: request_.history,
            message: request_.message,
            locale: "zh-CN",
            vehicleKey: request_.vehicleKey,
            attachments: request_.attachments.length ? attachmentBlocks(request_.attachments) : undefined,
          },
          send,
          () => `W-${randomBytes(4).toString("hex").toUpperCase()}`,
          profile,
        );
        reply.text = result.text;
        send({ type: "message", text: result.text });
      } catch (error) {
        const busy = error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError;
        console.error("workbench chat failed", error instanceof Error ? `${error.name} ${error.message.slice(0, 300)}` : "unknown");
        reply.error = busy ? "busy" : "unavailable";
        send({ type: "error", code: busy ? "busy" : "unavailable" });
      } finally {
        if (store && conversationId) {
          store.pending.delete(conversationId);
          const answer: Turn = {
            id: newTurnId(),
            role: "assistant",
            author: ASSISTANT,
            at: Date.now(),
            text: reply.error ? REPLY_ERRORS[reply.error] : reply.text,
            quotes: reply.quotes,
            ...(reply.drafts.length ? { drafts: reply.drafts } : {}),
            ...(reply.memories.length ? { memories: reply.memories } : {}),
            ...(reply.error || (!reply.text && !reply.quotes.length) ? { localOnly: true } : {}),
          };
          if (!answer.text && !answer.quotes.length && !answer.drafts && !answer.memories) answer.text = REPLY_ERRORS.empty;
          try {
            await store.append(conversationId, user.email, [answer], reply.vehicle);
            send({ type: "saved", turns: [userTurn, answer] });
          } catch (error) {
            console.error("workbench conversation save failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
          }
        }
        send({ type: "done" });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Content-Type-Options": "nosniff", ...NO_STORE },
  });
}
