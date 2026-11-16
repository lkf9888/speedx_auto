/**
 * Messages between staff and a website customer's phone (2026-11-16, phase 1):
 * staff write in the workbench and confirm each send; it goes by WhatsApp when
 * the number is on it, by SMS when it isn't (or WhatsApp isn't set up). The
 * customer's replies land in the same workbench conversation. The AI never
 * writes to a customer's phone on its own.
 */
import { ASSISTANT, WEBSITE_CUSTOMER, type Conversation, type Delivery, type MessageChannel, type Turn } from "@/lib/workbench/conversation-types";
import { newTurnId, type ConversationStore } from "@/lib/workbench/conversations";
import { NO_NAME } from "@/lib/repair-chat/lead";
import { isStopWord, samePhone, toE164 } from "./phone";
import { plannedChannel, WINDOW_MS, type ChannelsReady } from "./plan";
import { sendSms, smsConfig, type SmsConfig } from "./sms";
import { NOT_ON_WHATSAPP, parseWebhook, sendWhatsAppTemplate, sendWhatsAppText, whatsappConfig, type InboundMessage, type SendResult, type StatusReport, type WhatsAppConfig } from "./whatsapp";

export { WINDOW_MS } from "./plan";
export const MAX_MESSAGE = 1000;

export interface MessagingDeps {
  store: ConversationStore;
  whatsapp?: WhatsAppConfig | null;
  sms?: SmsConfig | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class MessagingError extends Error {
  constructor(
    readonly kind: "no_phone" | "bad_phone" | "opted_out" | "not_configured" | "window_closed" | "empty" | "too_long" | "not_found" | "failed",
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

/** Staff confirm a message: sent by WhatsApp or SMS, and recorded in the conversation. */
export async function sendToCustomer(deps: MessagingDeps, conversationId: string, staffEmail: string, rawText: string): Promise<Turn> {
  const now = deps.now ?? Date.now;
  const text = rawText.trim();
  if (!text) throw fail("empty");
  if ([...text].length > MAX_MESSAGE) throw fail("too_long");
  const c = await deps.store.get(conversationId);
  if (!c) throw fail("not_found");
  if (!c.website?.phone) throw fail("no_phone");
  const phone = toE164(c.website.phone);
  if (!phone) throw fail("bad_phone");
  if (c.messaging?.optedOut) throw fail("opted_out");

  const whatsapp = deps.whatsapp === undefined ? whatsappConfig() : deps.whatsapp;
  const sms = deps.sms === undefined ? smsConfig() : deps.sms;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const plan = plannedChannel(c, channelsReady({ whatsapp, sms }), now());
  if (!plan.channel) throw fail(whatsapp || sms ? "window_closed" : "not_configured");

  let channel: MessageChannel = plan.channel;
  let result: SendResult;
  let resentAsSms = false;
  if (channel === "whatsapp" && whatsapp) {
    const open = c.messaging?.lastWhatsAppInboundAt !== undefined && now() - c.messaging.lastWhatsAppInboundAt < WINDOW_MS;
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
  const turn: Turn = { id: newTurnId(), role: "user", text, author: staffEmail, at: now(), quotes: [], source: "website", channel, delivery };
  await deps.store.change(conversationId, staffEmail, (conv) => {
    conv.turns.push(turn);
    if (resentAsSms) conv.messaging = { ...conv.messaging, smsOnly: true };
    delete conv.archived;
  });
  if (!result.ok) throw fail("failed", `（${result.reason}）`);
  return turn;
}

/** A customer's message arrived on WhatsApp or SMS: it goes into their conversation (a new one when they're new). */
export async function receiveFromCustomer(deps: MessagingDeps, channel: MessageChannel, message: Pick<InboundMessage, "id" | "from" | "at" | "text">): Promise<void> {
  const now = deps.now ?? Date.now;
  const existing = await deps.store.findByPhone((p) => samePhone(p, message.from));
  if (existing?.turns.some((t) => t.delivery?.id === message.id)) return; // the provider sent it twice
  const id = existing?.id ?? `cw${message.from.replace(/\D/g, "").padEnd(32, "0").slice(0, 32)}`;
  const stop = isStopWord(message.text);
  const turn: Turn = {
    id: newTurnId(),
    role: "user",
    text: message.text,
    author: WEBSITE_CUSTOMER,
    at: message.at || now(),
    quotes: [],
    source: "website",
    channel,
    delivery: { status: "delivered", id: message.id },
  };
  await deps.store.change(
    id,
    WEBSITE_CUSTOMER,
    (conv) => {
      conv.turns.push(turn);
      if (!conv.website) conv.website = { name: NO_NAME, phone: message.from, locale: "en", consentAt: now() };
      if (!conv.title) conv.title = message.text.replace(/\s+/g, " ").trim().slice(0, 60);
      conv.messaging = {
        ...conv.messaging,
        ...(channel === "whatsapp" ? { lastWhatsAppInboundAt: message.at || now(), whatsappWorks: true } : {}),
        ...(stop ? { optedOut: true } : {}),
      };
      delete conv.archived;
    },
    true,
  );
}

/** Delivery reports for messages staff sent; a WhatsApp one that couldn't be delivered goes out again as an SMS. */
export async function applyStatus(deps: MessagingDeps, report: Pick<StatusReport, "id" | "status" | "code" | "reason">): Promise<void> {
  const c = await deps.store.findByMessageId(report.id);
  if (!c) return;
  const turn = c.turns.find((t) => t.delivery?.id === report.id);
  if (!turn || !turn.delivery) return;
  // Reports can arrive out of order: never step back from delivered/read to sent.
  const rank = { sent: 1, delivered: 2, read: 3, failed: 4 } as const;
  if (report.status !== "failed" && rank[report.status] <= rank[turn.delivery.status]) return;
  const sms = deps.sms === undefined ? smsConfig() : deps.sms;
  const phone = c.website?.phone ? toE164(c.website.phone) : null;
  const resend = report.status === "failed" && turn.channel === "whatsapp" && !turn.delivery.resentAsSms && sms && phone && !c.messaging?.optedOut;
  let resent: SendResult | null = null;
  if (resend) resent = await sendSms(sms, phone, turn.text, deps.fetchImpl ?? fetch);
  await deps.store.change(c.id, ASSISTANT, (conv) => {
    const t = conv.turns.find((x) => x.delivery?.id === report.id);
    if (!t?.delivery) return;
    if (report.status === "failed") {
      t.delivery = { status: "failed", id: t.delivery.id, error: report.reason || (report.code ? `code ${report.code}` : "failed"), ...(resent?.ok ? { resentAsSms: true } : {}) };
      if (resent?.ok) conv.messaging = { ...conv.messaging, smsOnly: true };
      else if (report.code !== null && NOT_ON_WHATSAPP.has(report.code)) conv.messaging = { ...conv.messaging, smsOnly: true };
    } else {
      t.delivery = { ...t.delivery, status: report.status };
      if (report.status === "delivered" || report.status === "read") conv.messaging = { ...conv.messaging, whatsappWorks: true };
    }
  });
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
