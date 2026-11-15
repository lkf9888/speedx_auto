"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateRanges, type EstimateCard } from "@/lib/repair-chat/pricing";
import type { Conversation } from "@/lib/workbench/conversation-types";
import { smsLink, span, type FollowUpOffer } from "@/lib/workbench/followup";

const CHANNEL = { email: "邮件", sms: "短信", call: "电话" } as const;
const when = (at: number) => new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

async function post(conversationId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/workbench/conversations/${conversationId}/followup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : response.status === 401 ? "登录已失效，请刷新页面" : "暂时用不了，请稍后再试");
  return data;
}

/**
 * A follow-up offer for a website customer who left a phone or email: the AI
 * drafts it, staff adjust it, see the email exactly as it goes out, then send
 * the email, text from Google Messages, or call. Every send is recorded, and the
 * offer becomes a customer-only discount on the website.
 */
export function FollowUpPanel({ conversation, onClose, onChanged }: { conversation: Conversation; onClose: () => void; onChanged: (c: Conversation) => void }) {
  const visitor = conversation.website!;
  const [offer, setOffer] = useState<FollowUpOffer | null>(null);
  const [estimates, setEstimates] = useState<EstimateCard[]>([]);
  const [mailerReady, setMailerReady] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState<"" | "draft" | "send" | "log">("draft");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let live = true;
    post(conversation.id, { action: "draft" })
      .then((data) => {
        if (!live) return;
        setOffer(data.offer as FollowUpOffer);
        setEstimates(data.estimates as EstimateCard[]);
        setMailerReady(Boolean(data.mailerReady));
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setBusy(""));
    return () => {
      live = false;
    };
  }, [conversation.id]);

  const refreshPreview = useCallback(
    (next: FollowUpOffer) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        post(conversation.id, { action: "preview", offer: next })
          .then((data) => {
            setPreview({ subject: String(data.subject), html: String(data.html) });
            setError("");
          })
          .catch((e: Error) => setError(e.message));
      }, 400);
    },
    [conversation.id],
  );

  useEffect(() => {
    if (offer) refreshPreview(offer);
  }, [offer, refreshPreview]);

  const change = (patch: Partial<FollowUpOffer>) => setOffer((o) => (o ? { ...o, ...patch } : o));
  const card = estimates.find((e) => e.id === offer?.estimateId);

  async function sendEmail() {
    if (!offer || !visitor.email) return;
    if (!window.confirm(`发这封邮件给 ${visitor.email}？\n主题：${preview?.subject ?? offer.subject}`)) return;
    setBusy("send");
    setError("");
    try {
      const data = await post(conversation.id, { action: "send", offer });
      onChanged(data.conversation as Conversation);
      setNotice(`已发给 ${visitor.email}${(data.record as { ruleId?: string }).ruleId ? "，网站上也已按这位客人的电话登记了优惠" : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function log(channel: "sms" | "call") {
    if (!offer) return;
    setBusy("log");
    setError("");
    try {
      const data = await post(conversation.id, { action: "log", channel, offer });
      onChanged(data.conversation as Conversation);
      setNotice(channel === "sms" ? "已记下这次短信回访" : "已记下这次电话回访");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function copySms() {
    if (!offer) return;
    try {
      await navigator.clipboard.writeText(offer.sms);
      setNotice("短信内容已复制，可以在 Google Messages 网页版粘贴发送");
    } catch {
      setNotice("浏览器不允许复制，请手动选择短信内容");
    }
  }

  const field = "w-full rounded-lg border border-[color:var(--wb-line)] bg-[#fff] px-3 py-1.5 text-sm text-[#111b21] focus:border-[#00a884] focus:outline-none";
  const history = conversation.followUps ?? [];

  return (
    <section aria-label="回访优惠" className="mx-auto max-w-5xl rounded-lg bg-white text-sm shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <header className="flex items-start justify-between gap-2 border-b border-[color:var(--wb-border)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--wb-text)]">回访优惠 · {visitor.name || "网站客人"}</h2>
          <p className="text-xs text-[color:var(--wb-muted)]">
            AI 根据这次网站咨询起草了优惠，你可以改金额、有效期和文字。发出的优惠会登记到网站估价助手（按客人电话），客人回网站问价或来电时自动按优惠价。
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭回访" className="rounded px-2 text-lg text-[color:var(--wb-muted)] hover:text-[color:var(--wb-text)]">
          ×
        </button>
      </header>

      {busy === "draft" && <p className="px-4 py-6 text-[color:var(--wb-muted)]">AI 正在起草优惠…</p>}

      {offer && (
        <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="grid content-start gap-3">
            <label className="grid gap-1 text-xs text-[color:var(--wb-muted)]">
              针对哪个报价
              <select className={field} value={offer.estimateId} onChange={(e) => change({ estimateId: e.target.value })}>
                {estimates.map((e) => {
                  const r = estimateRanges(e);
                  return (
                    <option key={e.id} value={e.id}>
                      {[e.service, e.position].filter(Boolean).join(" · ")} · {span(r.totalLow, r.totalHigh)}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
              <label className="grid gap-1 text-xs text-[color:var(--wb-muted)]">
                优惠方式
                <select className={field} value={offer.kind} onChange={(e) => change({ kind: e.target.value as FollowUpOffer["kind"] })}>
                  <option value="amount">减金额</option>
                  <option value="percent">打折</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-[color:var(--wb-muted)]">
                {offer.kind === "percent" ? "折扣 %" : "减 $"}
                <input className={field} type="number" min={1} max={offer.kind === "percent" ? 50 : 500} value={offer.value} onChange={(e) => change({ value: Number(e.target.value) })} />
              </label>
              <label className="grid gap-1 text-xs text-[color:var(--wb-muted)]">
                有效到
                <input className={field} type="date" value={offer.expiresOn} onChange={(e) => change({ expiresOn: e.target.value })} />
              </label>
            </div>
            {card && (
              <p className="text-xs text-[color:var(--wb-muted)]">
                网站估价 {span(estimateRanges(card).totalLow, estimateRanges(card).totalHigh)}，客人看到的优惠在右边预览里。
              </p>
            )}
            <label className="grid gap-1 text-xs text-[color:var(--wb-muted)]">
              邮件主题
              <input className={field} value={offer.subject} maxLength={140} onChange={(e) => change({ subject: e.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--wb-muted)]">
              邮件里的话
              <textarea className={field} rows={5} value={offer.message} maxLength={1200} onChange={(e) => change({ message: e.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-[color:var(--wb-muted)]">
              短信内容
              <textarea className={field} rows={3} value={offer.sms} maxLength={480} onChange={(e) => change({ sms: e.target.value })} />
            </label>

            <div className="grid gap-2 rounded-lg bg-[color:var(--wb-notice)] p-3">
              {visitor.email ? (
                <button
                  type="button"
                  disabled={Boolean(busy) || !mailerReady}
                  onClick={() => void sendEmail()}
                  className="rounded-full bg-[#00a884] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "send" ? "正在发送…" : `✉️ 发邮件给 ${visitor.email}`}
                </button>
              ) : (
                <p className="text-xs text-[color:var(--wb-muted)]">客人没有留邮箱，只能发短信或打电话。</p>
              )}
              {visitor.email && !mailerReady && <p className="text-xs text-amber-800">回访邮箱还没设置好（Railway 里要填 FOLLOWUP_SMTP_USER 和 FOLLOWUP_SMTP_PASS），现在只能预览。</p>}
              {visitor.phone && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <a href={smsLink(visitor.phone, offer.sms)} className="rounded-full border border-[#00a884] bg-white px-4 py-1.5 text-xs font-semibold text-[#008069]">
                      💬 在手机上用 Google Messages 发
                    </a>
                    <button type="button" onClick={() => void copySms()} className="rounded-full border border-[color:var(--wb-line)] bg-white px-4 py-1.5 text-xs text-[color:var(--wb-icon)]">
                      复制短信
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => void log("sms")} className="rounded-full border border-[color:var(--wb-line)] bg-white px-4 py-1.5 text-xs text-[color:var(--wb-icon)] disabled:opacity-50">
                      我已发短信
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`tel:${visitor.phone}`} className="rounded-full border border-[color:var(--wb-line)] bg-white px-4 py-1.5 text-xs font-semibold text-[color:var(--wb-icon)]">
                      📞 打给 {visitor.phone}
                    </a>
                    <button type="button" disabled={Boolean(busy)} onClick={() => void log("call")} className="rounded-full border border-[color:var(--wb-line)] bg-white px-4 py-1.5 text-xs text-[color:var(--wb-icon)] disabled:opacity-50">
                      记一次电话回访
                    </button>
                  </div>
                  <p className="text-[11px] leading-4 text-[color:var(--wb-muted)]">在手机上打开工作台点“Google Messages 发”，短信已填好，按发送即可；在电脑上可以复制后到 messages.google.com 粘贴。</p>
                </>
              )}
            </div>
            {notice && <p className="text-xs font-semibold text-emerald-700">{notice}</p>}
            {history.length > 0 && (
              <div className="text-xs text-[color:var(--wb-muted)]">
                <p className="font-semibold">回访记录</p>
                <ul className="mt-1 grid gap-0.5">
                  {history
                    .slice()
                    .reverse()
                    .map((h) => (
                      <li key={`${h.at}-${h.channel}`}>
                        {when(h.at)} · {CHANNEL[h.channel]} · {h.offer} · {h.by.split("@")[0]}
                        {h.ruleId ? " · 已登记网站优惠" : ""}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid content-start gap-2">
            <p className="text-xs text-[color:var(--wb-muted)]">邮件预览（客人收到的样子）{preview ? ` · 主题：${preview.subject}` : ""}</p>
            {preview ? (
              <iframe title="邮件预览" sandbox="" srcDoc={preview.html} className="h-[34rem] w-full rounded-lg border border-[color:var(--wb-line)] bg-[#eceef2]" />
            ) : (
              <p className="text-[color:var(--wb-muted)]">正在生成预览…</p>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="px-4 pb-3 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
