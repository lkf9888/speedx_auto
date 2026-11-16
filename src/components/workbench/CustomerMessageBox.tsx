"use client";

import { useState } from "react";
import { plannedChannel, type ChannelsReady } from "@/lib/messaging/plan";
import type { Conversation, Delivery, MessageChannel, Turn } from "@/lib/workbench/conversation-types";

export const CHANNEL_NAME: Record<MessageChannel, string> = { whatsapp: "WhatsApp", sms: "短信" };

const DELIVERY_TEXT: Record<Delivery["status"], string> = { sending: "发送中", sent: "已发出", delivered: "已送达", read: "客人已读", failed: "没发出去" };

/** "WhatsApp · 已送达" under a message that went to or came from the customer's phone. */
export function ChannelBadge({ turn }: { turn: Pick<Turn, "channel" | "delivery" | "author"> }) {
  if (!turn.channel) return null;
  const outgoing = turn.author !== "website";
  const d = turn.delivery;
  return (
    <p data-testid="channel-badge" className={`mt-0.5 text-[11px] ${d?.status === "failed" ? "font-semibold text-red-700" : "text-[color:var(--wb-muted)]"}`}>
      {outgoing ? "发给客人" : "客人回复"} · {CHANNEL_NAME[turn.channel]}
      {outgoing && d ? ` · ${DELIVERY_TEXT[d.status]}${d.status === "failed" && d.error ? `（${d.error}）` : ""}${d.resentAsSms ? " · 已改发短信" : ""}` : ""}
    </p>
  );
}

/**
 * Staff write to the customer's phone: WhatsApp when the number is on it,
 * SMS when it isn't. Each press of the button sends exactly one message; the
 * AI never writes here.
 */
export function CustomerMessageBox({
  conversation,
  ready,
  onSent,
}: {
  conversation: Conversation;
  ready: ChannelsReady | null;
  onSent: (turn: Turn) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One id per message being written: pressing the button again after a failed reply can't send it twice.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const plan = ready ? plannedChannel(conversation, ready) : null;
  const blocked = !ready || !plan?.channel;

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/workbench/conversations/${encodeURIComponent(conversation.id)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body, requestId }),
      });
      const data = (await response.json().catch(() => null)) as { turn?: Turn; message?: string } | null;
      if (response.ok && data?.turn) {
        onSent(data.turn);
        setText("");
        setRequestId(crypto.randomUUID());
      } else {
        setError(data?.message ?? "发送失败，请再试一次。");
      }
    } catch {
      setError("网络出错，没发出去。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="customer-message-box" className="border-t border-[color:var(--wb-line)] bg-white/70 px-3 py-2">
      <p className="text-xs font-semibold text-[color:var(--wb-icon)]">直接发给客人（{conversation.website?.name && !conversation.website.name.startsWith("未留姓名") ? conversation.website.name : "客人"}的手机）</p>
      <p data-testid="channel-plan" className="text-[11px] text-[color:var(--wb-muted)]">
        {plan ? plan.note : "正在查 WhatsApp 和短信有没有设置好…"}
      </p>
      <div className="mt-1 flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={1000}
          disabled={blocked || busy}
          aria-label="发给客人的消息"
          placeholder={blocked ? "现在发不了" : "写给客人的话（点右边按钮才会发出，AI 不会自己发）"}
          className="min-h-[2.5rem] flex-1 resize-y rounded-lg border border-[color:var(--wb-line)] bg-white px-3 py-2 text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={blocked || busy || !text.trim()}
          className="shrink-0 rounded-lg bg-[#00a884] px-3 py-2 text-sm font-semibold text-white hover:bg-[#008069] disabled:opacity-50"
        >
          {busy ? "发送中…" : "确认发送"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
