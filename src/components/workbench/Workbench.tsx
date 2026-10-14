"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import type { AlldataCreated, AlldataDraft } from "@/lib/workbench/alldata-draft";
import type { StaffQuote } from "@/lib/workbench/quote";
import { AlldataDocuments } from "./AlldataDocuments";
import { AlldataDraftCard } from "./AlldataDraftCard";
import { StaffQuoteCard } from "./StaffQuoteCard";

interface Turn {
  role: "user" | "assistant";
  text: string;
  quotes: StaffQuote[];
  /** ALLDATA estimate drafts from this reply. */
  drafts?: AlldataDraft[];
  /** Shown but not sent back to the assistant (errors). */
  localOnly?: boolean;
}

type Vehicle = { key: string; label: string } | null;

/** One conversation: its own messages and its own current vehicle. */
export interface Conversation {
  id: string;
  title: string;
  turns: Turn[];
  vehicle: Vehicle;
  updatedAt: number;
}

const STATUS: Record<string, string> = {
  thinking: "思考中…",
  vehicle: "正在查车…",
  services: "正在查维修项目…",
  estimate: "正在查工时和零件价格…",
};

const STARTERS = ["2019 Toyota Camry LE 前刹车片", "225/65R17 四季胎，四条", "225/65R17 米其林冬季胎", "2018 Honda Civic LX 换机油"];

const ERRORS = {
  unauthorized: "登录已失效，请刷新页面重新登录。",
  busy: "请求太频繁，请稍后再试。",
  unavailable: "暂时无法查询，请稍后再试。",
  empty: "没有得到回复，请换个说法再试一次。",
};

const MAX_CONVERSATIONS = 30;
const MAX_TURNS = 60;

function newConversation(): Conversation {
  return { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: "", turns: [], vehicle: null, updatedAt: Date.now() };
}

const storageKey = (email: string) => `speedx.workbench.conversations.v1:${email}`;

/** Conversations saved in this browser; the list is never empty. */
export function loadConversations(email: string): Conversation[] {
  try {
    const raw = window.localStorage.getItem(storageKey(email));
    const saved = raw ? (JSON.parse(raw) as Conversation[]) : [];
    const valid = Array.isArray(saved) ? saved.filter((c) => c && typeof c.id === "string" && Array.isArray(c.turns)) : [];
    return valid.length ? valid : [newConversation()];
  } catch {
    return [newConversation()];
  }
}

function saveConversations(email: string, conversations: Conversation[]) {
  try {
    const trimmed = conversations
      .slice(0, MAX_CONVERSATIONS)
      .map((c) => ({ ...c, turns: c.turns.slice(-MAX_TURNS) }));
    window.localStorage.setItem(storageKey(email), JSON.stringify(trimmed));
  } catch {
    // Storage full or blocked: the conversations still work for this visit.
  }
}

const noSubscribe = () => () => {};

function timeLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

