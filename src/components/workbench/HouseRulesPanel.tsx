"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { FLAT_PRICE_SLOTS, type FlatPriceSlot } from "@/lib/repair-chat/flat-prices";
import { EVERYONE, type HouseRule, type HouseRuleChange } from "@/lib/repair-chat/house-rules";

const KIND: Record<HouseRule["kind"], { label: string; badge: string }> = {
  note: { label: "叮嘱", badge: "bg-sky-100 text-sky-900" },
  discount: { label: "折扣", badge: "bg-amber-100 text-amber-900" },
  price: { label: "改价", badge: "bg-emerald-100 text-emerald-900" },
  closed: { label: "休息日", badge: "bg-rose-100 text-rose-900" },
};
import type { RulesProposal } from "@/lib/workbench/house-rules-agent";

interface RulesState {
  rules: HouseRule[];
  canEdit: boolean;
  today: string;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  proposal?: RulesProposal;
  /** What happened to the proposal card. */
  outcome?: "applied" | "dismissed";
}

const TARGET: Record<HouseRule["appliesTo"], string> = {
  all: "所有估价",
  labor_jobs: "按工时的维修",
  oil_change: "换机油",
  tire_change: "换胎（客人自带轮胎）",
  ac_recharge: "空调加雪种",
  new_tires: "买新轮胎",
};

async function call(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof data.message === "string" ? data.message : response.status === 401 ? "登录已失效，请刷新页面重新登录。" : "暂时打不开，请稍后再试。",
    );
  }
  return data;
}

const rulesRequest = (method: "GET" | "POST" | "DELETE", body?: unknown) =>
  call("/api/workbench/house-rules", method, body) as Promise<unknown> as Promise<RulesState>;

function when(rule: { startDate?: string; endDate?: string }, today: string): string {
  const start = rule.startDate ?? "";
  const end = rule.endDate ?? "";
  if (end && end < today) return `已过期（${end} 结束）`;
  if (start && start > today) return `${start} 开始${end ? `，${end} 结束` : ""}`;
  if (end) return `到 ${end}`;
  return "一直有效";
}

function describe(rule: Partial<HouseRule>): string {
  if (rule.kind === "note") return rule.text ?? "";
  if (rule.kind === "price") {
    const slot = FLAT_PRICE_SLOTS[rule.priceSlot as FlatPriceSlot];
    return slot ? `${slot.zh}：$${slot.price} → $${rule.price}` : `一口价 ${rule.priceSlot ?? ""} → $${rule.price}`;
  }
  if (rule.kind === "closed") {
    const days = !rule.endDate || rule.endDate === rule.startDate ? `${rule.startDate}` : `${rule.startDate} 到 ${rule.endDate}`;
    return `${days} 不营业，网上预约跳过这几天${rule.text ? `（${rule.text}）` : ""}`;
  }
  const off = rule.percent ? `${rule.percent}%` : `$${rule.amount}`;
  const what = `${TARGET[rule.appliesTo ?? "all"] ?? ""}${rule.serviceKeyword ? `（名称含“${rule.serviceKeyword}”）` : ""}`;
  return `${what}${rule.on === "labor" ? "工时" : "总价"}减 ${off}；卡片上写“${rule.labelZh || rule.labelEn}”`;
}

const tail = (phone: string) => `指定客人 ···${phone.slice(-4)}`;

function ChangeLine({ change, rules, today }: { change: HouseRuleChange; rules: HouseRule[]; today: string }) {
  const old = rules.find((r) => r.id === change.id);
  if (change.action === "delete") {
    return (
      <li>
        <span className="font-semibold text-red-700">删除</span> {old ? old.title : change.id}
      </li>
    );
  }
  const rule = change.rule ?? {};
  // Who it's for after the change: an update with no phone keeps the old customer; "everyone" opens it to all.
  const typed = (rule.customerPhone ?? "").trim();
  const toEveryone = typed.toLowerCase() === EVERYONE;
  const phone = toEveryone ? "" : typed.replace(/\D/g, "") || (change.action === "update" ? (old?.customerPhone ?? "") : "");
  return (
    <li>
      <span className="font-semibold text-[#027eb5]">{change.action === "add" ? "新增" : "修改"}</span>{" "}
      <span className="font-semibold">{rule.title}</span>
      <span className="text-[color:var(--wb-muted)]">（{KIND[rule.kind ?? "note"]?.label ?? "规则"} · {when(rule, today)}{phone ? ` · ${tail(phone)}` : ""}）</span>
      {toEveryone && old?.customerPhone && <span className="ml-1 rounded bg-red-100 px-1 text-xs font-semibold text-red-800">范围从指定客人改成所有客人</span>}
      <br />
      <span className="whitespace-pre-wrap">{describe(rule)}</span>
    </li>
  );
}

