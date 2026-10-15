"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { MemoryProposal } from "@/lib/workbench/assistant";
import type { MemoryNote } from "@/lib/workbench/memory";

const MAX = 300;

const ERRORS: Record<string, string> = {
  not_configured: "记忆还没配置好（服务器缺少 Cloudflare KV 设置）。",
  unauthorized: "登录已失效，请刷新页面重新登录。",
  full: "记忆已满，请先删除或合并几条。",
  not_found: "这条记忆已经被别人删除了。",
  invalid: "内容不能为空，最多 300 字。",
};

/** Calls /api/workbench/memory; returns the full list after the change. */
export async function memoryRequest(method: "GET" | "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>): Promise<MemoryNote[]> {
  const response = await fetch("/api/workbench/memory", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { notes?: MemoryNote[]; error?: string };
  if (!response.ok || !data.notes) throw new Error(ERRORS[data.error ?? ""] ?? "记忆暂时打不开，请稍后再试。");
  return data.notes;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
const who = (email: string) => email.split("@")[0];

/** Every shared note: add, edit, delete. */
export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [notes, setNotes] = useState<MemoryNote[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    memoryRequest("GET")
      .then((list) => live && setNotes(list))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  async function run(change: () => Promise<MemoryNote[]>) {
    setBusy(true);
    setError("");
    try {
      setNotes(await change());
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await run(() => memoryRequest("POST", { text: draft }))) setDraft("");
  }

  async function save() {
    if (!editing) return;
    if (await run(() => memoryRequest("PATCH", { id: editing.id, text: editing.text }))) setEditing(null);
  }

  return (
    <section aria-label="工作台记忆" className="mx-auto max-w-3xl rounded-lg bg-white text-sm shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <header className="flex items-start justify-between gap-2 border-b border-[color:var(--wb-border)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--wb-text)]">工作台记忆</h2>
          <p className="text-xs text-[color:var(--wb-muted)]">全店共用。每个会话的 AI 都会遵守这里的每一条；任何员工都可以添加、修改、删除。在对话里说“记住……”也会生成一条待保存的建议。</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭工作台记忆" className="rounded px-2 text-lg text-[color:var(--wb-muted)] hover:text-[color:var(--wb-text)]">
          ×
        </button>
      </header>

      {notes === null && !error && <p className="px-4 py-3 text-[color:var(--wb-muted)]">正在读取…</p>}
      {notes && notes.length === 0 && <p className="px-4 py-3 text-[color:var(--wb-muted)]">还没有记忆。</p>}
      {notes && notes.length > 0 && (
        <ol className="divide-y divide-[color:var(--wb-border)]">
          {notes.map((note, index) => (
            <li key={note.id} data-testid="memory-note" className="flex gap-3 px-4 py-2.5">
              <span className="w-5 shrink-0 text-right text-[color:var(--wb-muted)]">{index + 1}.</span>
              {editing?.id === note.id ? (
                <div className="flex-1 space-y-2">
                  <label htmlFor={`memory-edit-${note.id}`} className="sr-only">
                    修改记忆
                  </label>
                  <textarea
                    id={`memory-edit-${note.id}`}
                    value={editing.text}
                    maxLength={MAX}
                    rows={2}
                    onChange={(e) => setEditing({ id: note.id, text: e.target.value })}
                    className="w-full rounded-lg border border-[color:var(--wb-line)] px-3 py-2 focus:border-[#00a884] focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || !editing.text.trim()} onClick={() => void save()} className="rounded-full bg-[#00a884] px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">
                      保存
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded-full border border-[color:var(--wb-line)] px-4 py-1 text-xs text-[color:var(--wb-icon)]">
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-[color:var(--wb-text)]">{note.text}</p>
                    <p className="text-xs text-[#8696a0]">
                      {who(note.updatedBy)} · {day(note.updatedAt)}
                      {note.updatedAt !== note.createdAt && "（已修改）"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`修改记忆 ${index + 1}`} onClick={() => setEditing({ id: note.id, text: note.text })} className="rounded px-2 text-[color:var(--wb-icon)] hover:bg-black/5">
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label={`删除记忆 ${index + 1}`}
                      disabled={busy}
                      onClick={() => void run(() => memoryRequest("DELETE", { id: note.id }))}
                      className="rounded px-2 text-[color:var(--wb-icon)] hover:bg-black/5"
                    >
                      ×
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {notes && (
        <form onSubmit={(e) => void add(e)} className="flex gap-2 border-t border-[color:var(--wb-border)] px-4 py-3">
          <label htmlFor="memory-new" className="sr-only">
            新增记忆
          </label>
          <input
            id="memory-new"
            value={draft}
            maxLength={MAX}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：米其林冬季胎先问客人能不能接受带钉胎"
            className="flex-1 rounded-full border border-[color:var(--wb-line)] px-4 py-1.5 focus:border-[#00a884] focus:outline-none"
          />
          <button type="submit" disabled={busy || !draft.trim()} className="rounded-full bg-[#00a884] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            添加
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="px-4 pb-3 text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

/** A note the assistant suggests keeping. Saved only when staff press save. */
export function MemoryProposalCard({
  proposal,
  saved,
  onSaved,
}: {
  proposal: MemoryProposal;
  saved: boolean;
  onSaved: () => void;
}) {
  const [text, setText] = useState(proposal.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      try {
        await memoryRequest(proposal.replacesId ? "PATCH" : "POST", proposal.replacesId ? { id: proposal.replacesId, text } : { text });
      } catch (e) {
        // The note it was meant to replace is gone: keep this one as a new note.
        if (!proposal.replacesId || (e as Error).message !== ERRORS.not_found) throw e;
        await memoryRequest("POST", { text });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article data-testid="memory-proposal" className="max-w-xl rounded-lg border border-[#00a884]/40 bg-white px-4 py-3 text-sm shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <p className="text-xs font-semibold text-[#008069]">{proposal.replacesId ? "建议修改一条记忆" : "建议记住"}</p>
      {saved ? (
        <p className="mt-1 text-[color:var(--wb-text)]">
          {text}
          <span className="ml-2 text-xs text-[#008069]">✓ 已保存，之后每个会话都会遵守</span>
        </p>
      ) : (
        <>
          <label htmlFor={`proposal-${proposal.id}`} className="sr-only">
            记忆内容
          </label>
          <textarea
            id={`proposal-${proposal.id}`}
            value={text}
            maxLength={MAX}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[color:var(--wb-line)] px-3 py-2 focus:border-[#00a884] focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void save()}
            className="mt-2 rounded-full bg-[#00a884] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy ? "保存中…" : proposal.replacesId ? "保存修改" : "保存到记忆"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-700">
          {error}
        </p>
      )}
    </article>
  );
}