/** The staff repair workbench: the estimate assistant at full detail, in several conversations. */
export function Workbench({ email }: { email: string }) {
  // Render the saved conversations only after hydration; the server has no localStorage.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    typeof window === "undefined" ? [newConversation()] : loadConversations(email),
  );
  const [activeId, setActiveId] = useState<string>(() => conversations[0].id);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const [showDocuments, setShowDocuments] = useState(false);
  /** The conversation whose title is being edited, and the text typed so far. */
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const active = conversations.find((c) => c.id === activeId) ?? conversations[0];
  const activePending = pending[active.id];

  useEffect(() => {
    if (hydrated) saveConversations(email, conversations);
  }, [conversations, email, hydrated]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "instant" });
  }, [active.turns.length, activePending, active.id]);

  function update(id: string, change: (c: Conversation) => Conversation) {
    setConversations((list) => {
      const next = list.map((c) => (c.id === id ? { ...change(c), updatedAt: Date.now() } : c));
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  function startConversation() {
    // Reuse an empty conversation instead of piling them up.
    const empty = conversations.find((c) => c.turns.length === 0);
    if (empty) {
      setActiveId(empty.id);
      return;
    }
    const fresh = newConversation();
    setConversations((list) => [fresh, ...list].slice(0, MAX_CONVERSATIONS));
    setActiveId(fresh.id);
  }

  function markCreated(conversationId: string, draftId: string, created: AlldataCreated) {
    update(conversationId, (c) => ({
      ...c,
      turns: c.turns.map((t) => (t.drafts?.some((d) => d.id === draftId) ? { ...t, drafts: t.drafts.map((d) => (d.id === draftId ? { ...d, created } : d)) } : t)),
    }));
  }

  /** Save a new title without moving the conversation in the list; an empty title goes back to the first question. */
  function renameConversation(id: string, title: string) {
    const clean = title.trim().slice(0, 60);
    setConversations((list) =>
      list.map((c) =>
        c.id === id ? { ...c, title: clean || c.turns.find((t) => t.role === "user")?.text.slice(0, 30) || "" } : c,
      ),
    );
    setRenaming(null);
  }

  function removeConversation(id: string) {
    setConversations((list) => {
      const rest = list.filter((c) => c.id !== id);
      const next = rest.length ? rest : [newConversation()];
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  async function send(text: string) {
    const message = text.trim();
    const id = active.id;
    if (!message || pending[id]) return;
    const history = active.turns
      .filter((t) => !t.localOnly && t.text.trim())
      .slice(-40)
      .map((t) => ({ role: t.role, text: t.text }));
    const vehicle = active.vehicle;
    update(id, (c) => ({
      ...c,
      title: c.title || message.slice(0, 30),
      turns: [...c.turns, { role: "user", text: message, quotes: [] }],
    }));
    setInput("");
    setPending((p) => ({ ...p, [id]: "thinking" }));

    const quotes: StaffQuote[] = [];
    const drafts: AlldataDraft[] = [];
    let reply = "";
    let failure: keyof typeof ERRORS | null = null;
    let nextVehicle = vehicle;
    try {
      const response = await fetch("/api/workbench/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, message, vehicleKey: vehicle?.key ?? null }),
      });
      if (!response.ok || !response.body) {
        failure = response.status === 401 ? "unauthorized" : response.status === 429 ? "busy" : "unavailable";
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!line) continue;
            const event = JSON.parse(line) as
              | { type: "status"; status: string }
              | { type: "vehicle"; vehicle: { key: string; label: string } }
              | { type: "quote"; quote: StaffQuote }
              | { type: "alldata_draft"; draft: AlldataDraft }
              | { type: "message"; text: string }
              | { type: "error"; code: "busy" | "unavailable" }
              | { type: "done" };
            if (event.type === "status") setPending((p) => ({ ...p, [id]: event.status }));
            else if (event.type === "vehicle") nextVehicle = event.vehicle;
            else if (event.type === "quote") quotes.push(event.quote);
            else if (event.type === "alldata_draft") drafts.push(event.draft);
            else if (event.type === "message") reply = event.text;
            else if (event.type === "error") failure = event.code;
          }
          if (done) break;
        }
      }
    } catch {
      failure = "unavailable";
    }
    if (!failure && !reply && quotes.length === 0 && drafts.length === 0) failure = "empty";
    update(id, (c) => ({
      ...c,
      vehicle: nextVehicle,
      turns: [
        ...c.turns,
        failure ? { role: "assistant", text: ERRORS[failure], quotes, drafts, localOnly: true } : { role: "assistant", text: reply, quotes, drafts },
      ],
    }));
    setPending((p) => {
      const rest = { ...p };
      delete rest[id];
      return rest;
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">正在打开工作台…</div>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-900 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold">SPEEDX 维修工作台</h1>
            <p className="text-xs text-ink-300">内部使用 · 含进价和毛利，请勿截图发给客人</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-300">
            <button
              type="button"
              onClick={() => setShowDocuments((v) => !v)}
              aria-expanded={showDocuments}
              className="rounded-full border border-white/30 px-3 py-1 font-semibold text-white hover:bg-white/10"
            >
              ALLDATA 单据
            </button>
            {active.vehicle && <span className="rounded-full bg-white/10 px-3 py-1 text-white">当前车辆：{active.vehicle.label}</span>}
            <span>{email}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col md:flex-row">
        <nav aria-label="会话" className="border-b border-ink-200 bg-white md:w-64 md:shrink-0 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between gap-2 px-3 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">会话</h2>
            <button
              type="button"
              onClick={startConversation}
              className="rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-600"
            >
              + 新会话
            </button>
          </div>
          <ul className="flex gap-2 overflow-x-auto px-3 pb-3 md:block md:max-h-[calc(100vh-8rem)] md:space-y-1 md:overflow-y-auto md:px-2">
            {conversations.map((c) => (
              <li key={c.id} className="shrink-0 md:shrink">
                <div
                  className={`group flex items-center gap-1 rounded-lg ${
                    c.id === active.id ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {renaming?.id === c.id ? (
                    <input
                      autoFocus
                      aria-label="会话标题"
                      value={renaming.title}
                      maxLength={60}
                      onChange={(e) => setRenaming({ id: c.id, title: e.target.value })}
                      onFocus={(e) => e.currentTarget.select()}
                      onBlur={() => renameConversation(c.id, renaming.title)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) renameConversation(c.id, renaming.title);
                        else if (e.key === "Escape") setRenaming(null);
                      }}
                      className="m-1.5 min-w-0 flex-1 rounded-md border border-brand-300 bg-white px-2 py-1.5 text-sm text-ink-900 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid="conversation"
                      aria-current={c.id === active.id ? "true" : undefined}
                      onClick={() => setActiveId(c.id)}
                      onDoubleClick={() => setRenaming({ id: c.id, title: c.title })}
                      className="min-w-0 flex-1 px-3 py-2 text-left"
                    >
                      <span className="block truncate text-sm">{c.title || "新会话"}</span>
                      <span className={`block text-xs ${c.id === active.id ? "text-ink-300" : "text-ink-400"}`}>
                        {pending[c.id] ? "查询中…" : `${c.vehicle?.label ?? ""} ${timeLabel(c.updatedAt)}`.trim()}
                      </span>
                    </button>
                  )}
                  {c.turns.length > 0 && renaming?.id !== c.id && (
                    <>
                      <button
                        type="button"
                        aria-label={`重命名会话 ${c.title}`}
                        title="重命名"
                        onClick={() => setRenaming({ id: c.id, title: c.title })}
                        className="rounded px-1.5 text-xs opacity-60 hover:opacity-100"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        aria-label={`删除会话 ${c.title}`}
                        onClick={() => removeConversation(c.id)}
                        className="mr-1 rounded px-1.5 text-xs opacity-60 hover:opacity-100"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="w-full flex-1 space-y-4 px-4 py-6">
            {showDocuments && <AlldataDocuments onClose={() => setShowDocuments(false)} />}
            {active.turns.length === 0 && (
              <section className="rounded-xl border border-dashed border-ink-300 bg-white p-5 text-sm text-ink-600">
                <p className="font-medium text-ink-900">
                  像外面的估价助手一样提问，这里会显示完整明细：每个零件选项的标价、进价、毛利、库存，工时小时数和推荐价。
                </p>
                <p className="mt-2">每个会话互不影响，可以一个会话查报价、另一个会话处理别的车。每张报价单下面的“复制客户报价”只包含客户价。</p>
                <p className="mt-2">
                  报价确定后说“开 ALLDATA 估价单”，会生成草稿，核对后点按钮在 ALLDATA 建单并打开 PDF 打印；历史单据和收据在右上角“ALLDATA 单据”里找。（需要这台电脑装好 SPEEDX ALLDATA 助手扩展并登录 ALLDATA。）
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full border border-ink-200 px-3.5 py-1.5 text-ink-700 hover:border-brand-300 hover:text-brand-700"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {active.turns.map((turn, index) =>
              turn.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-ink-900 px-4 py-2 text-sm text-white">{turn.text}</p>
                </div>
              ) : (
                <div key={index} className="space-y-3">
                  {turn.text && (
                    <p className="max-w-3xl whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-ink-800 ring-1 ring-ink-100">
                      {turn.text}
                    </p>
                  )}
                  {turn.quotes.map((quote) => (
                    <StaffQuoteCard key={quote.id} quote={quote} />
                  ))}
                  {turn.drafts?.map((draft) => (
                    <AlldataDraftCard key={draft.id} draft={draft} onCreated={(created) => markCreated(active.id, draft.id, created)} />
                  ))}
                </div>
              ),
            )}

            {activePending && (
              <p role="status" className="flex items-center gap-2 text-sm text-ink-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                {STATUS[activePending] ?? STATUS.thinking}
              </p>
            )}
            <div ref={endRef} />
          </main>

          <form onSubmit={onSubmit} className="sticky bottom-0 border-t border-ink-200 bg-white px-4 py-3">
            <div className="flex gap-2">
              <label htmlFor="workbench-input" className="sr-only">
                问一个报价
              </label>
              <textarea
                id="workbench-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                maxLength={2000}
                placeholder="车型 + 项目，例如：2019 Camry LE 前刹车片；或 VIN；或轮胎尺寸"
                className="min-h-[3rem] flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={Boolean(activePending) || !input.trim()}
                className="self-end rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
              >
                查询
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
