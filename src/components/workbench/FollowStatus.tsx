"use client";

import { useState } from "react";
import type { Conversation, ConversationSummary } from "@/lib/workbench/conversation-types";
import { FOLLOW_LABEL, FOLLOW_STATES, followStats, LOST_REASONS, OVERDUE_MS, type FollowState, type FollowStatus } from "@/lib/workbench/follow-status";
import { staffName } from "@/lib/workbench/conversation-types";

const COLOUR: Record<FollowState, string> = {
  new: "bg-amber-100 text-amber-900",
  contacted: "bg-sky-100 text-sky-900",
  booked: "bg-indigo-100 text-indigo-900",
  arrived: "bg-teal-100 text-teal-900",
  won: "bg-emerald-100 text-emerald-900",
  lost: "bg-ink-200 text-ink-700",
};

const when = (at: number) => new Date(at).toLocaleString("zh-CN", { timeZone: "America/Vancouver", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const money = (value: number) => `$${value.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The status as a small tag, for the list and the header. */
export function FollowChip({ state, className = "" }: { state: FollowState; className?: string }) {
  return (
    <span data-testid="follow-chip" className={`rounded px-1 text-xs font-semibold ${COLOUR[state]} ${className}`}>
      {FOLLOW_LABEL[state]}
    </span>
  );
}

/** The warning on a customer who left contact details more than a day ago and still has no follow-up. */
export function OverdueTag() {
  return (
    <span data-testid="overdue-tag" className="mr-1 rounded bg-red-600 px-1 text-xs font-semibold text-white">
      ⏰ 超过1天没跟进
    </span>
  );
}

/**
 * Where this website customer stands with the shop (Kevin, 2026-11-20): pick the status, and for 已成交 the amount before
 * tax (optional), for 没成 the reason. Every change is kept with who made it and when.
 */
export function FollowStatusControl({ conversation, onSaved }: { conversation: Conversation; onSaved: (saved: Conversation) => void }) {
  const current: FollowStatus | undefined = conversation.followStatus;
  const [state, setState] = useState<FollowState>(current?.state ?? "new");
  const [amount, setAmount] = useState(current?.amount !== undefined ? String(current.amount) : "");
  const [reason, setReason] = useState(current?.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showLog, setShowLog] = useState(false);
  // Someone else changed it (or this page reloaded): the controls follow the saved status.
  const saved = `${current?.state ?? "new"}|${current?.amount ?? ""}|${current?.reason ?? ""}|${current?.at ?? ""}`;
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setState(current?.state ?? "new");
    setAmount(current?.amount !== undefined ? String(current.amount) : "");
    setReason(current?.reason ?? "");
  }
  const log = conversation.followLog ?? [];
  const unchanged = state === (current?.state ?? "new") && (state !== "won" || amount.trim() === (current?.amount !== undefined ? String(current.amount) : "")) && (state !== "lost" || reason === (current?.reason ?? ""));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { follow: { state, ...(state === "won" && amount.trim() ? { amount: Number(amount) } : {}), ...(state === "lost" && reason ? { reason } : {}) } };
      const response = await fetch(`/api/workbench/conversations/${conversation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await response.json().catch(() => ({}))) as { conversation?: Conversation };
      if (!response.ok || !json.conversation) setError("没保存成功，请再试一次");
      else onSaved(json.conversation);
    } catch {
      setError("网络不通，请再试一次");
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded-md border border-[color:var(--wb-border)] bg-[color:var(--wb-input)] px-2 py-1.5 text-base text-[color:var(--wb-text)] sm:py-1 sm:text-xs";
  return (
    <div data-testid="follow-control" className="border-b border-[color:var(--wb-border)] bg-[color:var(--wb-panel)] px-4 py-2 text-xs text-[color:var(--wb-icon)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="font-semibold text-[color:var(--wb-text)]">跟进状态</span>
        <select aria-label="跟进状态" value={state} onChange={(e) => setState(e.target.value as FollowState)} className={field}>
          {FOLLOW_STATES.map((s) => (
            <option key={s} value={s}>
              {FOLLOW_LABEL[s]}
            </option>
          ))}
        </select>
        {state === "won" && (
          <input
            aria-label="成交金额（税前，选填）"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 10))}
            placeholder="成交金额（税前，选填）"
            className={`${field} w-44`}
          />
        )}
        {state === "lost" && (
          <select aria-label="没成的原因" value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
            <option value="">原因（选填）</option>
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => void save()} disabled={busy || unchanged} className="rounded-full bg-[#00a884] px-3 py-1.5 font-semibold text-white hover:bg-[#008069] disabled:opacity-50 sm:py-1">
          {busy ? "保存中…" : "保存"}
        </button>
        {error && (
          <span role="alert" className="font-semibold text-red-700">
            {error}
          </span>
        )}
      </div>
      {current && (
        <p data-testid="follow-last" className="mt-1.5 text-[color:var(--wb-muted)]">
          {staffName(current.by)} 在 {when(current.at)} 改为「{FOLLOW_LABEL[current.state]}」
          {current.amount !== undefined ? `，成交 ${money(current.amount)}（税前）` : current.state === "won" ? "，没填金额" : ""}
          {current.reason ? `，原因：${current.reason}` : ""}
          {log.length > 1 && (
            <button type="button" onClick={() => setShowLog((v) => !v)} className="ml-2 underline">
              {showLog ? "收起历史" : `历史（${log.length}）`}
            </button>
          )}
        </p>
      )}
      {showLog && (
        <ul data-testid="follow-log" className="mt-1 space-y-0.5 text-[color:var(--wb-muted)]">
          {[...log].reverse().map((h) => (
            <li key={`${h.at}-${h.state}`}>
              {when(h.at)} · {staffName(h.by)} · {FOLLOW_LABEL[h.state]}
              {h.amount !== undefined ? ` · ${money(h.amount)}` : ""}
              {h.reason ? ` · ${h.reason}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type FollowFilter = "all" | "overdue" | FollowState;

/** Filter chips above the list: how many website chats are in each state. */
export function FollowFilterBar({ list, filter, onChange, now, onSummary }: { list: ConversationSummary[]; filter: FollowFilter; onChange: (f: FollowFilter) => void; now: number; onSummary: () => void }) {
  const website = list.filter((c) => c.website !== undefined && !c.archived);
  if (website.length === 0) return null;
  const count = (state: FollowState) => website.filter((c) => (c.follow ?? "new") === state).length;
  const overdue = website.filter((c) => c.contactAt !== undefined && (c.follow ?? "new") === "new" && now - c.contactAt > OVERDUE_MS).length;
  const chip = (id: FollowFilter, label: string, n?: number, hot = false) => (
    <button
      key={id}
      type="button"
      aria-pressed={filter === id}
      onClick={() => onChange(filter === id ? "all" : id)}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${filter === id ? "bg-[#00a884] text-white" : hot ? "bg-red-600 text-white" : "bg-[color:var(--wb-avatar)] text-[color:var(--wb-icon)] hover:bg-[color:var(--wb-hover)]"}`}
    >
      {label}
      {n !== undefined ? ` ${n}` : ""}
    </button>
  );
  return (
    <div data-testid="follow-filter" className="flex items-center gap-1.5 overflow-x-auto border-b border-[color:var(--wb-border)] px-3 py-2">
      {chip("all", "全部")}
      {overdue > 0 && chip("overdue", "⏰ 超期", overdue, true)}
      {FOLLOW_STATES.map((s) => chip(s, FOLLOW_LABEL[s], count(s)))}
      <button type="button" onClick={onSummary} className="shrink-0 rounded-full border border-[color:var(--wb-border)] px-2.5 py-1 text-xs font-semibold text-[color:var(--wb-icon)] hover:bg-[color:var(--wb-hover)]">
        📊 汇总
      </button>
    </div>
  );
}

const PERIODS = [
  { id: "7", label: "最近 7 天", days: 7 },
  { id: "30", label: "最近 30 天", days: 30 },
  { id: "90", label: "最近 90 天", days: 90 },
  { id: "all", label: "全部", days: null },
] as const;

/** How many website consultations went how far, and what was sold, in a period. */
export function FollowSummaryPanel({ list, now, onClose }: { list: ConversationSummary[]; now: number; onClose: () => void }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("30");
  const days = PERIODS.find((p) => p.id === period)!.days;
  const stats = followStats(list, days === null ? null : now - days * 24 * 60 * 60 * 1000, now);
  const rate = (n: number) => (stats.consultations ? `${Math.round((n / stats.consultations) * 100)}%` : "—");
  const rows: Array<[string, number, string]> = [
    ["网站咨询", stats.consultations, ""],
    ["留了联系方式", stats.leftContact, rate(stats.leftContact)],
    ["已联系", stats.contacted, rate(stats.contacted)],
    ["已约时间", stats.booked, rate(stats.booked)],
    ["已到店", stats.arrived, rate(stats.arrived)],
    ["已成交", stats.won, rate(stats.won)],
  ];
  return (
    <section data-testid="follow-summary" className="rounded-2xl bg-white p-4 text-sm text-ink-900 shadow-xl sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">跟进汇总</h2>
          <p className="mt-1 text-xs leading-5 text-ink-600">按咨询开始的时间算，只统计网站客人的对话。已联系、已约、到店都包含走得更远的客人。</p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 whitespace-nowrap rounded-full border border-ink-300 px-3 py-1.5 text-xs font-semibold hover:bg-ink-100">
          关闭
        </button>
      </header>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${period === p.id ? "bg-[#00a884] text-white" : "border border-ink-300 hover:bg-ink-100"}`}>
            {p.label}
          </button>
        ))}
      </div>
      <table className="mt-3 w-full text-left">
        <tbody>
          {rows.map(([label, n, pct]) => (
            <tr key={label} className="border-t border-ink-200">
              <th className="py-2 font-medium">{label}</th>
              <td data-testid={`stat-${label}`} className="py-2 text-right text-base font-semibold tabular-nums">
                {n}
              </td>
              <td className="w-14 py-2 text-right text-xs text-ink-500">{pct}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink-900">
            <th className="py-2 font-semibold">成交金额合计（税前）</th>
            <td data-testid="stat-amount" className="py-2 text-right text-base font-bold tabular-nums">
              {money(stats.wonAmount)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-5 text-ink-500">
        没成 {stats.lost} 个
        {stats.wonNoAmount > 0 ? `；有 ${stats.wonNoAmount} 个成交没填金额，没算进合计` : ""}
        {stats.tests > 0 ? `；已排除 ${stats.tests} 个测试单` : ""}。
      </p>
    </section>
  );
}