/**
 * The owner's rules for the website's estimate assistant, and a chat with the
 * AI that drafts them. Changes happen only when the owner confirms a card.
 */
export function HouseRulesPanel({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<RulesState | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  /** Set while a confirm or dismiss is being handled, so a double click can't apply a card twice. */
  const settling = useRef(false);

  useEffect(() => {
    let live = true;
    rulesRequest("GET")
      .then((next) => live && setState(next))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [turns]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    const history = turns.map((t) => ({
      role: t.role,
      text: t.proposal ? `${t.text}\n[提议卡片：${t.proposal.summary}${t.outcome === "applied" ? "（店主已确认生效）" : t.outcome === "dismissed" ? "（店主没有采用）" : ""}]` : t.text,
    }));
    setTurns((list) => [...list, { role: "user", text: message }]);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const reply = (await call("/api/workbench/house-rules/chat", "POST", { message, history })) as { text: string; proposal: RulesProposal | null };
      setTurns((list) => [...list, { role: "assistant", text: reply.text, ...(reply.proposal ? { proposal: reply.proposal } : {}) }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function settle(index: number, apply: boolean) {
    const proposal = turns[index]?.proposal;
    if (!proposal || turns[index]?.outcome || settling.current) return;
    settling.current = true;
    setError("");
    if (apply) {
      setBusy(true);
      try {
        setState(await rulesRequest("POST", { changes: proposal.changes }));
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
        settling.current = false;
        return;
      }
      setBusy(false);
    }
    setTurns((list) => list.map((t, i) => (i === index ? { ...t, outcome: apply ? "applied" : "dismissed" } : t)));
    settling.current = false;
  }

  async function remove(rule: HouseRule) {
    if (!window.confirm(`删除“${rule.title}”？对外助手会马上不再用这条。`)) return;
    setBusy(true);
    setError("");
    try {
      setState(await rulesRequest("DELETE", { id: rule.id }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rules = state?.rules ?? [];
  const today = state?.today ?? "";

  return (
    <section aria-label="调教对外助手" className="mx-auto max-w-3xl rounded-lg bg-white text-sm shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <header className="flex items-start justify-between gap-2 border-b border-[color:var(--wb-border)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--wb-text)]">调教对外助手</h2>
          <p className="text-xs text-[color:var(--wb-muted)]">
            网站维修页上给客人报价的 AI 会遵守这里的规则：叮嘱它怎么说、怎么处理特殊情况，给某段时间、某位客人打折，直接改一口价，或者设休息日。用中文直接说，AI 起草后你点“确认生效”才会改，一分钟内网站就会照做。进价、时薪、客人联系方式这些红线这里改不了。注意：改一口价只改聊天里的报价，维修页上的价目表和搜索结果还是原价，适合临时促销；长期改价还要改页面。
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭调教对外助手" className="rounded px-2 text-lg text-[color:var(--wb-muted)] hover:text-[color:var(--wb-text)]">
          ×
        </button>
      </header>

      <div className="border-b border-[color:var(--wb-border)] px-4 py-3">
        <h3 className="text-xs font-semibold text-[color:var(--wb-muted)]">现在的规则（{rules.length}）</h3>
        {state === null && !error && <p className="py-2 text-[color:var(--wb-muted)]">正在读取…</p>}
        {state && rules.length === 0 && <p className="py-2 text-[color:var(--wb-muted)]">还没有规则，对外助手按默认方式回答。</p>}
        {rules.length > 0 && (
          <ul className="mt-1 divide-y divide-[color:var(--wb-border)]">
            {rules.map((rule) => {
              const ended = Boolean(rule.endDate && rule.endDate < today);
              return (
                <li key={rule.id} data-testid="house-rule" className={`flex gap-3 py-2 ${ended ? "opacity-50" : ""}`}>
                  <span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[0.7rem] font-semibold ${KIND[rule.kind]?.badge ?? KIND.note.badge}`}>
                    {KIND[rule.kind]?.label ?? "规则"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[color:var(--wb-text)]">{rule.title}</p>
                    <p className="whitespace-pre-wrap text-[color:var(--wb-text)]">{describe(rule)}</p>
                    <p className="text-xs text-[#8696a0]">
                      {when(rule, today)}
                      {rule.customerPhone ? ` · ${tail(rule.customerPhone)}` : ""} · {rule.updatedBy.split("@")[0]}
                    </p>
                  </div>
                  {state?.canEdit && (
                    <button type="button" aria-label={`删除规则 ${rule.title}`} disabled={busy} onClick={() => void remove(rule)} className="h-fit rounded px-2 text-[color:var(--wb-icon)] hover:bg-black/5">
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {state && !state.canEdit && <p className="px-4 py-3 text-[color:var(--wb-muted)]">只有店主能改这些规则。</p>}
      {state?.canEdit && (
        <>
          <div className="max-h-[45vh] space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
            {turns.length === 0 && (
              <p className="text-[color:var(--wb-muted)]">
                例如：“这个月换胎每条减 $5，到 11 月 30 号”、“电话 778-555-0100 的客人换刹车片打九折”、“客人问能不能当天修好，就说要看零件到货，一般当天能做”、“普通机油轿车改成 $89”、“12 月 24 到 26 号休息”。
              </p>
            )}
            {turns.map((turn, index) => (
              <div key={index} className={turn.role === "user" ? "flex justify-end" : "space-y-2"}>
                <p
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 ${turn.role === "user" ? "bg-[#d9fdd3] text-[#111b21]" : "bg-[#e1f0ff] text-[#111b21]"}`}
                  data-testid={turn.role === "user" ? "rules-owner-message" : "rules-ai-message"}
                >
                  {turn.text}
                </p>
                {turn.proposal && (
                  <div data-testid="rules-proposal" className="max-w-xl rounded-lg border border-[color:var(--wb-line)] bg-[#fffdf5] px-3 py-2 text-[#111b21]">
                    <p className="text-xs font-semibold text-[#8a6d00]">待确认的修改</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {turn.proposal.changes.map((change, i) => (
                        <ChangeLine key={i} change={change} rules={rules} today={today} />
                      ))}
                    </ul>
                    {turn.outcome ? (
                      <p className="mt-2 text-xs font-semibold text-[color:var(--wb-muted)]">{turn.outcome === "applied" ? "✓ 已生效" : "没有采用"}</p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy} onClick={() => void settle(index, true)} className="rounded-full bg-[#00a884] px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">
                          确认生效
                        </button>
                        <button type="button" disabled={busy} onClick={() => void settle(index, false)} className="rounded-full border border-[color:var(--wb-line)] px-4 py-1 text-xs text-[color:var(--wb-icon)]">
                          不要
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && turns.at(-1)?.role === "user" && <p className="text-xs text-[color:var(--wb-muted)]">AI 正在想…</p>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => void send(e)} className="flex gap-2 border-t border-[color:var(--wb-border)] px-4 py-3">
            <label htmlFor="house-rules-input" className="sr-only">
              对 AI 说
            </label>
            <textarea
              id="house-rules-input"
              value={draft}
              rows={2}
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(e);
                }
              }}
              placeholder="用中文告诉 AI 要怎么调整对外助手"
              className="flex-1 resize-none rounded-lg border border-[color:var(--wb-line)] px-3 py-2 focus:border-[#00a884] focus:outline-none"
            />
            <button type="submit" disabled={busy || !draft.trim()} className="h-fit self-end rounded-full bg-[#00a884] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              发送
            </button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="px-4 pb-3 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
