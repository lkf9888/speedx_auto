"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ACCEPTED_TYPES, attachmentKind, MAX_ATTACHMENTS } from "@/lib/workbench/attachments";
import { prepareAttachment, type PreparedAttachment } from "@/lib/workbench/prepare-attachment";
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
  /** Files the staff member attached; only names and types are kept, never the data. */
  attachments?: SentFile[];
  at?: number;
}

interface SentFile {
  name: string;
  mediaType: string;
  /** Thumbnail, for this visit only. */
  preview?: string;
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
  invalid: "这条消息或文件没法处理：每次最多 4 个文件，图片、PDF 或文本，单个不超过 5MB。",
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
      .map((c) => ({
        ...c,
        turns: c.turns.slice(-MAX_TURNS).map((t) =>
          t.attachments ? { ...t, attachments: t.attachments.map(({ name, mediaType }) => ({ name, mediaType })) } : t,
        ),
      }));
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
  /** Files picked for the next message, and a note about files that were refused. */
  const [files, setFiles] = useState<PreparedAttachment[]>([]);
  const [fileNotice, setFileNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  /** Phones show either the conversation list or one conversation, like WhatsApp. */
  const [showList, setShowList] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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

  async function addFiles(picked: FileList | File[]) {
    setFileNotice("");
    const list = Array.from(picked);
    if (!list.length) return;
    const room = MAX_ATTACHMENTS - files.length;
    if (list.length > room) setFileNotice(`每条消息最多 ${MAX_ATTACHMENTS} 个文件`);
    const added: PreparedAttachment[] = [];
    for (const file of list.slice(0, Math.max(room, 0))) {
      const result = await prepareAttachment(file);
      if ("error" in result) setFileNotice(result.error);
      else added.push(result);
    }
    if (added.length) setFiles((current) => [...current, ...added].slice(0, MAX_ATTACHMENTS));
  }

  async function send(text: string) {
    const message = text.trim();
    const id = active.id;
    const attached = files;
    if ((!message && attached.length === 0) || pending[id]) return;
    const history = active.turns
      .filter((t) => !t.localOnly && (t.text.trim() || t.attachments?.length))
      .slice(-40)
      .map((t) => ({
        role: t.role,
        // Earlier files aren't sent again; the model is told they existed.
        text: [t.text, t.attachments?.length ? `[附件：${t.attachments.map((a) => a.name).join("、")}]` : ""].filter(Boolean).join("\n"),
      }));
    const vehicle = active.vehicle;
    update(id, (c) => ({
      ...c,
      title: c.title || (message || attached[0]?.name || "").slice(0, 30),
      turns: [
        ...c.turns,
        {
          role: "user",
          text: message,
          quotes: [],
          at: Date.now(),
          ...(attached.length ? { attachments: attached.map(({ name, mediaType, preview }) => ({ name, mediaType, preview })) } : {}),
        },
      ],
    }));
    setInput("");
    setFiles([]);
    setFileNotice("");
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
        body: JSON.stringify({
          history,
          message,
          vehicleKey: vehicle?.key ?? null,
          ...(attached.length ? { attachments: attached.map(({ name, mediaType, data }) => ({ name, mediaType, data })) } : {}),
        }),
      });
      if (!response.ok || !response.body) {
        failure =
          response.status === 401 ? "unauthorized" : response.status === 429 ? "busy" : response.status === 400 ? "invalid" : "unavailable";
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
        failure
          ? { role: "assistant", text: ERRORS[failure], quotes, drafts, localOnly: true, at: Date.now() }
          : { role: "assistant", text: reply, quotes, drafts, at: Date.now() },
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

  function pickConversation(id: string) {
    setActiveId(id);
    setShowList(false);
  }

  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-500">正在打开工作台…</div>;
  }

  const preview = (c: Conversation) => {
    const last = c.turns[c.turns.length - 1];
    if (!last) return "";
    const text = last.text.trim() || (last.attachments?.length ? `📎 ${last.attachments[0].name}` : "");
    return text.replace(/\s+/g, " ");
  };
  const canSend = !activePending && (input.trim().length > 0 || files.length > 0);

