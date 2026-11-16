/**
 * Messages between staff and a website customer's phone (2026-11-16, phase 1):
 * staff write in the workbench and confirm each send; it goes by WhatsApp when
 * the number is on it, by SMS when it isn't (or WhatsApp isn't set up). The
 * customer's replies land in the same workbench conversation. The AI never
 * writes to a customer's phone on its own.
 */
import { randomBytes } from "node:crypto";
import { ASSISTANT, WEBSITE_CUSTOMER, type Conversation, type Delivery, type MessageChannel, type Turn } from "@/lib/workbench/conversation-types";
import { newTurnId, type ConversationStore } from "@/lib/workbench/conversations";
import { NO_NAME } from "@/lib/repair-chat/lead";
import { isStopWord, samePhone, toE164 } from "./phone";
import { plannedChannel, WINDOW_MS, type ChannelsReady } from "./plan";
import { sendSms, smsConfig, type SmsConfig } from "./sms";
import { NOT_ON_WHATSAPP, parseWebhook, sendWhatsAppTemplate, sendWhatsAppText, whatsappConfig, type InboundMessage, type SendResult, type StatusReport, type WhatsAppConfig } from "./whatsapp";

export { WINDOW_MS } from "./plan";
/** UTF-16 units, so what staff typed is exactly what goes out (the SMS opt-out line is added after). */
export const MAX_MESSAGE = 1000;
/** WhatsApp template variables take at most this much; longer messages need the customer to write first. */
export const MAX_TEMPLATE_MESSAGE = 900;

