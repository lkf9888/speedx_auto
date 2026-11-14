/**
 * /api/workbench/house-rules — the owner's rules for the website's estimate
 * assistant. Every signed-in staff member can see them; only the people in
 * WEBSITE_RULES_ADMINS (everyone when it's unset) can change them or talk to
 * the AI that drafts them (/api/workbench/house-rules/chat). Every change is
 * logged with the email of whoever made it.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "@/lib/repair-chat/agent";
import { shopNow } from "@/lib/repair-chat/booking";
import { HouseRuleError, type HouseRule, type HouseRuleChange } from "@/lib/repair-chat/house-rules";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { staffUser, type StaffUser } from "./access";
import { askRulesAssistant, type RulesReply, type RulesTurn } from "./house-rules-agent";
import { canEditHouseRules, getHouseRulesStore, type HouseRulesStore } from "./house-rules-store";

export interface HouseRulesDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  store: () => HouseRulesStore | null;
  canEdit: (email: string) => boolean;
  log: (entry: Record<string, unknown>) => void;
  ask?: (rules: readonly HouseRule[], history: RulesTurn[], message: string, today: string) => Promise<RulesReply>;
  limiter?: RateLimiter;
  /** Whether the AI can be called (an API key is set). */
  configured?: () => boolean;
  now?: () => Date;
}

let anthropic: MessagesClient | null = null;

const defaultDeps: HouseRulesDeps = {
  user: (request) => staffUser(request.headers),
  store: () => getHouseRulesStore(),
  canEdit: (email) => canEditHouseRules(email),
  log: (entry) => console.info("website rules", JSON.stringify(entry)),
  ask: (rules, history, message, today) => askRulesAssistant((anthropic ??= new Anthropic()), rules, history, message, today),
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  limiter: new RateLimiter({ perIpWindowMs: 10 * 60 * 1000, perIpWindowMax: 40, perIpDailyMax: 200, globalDailyMax: 400 }),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const STATUS: Record<HouseRuleError["kind"], number> = { config: 503, invalid: 400, not_found: 404, full: 409, upstream: 502, forbidden: 403 };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const MAX_HISTORY = 30;

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function failed(error: unknown): Response {
  if (error instanceof HouseRuleError) {
    if (error.kind === "upstream") console.error("website rules failed", error.message.slice(0, 200));
    return json({ error: error.kind, message: error.kind === "upstream" ? "规则存储暂时连不上，请稍后再试" : error.message }, STATUS[error.kind]);
  }
  console.error("website rules failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  return json({ error: "upstream", message: "出错了，请稍后再试" }, 502);
}

export async function handleHouseRules(request: Request, deps: HouseRulesDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const store = deps.store();
  if (!store) return json({ error: "not_configured", message: "服务器没有设置 Cloudflare KV" }, 503);
  const canEdit = deps.canEdit(user.email);
  const today = shopNow((deps.now ?? (() => new Date()))()).date;
  try {
    if (request.method === "GET") return json({ rules: await store.list(true), canEdit, today });
    if (!canEdit) return json({ error: "forbidden", message: "只有店主能改对外助手的规则" }, 403);
    const body = await readBody(request);
    if (!body) return json({ error: "invalid", message: "请求格式不对" }, 400);
    let changes: HouseRuleChange[];
    if (request.method === "POST") changes = Array.isArray(body.changes) ? (body.changes as HouseRuleChange[]) : [];
    else if (request.method === "DELETE") changes = [{ action: "delete", id: typeof body.id === "string" ? body.id : "" }];
    else return json({ error: "method" }, 405);
    const rules = await store.apply(changes, user.email);
    deps.log({ email: user.email, changes });
    return json({ rules, canEdit, today });
  } catch (error) {
    return failed(error);
  }
}

function readHistory(raw: unknown): RulesTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .slice(-MAX_HISTORY)
    .flatMap((t) => {
      const turn = t as Record<string, unknown>;
      return (turn?.role === "user" || turn?.role === "assistant") && typeof turn.text === "string" && turn.text.trim()
        ? [{ role: turn.role, text: turn.text.slice(0, 4000) } as RulesTurn]
        : [];
    });
  // The model needs user/assistant turns to alternate, starting with the owner.
  const alternating: RulesTurn[] = [];
  for (const turn of turns) {
    if (alternating.length === 0 && turn.role !== "user") continue;
    const last = alternating.at(-1);
    if (last?.role === turn.role) last.text = `${last.text}\n${turn.text}`;
    else alternating.push({ ...turn });
  }
  if (alternating.at(-1)?.role === "user") alternating.pop();
  return alternating;
}

export async function handleHouseRulesChat(request: Request, deps: HouseRulesDeps = defaultDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!deps.canEdit(user.email)) return json({ error: "forbidden", message: "只有店主能调教对外助手" }, 403);
  const store = deps.store();
  if (!store) return json({ error: "not_configured", message: "服务器没有设置 Cloudflare KV" }, 503);
  if (!deps.ask || deps.configured?.() === false) return json({ error: "not_configured", message: "服务器没有设置 AI" }, 503);
  if (deps.limiter?.check(user.email)) return json({ error: "busy", message: "问得太快了，请稍等一会儿" }, 429);
  const body = await readBody(request);
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!message) return json({ error: "invalid", message: "请输入内容" }, 400);
  const today = shopNow((deps.now ?? (() => new Date()))()).date;
  try {
    const rules = await store.list(true);
    const reply = await deps.ask(rules, readHistory(body?.history), message, today);
    let problem = "";
    if (reply.proposal) {
      try {
        await store.check(reply.proposal.changes);
      } catch (error) {
        if (!(error instanceof HouseRuleError) || error.kind === "upstream") throw error;
        problem = error.message;
      }
    }
    deps.log({ email: user.email, asked: message.slice(0, 200), proposed: reply.proposal?.changes.length ?? 0, problem });
    return json(problem ? { text: `${reply.text}\n\n（这个改法有问题，没法生效：${problem}。请换个说法再试。）`, proposal: null } : reply);
  } catch (error) {
    return failed(error);
  }
}
