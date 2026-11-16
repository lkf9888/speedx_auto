/**
 * Which way the next message to a customer's phone would go. Pure and free of
 * server code, so the workbench page and the server agree on it.
 */
import type { Conversation, MessageChannel } from "@/lib/workbench/conversation-types";

/** WhatsApp allows free-form replies for 24 hours after the customer's last message. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ChannelsReady {
  whatsapp: boolean;
  /** An approved template exists, so a conversation can be started. */
  whatsappTemplate: boolean;
  sms: boolean;
}

/** How the next message to this customer would go, in words for the send box. */
export function plannedChannel(c: Conversation, ready: ChannelsReady, now = Date.now()): { channel: MessageChannel | null; note: string } {
  const m = c.messaging;
  if (m?.optedOut) return { channel: null, note: "客人回复过退订，不能再发消息。" };
  const open = m?.lastWhatsAppInboundAt !== undefined && now - m.lastWhatsAppInboundAt < WINDOW_MS;
  if (ready.whatsapp && !m?.smsOnly) {
    if (open) return { channel: "whatsapp", note: "WhatsApp：客人 24 小时内回复过，可以直接聊。" };
    if (ready.whatsappTemplate) return { channel: "whatsapp", note: "WhatsApp：先发一条模板消息，客人回复后就能自由聊天。没有 WhatsApp 的号码会自动改发短信。" };
  }
  if (ready.sms) return { channel: "sms", note: m?.smsOnly ? "这个号码用不了 WhatsApp，发短信。" : "发短信（WhatsApp 还没设置好或超过 24 小时窗口）。" };
  return { channel: null, note: "WhatsApp 和短信都还没设置好，暂时发不了。" };
}