export interface MessagingDeps {
  store: ConversationStore;
  whatsapp?: WhatsAppConfig | null;
  sms?: SmsConfig | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class MessagingError extends Error {
  constructor(
    readonly kind: "no_phone" | "bad_phone" | "opted_out" | "not_configured" | "window_closed" | "empty" | "too_long" | "template_too_long" | "not_found" | "failed",
    message: string,
  ) {
    super(message);
  }
}

const ERROR_TEXT: Record<MessagingError["kind"], string> = {
  no_phone: "这位客人没有留电话。",
  bad_phone: "电话号码格式不对，没法发。",
  opted_out: "客人回复过退订，不能再给他发消息。",
  not_configured: "WhatsApp 和短信都还没设置好。",
  window_closed: "客人超过 24 小时没回复，WhatsApp 只能发模板消息，而模板还没设置好；短信也没设置。",
  empty: "消息是空的。",
  too_long: `消息太长（最多 ${MAX_MESSAGE} 字）。`,
  template_too_long: `客人 24 小时内没回复过，第一条消息最多 ${MAX_TEMPLATE_MESSAGE} 字，请缩短（客人回复后可以发长的）。`,
  not_found: "找不到这个会话。",
  failed: "发送失败。",
};

const fail = (kind: MessagingError["kind"], detail = "") => new MessagingError(kind, detail ? `${ERROR_TEXT[kind]}${detail}` : ERROR_TEXT[kind]);

/** Which channels are ready, for the workbench's send box. */
export function channelsReady(deps: Pick<MessagingDeps, "whatsapp" | "sms">): ChannelsReady {
  const whatsapp = deps.whatsapp === undefined ? whatsappConfig() : deps.whatsapp;
  const sms = deps.sms === undefined ? smsConfig() : deps.sms;
  return { whatsapp: Boolean(whatsapp), whatsappTemplate: Boolean(whatsapp?.templateName), sms: Boolean(sms) };
}

function firstName(c: Conversation): string {
  const name = c.website?.name ?? "";
  return !name || name.startsWith(NO_NAME) ? "" : (name.trim().split(/\s+/)[0] ?? "");
}

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Staff confirm a message: sent by WhatsApp or SMS, and recorded in the conversation.
 * The message is written down (as "sending") before the provider is asked, and
 * `requestId` names it: asking again with the same id after a failed reply returns
 * the same message instead of sending it a second time.
 */
export async function sendToCustomer(deps: MessagingDeps, conversationId: string, staffEmail: string, rawText: string, requestId?: string): Promise<Turn> {
  const now = deps.now ?? Date.now;
  const text = rawText.trim();
  if (!text) throw fail("empty");
  if (text.length > MAX_MESSAGE) throw fail("too_long");
  const c = await deps.store.get(conversationId);
  if (!c) throw fail("not_found");
  const turnId = requestId && SAFE_ID.test(requestId) ? `m-${requestId}` : `m-${randomBytes(12).toString("hex")}`;
  const earlier = c.turns.find((t) => t.id === turnId);
  if (earlier) return earlier;
  if (!c.website?.phone) throw fail("no_phone");
  const phone = toE164(c.website.phone);
  if (!phone) throw fail("bad_phone");
  if (c.messaging?.optedOut || (await deps.store.isOptedOut(phone))) throw fail("opted_out");

  const whatsapp = deps.whatsapp === undefined ? whatsappConfig() : deps.whatsapp;
  const sms = deps.sms === undefined ? smsConfig() : deps.sms;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const plan = plannedChannel(c, channelsReady({ whatsapp, sms }), now());
  if (!plan.channel) throw fail(whatsapp || sms ? "window_closed" : "not_configured");
  const open = c.messaging?.lastWhatsAppInboundAt !== undefined && now() - c.messaging.lastWhatsAppInboundAt < WINDOW_MS;
  if (plan.channel === "whatsapp" && !open && text.length > MAX_TEMPLATE_MESSAGE) throw fail("template_too_long");

  // Written down first: a retry after a lost reply finds this turn and does not send again.
  const turn: Turn = { id: turnId, role: "user", text, author: staffEmail, at: now(), quotes: [], source: "website", channel: plan.channel, delivery: { status: "sending" } };
  await deps.store.change(conversationId, staffEmail, (conv) => {
    if (conv.turns.some((t) => t.id === turnId)) return;
    conv.turns.push(turn);
    delete conv.archived;
  });

  let channel: MessageChannel = plan.channel;
  let result: SendResult;
  let resentAsSms = false;
  if (channel === "whatsapp" && whatsapp) {
    result = open ? await sendWhatsAppText(whatsapp, phone, text, fetchImpl) : await sendWhatsAppTemplate(whatsapp, phone, firstName(c), text, fetchImpl);
    // Meta can say right away that the number isn't on WhatsApp: SMS instead.
    if (!result.ok && result.code !== null && NOT_ON_WHATSAPP.has(result.code) && sms) {
      channel = "sms";
      resentAsSms = true;
      result = await sendSms(sms, phone, text, fetchImpl);
    }
  } else {
    result = sms ? await sendSms(sms, phone, text, fetchImpl) : { ok: false, code: null, reason: "SMS not set up" };
  }

  const delivery: Delivery = result.ok ? { status: "sent", id: result.id, ...(resentAsSms ? { resentAsSms: true } : {}) } : { status: "failed", error: result.reason };
  const saved = await deps.store.change(conversationId, staffEmail, (conv) => {
    const t = conv.turns.find((x) => x.id === turnId);
    if (!t) return;
    t.channel = channel;
    t.delivery = delivery;
    if (resentAsSms) conv.messaging = { ...conv.messaging, smsOnly: true };
  });
  if (!result.ok) throw fail("failed", `（${result.reason}）`);
  return saved.turns.find((t) => t.id === turnId) ?? { ...turn, channel, delivery };
}

// Providers sometimes deliver the same message twice at once: one at a time per provider id.
const inflight = new Map<string, Promise<void>>();

/** A customer's message arrived on WhatsApp or SMS: it goes into their conversation (a new one when they're new). */
export function receiveFromCustomer(deps: MessagingDeps, channel: MessageChannel, message: Pick<InboundMessage, "id" | "from" | "at" | "text">): Promise<void> {
  const key = `${channel}:${message.id}`;
  const running = inflight.get(key);
  if (running) return running;
  const work = receive(deps, channel, message).finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

async function receive(deps: MessagingDeps, channel: MessageChannel, message: Pick<InboundMessage, "id" | "from" | "at" | "text">): Promise<void> {
  const now = deps.now ?? Date.now;
  if (await deps.store.findByMessageId(message.id)) return; // the provider sent it twice
  const existing = await deps.store.findByPhone((p) => samePhone(p, message.from));
  // A conversation made for a new number gets an unguessable id, so nobody can steer a website visit onto it.
  const id = existing?.id ?? `wa${randomBytes(15).toString("hex")}`;
  const stop = isStopWord(message.text);
  if (stop) await deps.store.setOptedOut(message.from);
  const at = message.at || now();
  const turn: Turn = {
    id: newTurnId(),
    role: "user",
    text: message.text,
    author: WEBSITE_CUSTOMER,
    at,
    quotes: [],
    source: "website",
    channel,
    delivery: { status: "delivered", id: message.id },
  };
  await deps.store.change(
    id,
    WEBSITE_CUSTOMER,
    (conv) => {
      if (conv.turns.some((t) => t.delivery?.id === message.id)) return;
      conv.turns.push(turn);
      if (!conv.website) conv.website = { name: NO_NAME, phone: message.from, locale: "en", consentAt: now() };
      if (!conv.title) conv.title = message.text.replace(/\s+/g, " ").trim().slice(0, 60);
      conv.messaging = {
        ...conv.messaging,
        // A late message must not close a window a newer one opened.
        ...(channel === "whatsapp" ? { lastWhatsAppInboundAt: Math.max(at, conv.messaging?.lastWhatsAppInboundAt ?? 0), whatsappWorks: true } : {}),
        ...(stop ? { optedOut: true } : {}),
      };
      delete conv.archived;
    },
    true,
  );
}

const RANK = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 4 } as const;

/** Delivery reports for messages staff sent; a WhatsApp one that couldn't be delivered goes out again as an SMS, once. */
export async function applyStatus(deps: MessagingDeps, report: Pick<StatusReport, "id" | "status" | "code" | "reason">): Promise<void> {
  const c = await deps.store.findByMessageId(report.id);
  if (!c) return;
  const sms = deps.sms === undefined ? smsConfig() : deps.sms;
  const phone = c.website?.phone ? toE164(c.website.phone) : null;
  const optedOut = Boolean(c.messaging?.optedOut) || (phone ? await deps.store.isOptedOut(phone) : false);
  let claimed: string | null = null;
  await deps.store.change(c.id, ASSISTANT, (conv) => {
    const t = conv.turns.find((x) => x.delivery?.id === report.id);
    if (!t?.delivery) return;
    if (report.status === "failed") {
      const error = report.reason || (report.code ? `code ${report.code}` : "failed");
      // The claim and the mark are one write: two reports of the same failure can't both start an SMS.
      const resend = t.channel === "whatsapp" && !t.delivery.resentAsSms && Boolean(sms) && Boolean(phone) && !optedOut;
      t.delivery = { status: "failed", id: t.delivery.id, error, ...(t.delivery.resentAsSms || resend ? { resentAsSms: true } : {}) };
      if (resend) claimed = t.text;
      if (resend || (report.code !== null && NOT_ON_WHATSAPP.has(report.code))) conv.messaging = { ...conv.messaging, smsOnly: true };
    } else if (RANK[report.status] > RANK[t.delivery.status]) {
      t.delivery = { ...t.delivery, status: report.status };
      if (report.status === "delivered" || report.status === "read") conv.messaging = { ...conv.messaging, whatsappWorks: true };
    }
  });
  if (claimed === null || !sms || !phone) return;
  const resent = await sendSms(sms, phone, claimed, deps.fetchImpl ?? fetch);
  if (!resent.ok) {
    // The SMS didn't go either: say so, and let the report be retried.
    await deps.store.change(c.id, ASSISTANT, (conv) => {
      const t = conv.turns.find((x) => x.delivery?.id === report.id);
      if (t?.delivery) t.delivery = { status: "failed", id: t.delivery.id, error: `${t.delivery.error ?? "failed"}；短信也没发出去` };
    });
  }
}

/** What a webhook POST from Meta contains, applied: customers' messages and delivery reports. */
export async function handleWhatsAppEvents(deps: MessagingDeps, body: unknown): Promise<number> {
  let handled = 0;
  for (const item of parseWebhook(body)) {
    if (item.kind === "message") await receiveFromCustomer(deps, "whatsapp", item);
    else await applyStatus(deps, item);
    handled += 1;
  }
  return handled;
}
