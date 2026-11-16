/**
 * /api/workbench/conversations/[id]/followup — follow-up offers for a website
 * customer (staff only):
 * - draft: the AI suggests an offer and writes the email paragraph and the text message;
 * - preview: the email exactly as it will be sent;
 * - send: emails it from the repair mailbox, registers the customer-only discount
 *   for the website assistant, and records it on the conversation;
 * - log: records a text message or call staff made themselves (and registers the discount).
 * The AI sees the chat and the estimates, never the customer's phone or email.
 */
import Anthropic from "@anthropic-ai/sdk";
import { fallbackOptions, type MessagesClient } from "@/lib/repair-chat/agent";
import { shopNow } from "@/lib/repair-chat/booking";
import { getHouseRulesStore, type HouseRulesStore } from "./house-rules-store";
import type { HouseRuleChange } from "@/lib/repair-chat/house-rules";
import { summarizeEstimateForModel, type EstimateCard } from "@/lib/repair-chat/pricing";
import { matchScript } from "@/lib/repair-chat/script";
import { BASE_URL } from "@/lib/site-routes";
import { staffUser, type StaffUser } from "./access";
import { WORKBENCH_MODEL } from "./assistant";
import type { Conversation } from "./conversation-types";
import { ConversationError, getConversationStore, type ConversationStore } from "./conversations";
import { defaultOffer, firstName, offerSummary, renderFollowUpEmail, type FollowUpLocale, type FollowUpOffer, type FollowUpRecord } from "./followup";
import { followUpMailer, getFollowUpStore, type FollowUpMailer, type FollowUpStore } from "./followup-store";

export interface FollowUpDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  conversations: () => ConversationStore | null;
  store: () => FollowUpStore | null;
  rules: () => HouseRulesStore | null;
  mailer: () => FollowUpMailer | null;
  client: () => MessagesClient | null;
  log: (entry: Record<string, unknown>) => void;
  now?: () => Date;
}

let anthropic: MessagesClient | null = null;

const defaultDeps: FollowUpDeps = {
  user: (request) => staffUser(request.headers),
  conversations: () => getConversationStore(),
  store: () => getFollowUpStore(),
  rules: () => getHouseRulesStore(),
  mailer: () => followUpMailer(),
  client: () => (process.env.ANTHROPIC_API_KEY ? (anthropic ??= new Anthropic()) : null),
  log: (entry) => console.info("workbench followup", JSON.stringify(entry)),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const fail = (message: string, status = 400, error = "invalid") => json({ error, message }, status);

/** CASL: an inquiry gives implied consent for six months. */
const CONSENT_MS = 182 * 24 * 60 * 60 * 1000;
/** A second email to the same customer within this long is refused (a double click, a retry after an error). */
const RESEND_MS = 10 * 60 * 1000;
/** One plain address, as the website form should have taken it. */
const SINGLE_EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[A-Za-z]{2,}$/;

/** When the customer last asked something on the website. */
function lastInquiry(c: Conversation): number {
  return c.turns.filter((t) => t.role === "user").reduce((latest, t) => Math.max(latest, t.at ?? 0), c.createdAt);
}

const locale = (c: Conversation): FollowUpLocale => (c.website?.locale === "zh-CN" || c.website?.locale === "zh-TW" ? c.website.locale : "en");
const toTraditional = (text: string) => matchScript(text, "Traditional Chinese");

/** The website estimate cards in the chat, newest first (no team quotes: they have no price). */
export function offerableEstimates(c: Conversation): EstimateCard[] {
  return c.turns
    .flatMap((t) => t.estimates ?? [])
    .filter((e) => e.kind !== "team_quote" && e.totalHigh > 0)
    .reverse();
}

/** Staff's offer, checked: a known estimate, a sensible discount and date, short texts. */
export function readOffer(raw: unknown, c: Conversation, today: string): FollowUpOffer | string {
  const o = (raw ?? {}) as Record<string, unknown>;
  const card = offerableEstimates(c).find((e) => e.id === o.estimateId);
  if (!card) return "请选一个网站报价";
  const kind = o.kind === "percent" ? "percent" : "amount";
  const value = Math.round(Number(o.value) * 100) / 100;
  if (!(value > 0) || (kind === "percent" ? value > 50 : value > 500)) return kind === "percent" ? "折扣要在 1%–50% 之间" : "优惠金额要在 $1–$500 之间";
  const expiresOn = typeof o.expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.expiresOn) ? o.expiresOn : "";
  if (!expiresOn || expiresOn < today) return "有效期要是今天或以后的日期";
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "");
  const subject = text(o.subject, 140).replace(/[\r\n]+/g, " ");
  const message = text(o.message, 1200);
  const sms = text(o.sms, 480);
  if (!subject || !message) return "邮件主题和内容不能为空";
  return { estimateId: card.id, kind, value, expiresOn, subject, message, sms };
}