  return (
    <div className="h-dvh bg-[#d1d7db] md:p-4 lg:px-10 lg:py-5">
      <div className="mx-auto flex h-full max-w-[1600px] overflow-hidden bg-white shadow-lg md:rounded-lg">
        <aside
          aria-label="会话"
          className={`${showList ? "flex" : "hidden"} w-full shrink-0 flex-col border-r border-[#e9edef] bg-white md:flex md:w-80 lg:w-96`}
        >
          <div className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <h1 className="truncate text-[0.95rem] font-semibold text-[#111b21]">SPEEDX 维修工作台</h1>
              <p className="truncate text-xs text-[#667781]">{email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                startConversation();
                setShowList(false);
              }}
              className="shrink-0 rounded-full bg-[#00a884] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#008069]"
            >
              + 新会话
            </button>
          </div>
          <p className="bg-[#fff5c4] px-4 py-2 text-xs leading-5 text-[#54656f]">内部使用 · 含进价和毛利，请勿截图发给客人</p>
          <ul className="flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  data-testid="conversation"
                  aria-current={c.id === active.id ? "true" : undefined}
                  onClick={() => pickConversation(c.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left ${c.id === active.id ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"}`}
                >
                  <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-lg font-semibold text-[#54656f]">
                    {(c.title || "新").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 border-b border-[#e9edef] pb-3 -mb-3">
                    <span className="flex items-baseline justify-between gap-2">
                      <span data-testid="conversation-title" className="truncate text-[0.95rem] text-[#111b21]">{c.title || "新会话"}</span>
                      <span className="shrink-0 text-xs text-[#667781]">{timeLabel(c.updatedAt)}</span>
                    </span>
                    <span className={`block truncate text-sm ${pending[c.id] ? "text-[#00a884]" : "text-[#667781]"}`}>
                      {pending[c.id] ? "查询中…" : [c.vehicle?.label, preview(c)].filter(Boolean).join(" · ") || " "}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`${showList ? "hidden" : "flex"} relative min-w-0 flex-1 flex-col md:flex`}
        >
          <header className="flex items-center gap-2 bg-[#f0f2f5] px-3 py-2.5">
            <button type="button" aria-label="返回会话列表" onClick={() => setShowList(true)} className="rounded-full p-2 text-[#54656f] hover:bg-black/5 md:hidden">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] font-semibold text-[#54656f]">
              {(active.title || "新").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              {renaming?.id === active.id ? (
                <input
                  autoFocus
                  aria-label="会话标题"
                  value={renaming.title}
                  maxLength={60}
                  onChange={(e) => setRenaming({ id: active.id, title: e.target.value })}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => renameConversation(active.id, renaming.title)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) renameConversation(active.id, renaming.title);
                    else if (e.key === "Escape") setRenaming(null);
                  }}
                  className="w-full rounded-md border border-[#00a884] bg-white px-2 py-1 text-[0.95rem] text-[#111b21] focus:outline-none"
                />
              ) : (
                <p
                  className="truncate text-[0.95rem] font-medium text-[#111b21]"
                  onDoubleClick={() => active.turns.length > 0 && setRenaming({ id: active.id, title: active.title })}
                >
                  {active.title || "新会话"}
                </p>
              )}
              <p className="truncate text-xs text-[#667781]">{active.vehicle ? `当前车辆：${active.vehicle.label}` : "输入车型、VIN 或轮胎尺寸，也可以发照片"}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowDocuments((v) => !v)}
              aria-expanded={showDocuments}
              aria-label="ALLDATA 单据"
              className="shrink-0 rounded-full border border-[#d1d7db] bg-white px-3 py-1.5 text-xs font-semibold text-[#54656f] hover:bg-[#f5f6f6]"
            >
              ALLDATA<span className="hidden sm:inline"> 单据</span>
            </button>
            {active.turns.length > 0 && renaming?.id !== active.id && (
              <>
                <button
                  type="button"
                  aria-label={`重命名会话 ${active.title}`}
                  title="重命名"
                  onClick={() => setRenaming({ id: active.id, title: active.title })}
                  className="rounded-full p-2 text-[#54656f] hover:bg-black/5"
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`删除会话 ${active.title}`}
                  title="删除"
                  onClick={() => removeConversation(active.id)}
                  className="rounded-full p-2 text-[#54656f] hover:bg-black/5"
                >
                  ×
                </button>
              </>
            )}
          </header>

          <main className="wa-chat-bg flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6">
            {dragging && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#00a884]/15 text-lg font-semibold text-[#008069]">
                松开鼠标，把文件发给助手
              </div>
            )}
            {showDocuments && <AlldataDocuments onClose={() => setShowDocuments(false)} />}
            {active.turns.length === 0 && (
              <section className="mx-auto max-w-2xl rounded-lg bg-white/95 p-4 text-sm leading-6 text-[#3b4a54] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                <p className="font-medium text-[#111b21]">
                  像外面的估价助手一样提问，这里会显示完整明细：每个零件选项的标价、进价、毛利、库存，工时小时数和推荐价。
                </p>
                <p className="mt-2">
                  可以直接发照片或文件给助手看：VIN 铭牌、轮胎侧面、仪表盘警告灯、供应商 PDF、客人的零件清单（点输入框左边的回形针，或把文件拖进来、截图后直接粘贴；每次最多 4 个，单个不超过 5MB）。
                </p>
                <p className="mt-2">每个会话互不影响，可以一个会话查报价、另一个会话处理别的车；双击会话名或点 ✎ 可以改名。每张报价单下面的“复制客户报价”只包含客户价。</p>
                <p className="mt-2">
                  报价确定后说“开 ALLDATA 估价单”，会生成草稿，核对后点按钮在 ALLDATA 建单并打开 PDF 打印；历史单据和收据在右上角“ALLDATA 单据”里找。（需要这台电脑装好 SPEEDX ALLDATA 助手扩展并登录 ALLDATA。）
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-full bg-white px-3.5 py-1.5 text-[#008069] shadow-[0_1px_0.5px_rgba(11,20,26,0.2)] hover:bg-[#f5f6f6]"
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
                  <div className="wa-bubble wa-bubble-out max-w-[85%] sm:max-w-[70%]">
                    {turn.attachments?.length ? <SentFiles files={turn.attachments} /> : null}
                    {turn.text && <p className="whitespace-pre-wrap">{turn.text}</p>}
                    <Meta at={turn.at} sent />
                  </div>
                </div>
              ) : (
                <div key={index} className="space-y-2">
                  {turn.text && (
                    <div className="wa-bubble wa-bubble-in max-w-[92%] sm:max-w-[75%]">
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                      <Meta at={turn.at} />
                    </div>
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
              <div role="status" className="wa-bubble wa-bubble-in flex w-fit items-center gap-2 text-[#667781]">
                <span aria-hidden className="wa-typing">
                  <i />
                  <i />
                  <i />
                </span>
                {STATUS[activePending] ?? STATUS.thinking}
              </div>
            )}
            <div ref={endRef} />
          </main>

          <form onSubmit={onSubmit} className="bg-[#f0f2f5] px-3 py-2">
            {(files.length > 0 || fileNotice) && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-white py-1 pl-1 pr-2 text-xs text-[#3b4a54] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                    {file.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.preview} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded bg-[#dfe5e7] text-base">
                        {attachmentKind(file.mediaType) === "pdf" ? "PDF" : "TXT"}
                      </span>
                    )}
                    <span className="max-w-[10rem] truncate">{file.name}</span>
                    <button type="button" aria-label={`移除 ${file.name}`} onClick={() => setFiles((list) => list.filter((_, i) => i !== index))} className="text-base leading-none text-[#667781] hover:text-[#111b21]">
                      ×
                    </button>
                  </span>
                ))}
                {fileNotice && (
                  <span role="alert" className="text-xs text-amber-800">
                    {fileNotice}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={`${ACCEPTED_TYPES.join(",")},.csv,.txt,.md,.json`}
                aria-label="选择文件"
                data-testid="file-input"
                onChange={(e) => {
                  void addFiles(e.target.files ?? []);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="添加图片或文件"
                title="添加图片或文件"
                onClick={() => fileInput.current?.click()}
                className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.9-8.9a3.7 3.7 0 0 1 5.2 5.2l-8.9 8.9a1.8 1.8 0 0 1-2.6-2.6l8.2-8.2" />
                </svg>
              </button>
              <label htmlFor="workbench-input" className="sr-only">
                问一个报价
              </label>
              <textarea
                id="workbench-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const pasted = Array.from(e.clipboardData.files);
                  if (pasted.length) {
                    e.preventDefault();
                    void addFiles(pasted);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="车型+项目 / VIN / 尺寸 / 照片"
                className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-[1.4rem] border-0 bg-white px-4 py-[0.7rem] text-sm leading-5 text-[#111b21] placeholder:text-[#667781] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
              <button
                type="submit"
                aria-label="查询"
                disabled={!canSend}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-colors hover:bg-[#008069] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z" />
                </svg>
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function Meta({ at, sent = false }: { at?: number; sent?: boolean }) {
  if (at === undefined) return null;
  const time = new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <span className="wa-meta">
      {time}
      {sent && (
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="#53bdeb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 6l3 3 6-7M6.5 8.5l.5.5 6-7" />
        </svg>
      )}
    </span>
  );
}

/** Photos and files attached to a sent message: thumbnails this visit, names afterwards. */
function SentFiles({ files }: { files: SentFile[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-1.5" data-testid="sent-files">
      {files.map((file, index) =>
        file.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={index} src={file.preview} alt={file.name} className="h-24 w-24 rounded-md object-cover" />
        ) : (
          <span key={index} className="flex max-w-full items-center gap-1.5 rounded-md bg-black/5 px-2 py-1.5 text-xs">
            <span aria-hidden>{attachmentKind(file.mediaType) === "image" ? "🖼" : "📎"}</span>
            <span className="truncate">{file.name}</span>
          </span>
        ),
      )}
    </div>
  );
}