const DRAFT_TOOL: Anthropic.Beta.BetaTool = {
  name: "draft_offer",
  description: "Draft a follow-up offer for this website customer.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      estimate_id: { type: "string", description: "The estimate card the offer is for (usually the main job they asked about)." },
      discount_kind: { type: "string", enum: ["amount", "percent"] },
      discount_value: { type: "number", description: "Dollars off (10–60 typical) or percent off (5–15 typical)." },
      valid_days: { type: "integer", description: "How many days the offer lasts, 7–21." },
      subject: { type: "string", description: "Email subject in the customer's language, mentioning the vehicle and the offer, no emoji." },
      message: { type: "string", description: "One warm paragraph in the customer's language (2–4 sentences): what they asked about, the offer, why not to wait if relevant (e.g. worn brakes damage rotors), how to book. No prices except the discount itself; the quote table shows them." },
      sms: { type: "string", description: "A text message under 300 characters in the customer's language: shop name, job, offer, valid-until date, call or reply to book." },
    },
    required: ["estimate_id", "discount_kind", "discount_value", "valid_days", "subject", "message", "sms"],
    additionalProperties: false,
  },
};

const DRAFT_SYSTEM = `You write follow-up offers for SPEEDX AUTO, an auto repair shop in Richmond, BC, to customers who asked for a quote on the shop's website but haven't booked. Staff review and edit everything before it goes out. Use the customer's language (English, Simplified Chinese or Traditional Chinese, given below). Be warm, brief and honest: no pressure tactics, no invented facts, no promises beyond the offer (no free inspection, warranty or same-day guarantee). Pick a discount that's meaningful but modest: about 5–10% of the estimate, rounded to a friendly number. Address the customer by the first name given (or no name). Never mention cost prices, the hourly labor rate, or where parts come from.`;

/** The AI's suggestion, falling back to a fixed draft when the AI isn't available. */
async function draft(c: Conversation, client: MessagesClient | null, today: string): Promise<FollowUpOffer> {
  const cards = offerableEstimates(c);
  const lang = locale(c);
  const fallback = defaultOffer(cards[0], lang, c.website?.name ?? "", today);
  if (!client) return fallback;
  const chat = c.turns
    .filter((t) => !t.localOnly && t.text)
    .slice(-20)
    .map((t) => `${t.role === "user" ? "Customer" : "Assistant"}: ${t.text.slice(0, 600)}`)
    .join("\n");
  const response = await client.beta.messages.create({
    model: WORKBENCH_MODEL,
    max_tokens: 1500,
    system: [{ type: "text", text: DRAFT_SYSTEM }],
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: DRAFT_TOOL.name },
    messages: [
      {
        role: "user",
        content: [
          `Customer's language: ${lang === "en" ? "English" : lang === "zh-TW" ? "Traditional Chinese" : "Simplified Chinese"}. First name: ${firstName(c.website?.name ?? "") || "(none)"}. Today: ${today}.`,
          "Estimate cards they were shown:",
          ...cards.map((card) => `[${card.id}] ${summarizeEstimateForModel(card)}`),
          "The chat:",
          chat,
        ].join("\n"),
      },
    ],
    ...fallbackOptions(WORKBENCH_MODEL),
  });
  const use = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
  if (!use) return fallback;
  const i = use.input as { estimate_id: string; discount_kind: "amount" | "percent"; discount_value: number; valid_days: number; subject: string; message: string; sms: string };
  const days = Math.min(21, Math.max(7, Math.round(i.valid_days || 14)));
  const card = cards.find((e) => e.id === i.estimate_id) ?? cards[0];
  const offer = readOffer(
    {
      estimateId: card.id,
      kind: i.discount_kind,
      value: i.discount_value,
      expiresOn: new Date(Date.parse(`${today}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10),
      subject: i.subject,
      message: i.message,
      sms: i.sms,
    },
    c,
    today,
  );
  return typeof offer === "string" ? fallback : offer;
}

/** The customer-only discount the website assistant applies when they come back (matched by phone). */
function discountRule(c: Conversation, card: EstimateCard, offer: FollowUpOffer): HouseRuleChange | null {
  const phone = c.website?.phone ?? "";
  if (phone.replace(/\D/g, "").length < 10) return null;
  const target =
    card.kind === "flat" && card.flatService
      ? { appliesTo: card.flatService === "inspection" || card.flatService === "tire_repair" ? ("all" as const) : card.flatService, serviceKeyword: "" }
      : card.kind === "tires"
        ? { appliesTo: "new_tires" as const, serviceKeyword: "" }
        : { appliesTo: "labor_jobs" as const, serviceKeyword: card.service.replace(/\s*\b(R&R|Replace|Replacement)\b.*$/i, "").trim().slice(0, 40) || card.service.slice(0, 40) };
  return {
    action: "add",
    rule: {
      kind: "discount",
      title: `回访优惠 · ${firstName(c.website?.name ?? "") || "网站客人"}`.slice(0, 60),
      text: `Follow-up offer for quote ${card.id}`,
      ...target,
      percent: offer.kind === "percent" ? offer.value : 0,
      amount: offer.kind === "amount" ? offer.value : 0,
      on: "total",
      labelEn: "Your follow-up offer",
      labelZh: "回访专属优惠",
      startDate: "",
      endDate: offer.expiresOn,
      customerPhone: phone,
    },
  };
}

async function registerDiscount(deps: FollowUpDeps, c: Conversation, card: EstimateCard, offer: FollowUpOffer, email: string): Promise<string | undefined> {
  const change = discountRule(c, card, offer);
  const rules = deps.rules();
  if (!change || !rules) return undefined;
  // Same offer already registered from an earlier email or text: don't add it twice.
  const already = (c.followUps ?? []).find((f) => f.ruleId && f.offer === offerSummary(offer) && f.estimateId === card.id);
  if (already) return already.ruleId;
  try {
    const before = new Set((await rules.list(true)).map((r) => r.id));
    const after = await rules.apply([change], email);
    return after.find((r) => !before.has(r.id))?.id;
  } catch (error) {
    deps.log({ action: "discount_failed", message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
    return undefined;
  }
}

/** What went wrong sending, in words staff can act on. */
function mailError(error: unknown): string {
  const e = error as { code?: string; responseCode?: number; message?: string };
  console.error("followup email failed", e?.code ?? "", e?.responseCode ?? "", (e?.message ?? "").slice(0, 200));
  if (e?.code === "EAUTH" || e?.responseCode === 535) return "回访邮箱登录失败：Railway 里的应用专用密码不对或已失效";
  if (e?.responseCode === 550 && /5\.4\.5|limit/i.test(e?.message ?? "")) return "Gmail 今天发信已到上限，明天再发";
  if (e?.responseCode && e.responseCode >= 500) return "对方邮箱拒收了这封邮件（地址可能不存在）";
  return "邮件没发出去（连不上 Gmail），请稍后再试";
}

export async function handleFollowUp(request: Request, id: string, deps: FollowUpDeps = defaultDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const conversations = deps.conversations();
  if (!conversations) return fail("服务器没有设置 Cloudflare KV", 503, "not_configured");
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const today = shopNow((deps.now ?? (() => new Date()))()).date;
  try {
    const c = await conversations.get(id);
    if (!c?.website) return fail("只能给网站来的客人做回访", 404, "not_found");
    if (offerableEstimates(c).length === 0) return fail("这位客人没有拿到过有价格的报价，没法做优惠");
    const action = body.action;

    const nowMs = (deps.now ?? (() => new Date()))().getTime();
    const consentEnded = nowMs - lastInquiry(c) > CONSENT_MS;

    if (action === "draft") {
      const offer = await draft(c, deps.client(), today).catch(() => defaultOffer(offerableEstimates(c)[0], locale(c), c.website?.name ?? "", today));
      return json({ offer, estimates: offerableEstimates(c), canEmail: Boolean(c.website.email && deps.mailer()), mailerReady: Boolean(deps.mailer()), consentEnded });
    }

    const offer = readOffer(body.offer, c, today);
    if (typeof offer === "string") return fail(offer);
    const card = offerableEstimates(c).find((e) => e.id === offer.estimateId)!;

    if (action === "preview") {
      const mail = renderFollowUpEmail({ locale: locale(c), customerName: c.website.name, card, offer, unsubscribeUrl: `${BASE_URL}/unsubscribe/preview`, toTraditional });
      return json({ subject: mail.subject, html: mail.html });
    }

    if (action === "send") {
      const to = c.website.email?.trim();
      if (!to) return fail("这位客人没有留邮箱");
      if (!SINGLE_EMAIL.test(to)) return fail("客人留的邮箱格式不对，没法发");
      if (consentEnded) return fail("客人咨询已经超过 6 个月，按加拿大反垃圾邮件法不能再发推广邮件", 409, "consent_ended");
      const recent = (c.followUps ?? []).find((f) => f.channel === "email" && nowMs - f.at < RESEND_MS);
      if (recent) return fail("10 分钟内刚给这位客人发过邮件，先别重复发", 409, "recent");
      const mailer = deps.mailer();
      if (!mailer) return fail("回访邮箱还没设置好：请在 Railway 填 FOLLOWUP_SMTP_USER 和 FOLLOWUP_SMTP_PASS", 503, "not_configured");
      const store = deps.store();
      if (!store) return fail("服务器没有设置 Cloudflare KV", 503, "not_configured");
      if (await store.isOptedOut(to)) return fail("这位客人已经退订回访邮件，不能再发", 409, "opted_out");
      const token = await store.unsubscribeToken(to);
      const unsubscribeUrl = `${BASE_URL}/unsubscribe/${token}`;
      const mail = renderFollowUpEmail({ locale: locale(c), customerName: c.website.name, card, offer, unsubscribeUrl, toTraditional });
      try {
        await mailer({ to, subject: mail.subject, html: mail.html, text: mail.text, oneClickUrl: `${BASE_URL}/api/followup/unsubscribe?token=${token}` });
      } catch (error) {
        return fail(mailError(error), 502, "send_failed");
      }
      // The email is out: nothing below may report "failed" and tempt staff to send it again.
      const ruleId = await registerDiscount(deps, c, card, offer, user.email);
      const record: FollowUpRecord = { at: Date.now(), by: user.email, channel: "email", offer: offerSummary(offer), subject: mail.subject, estimateId: card.id, ...(ruleId ? { ruleId } : {}) };
      const saved = await conversations.addFollowUp(id, user.email, record).catch((error: unknown) => {
        deps.log({ action: "record_failed", id, message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
        return null;
      });
      deps.log({ action: "email", email: user.email, id, offer: record.offer, discount: Boolean(ruleId) });
      return json({ conversation: saved ?? c, record, ...(saved ? {} : { warning: "邮件已发出，但回访记录没存上" }) });
    }

    if (action === "log") {
      const channel = body.channel === "call" ? "call" : "sms";
      const ruleId = await registerDiscount(deps, c, card, offer, user.email);
      const record: FollowUpRecord = { at: Date.now(), by: user.email, channel, offer: offerSummary(offer), estimateId: card.id, ...(ruleId ? { ruleId } : {}) };
      const saved = await conversations.addFollowUp(id, user.email, record);
      deps.log({ action: channel, email: user.email, id, offer: record.offer, discount: Boolean(ruleId) });
      return json({ conversation: saved, record });
    }
    return fail("不认识的操作");
  } catch (error) {
    if (error instanceof ConversationError) return json({ error: error.kind }, error.kind === "not_found" ? 404 : 400);
    console.error("workbench followup failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return fail("暂时用不了（云端存储连不上），请稍后再试", 502, "upstream");
  }
}
