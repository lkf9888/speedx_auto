"use client";

import { useState } from "react";
import type { Conversation, ShareLink } from "@/lib/workbench/conversation-types";

const when = (at: number) => new Date(at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** The share page is on the main site: the workbench subdomain needs a staff sign-in. */
export function shareLinkUrl(token: string): string {
  const local = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  return `${local ? window.location.origin : "https://speedxrental.com"}/share/${token}`;
}

/**
 * Make a no-login link to this conversation (three days), copy it, or cancel
 * it early. The link shows what staff see, costs included, so the panel says so.
 */
export function SharePanel({
  conversation,
  onClose,
  onChanged,
}: {
  conversation: Conversation;
  onClose: () => void;
  onChanged: (conversation: Conversation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  // When the panel opened: links that expire while it is open still show until it is reopened.
  const [now] = useState(() => Date.now());
  const links = (conversation.shares ?? []).filter((s) => s.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt);

  async function call(method: "POST" | "DELETE", token?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/workbench/conversations/${conversation.id}/share${token ? `?token=${encodeURIComponent(token)}` : ""}`, { method });
      const data = (await response.json().catch(() => ({}))) as { conversation?: Conversation; link?: ShareLink; message?: string };
      if (!response.ok || !data.conversation) throw new Error(data.message || (response.status === 401 ? "登录已失效，请刷新页面" : "分享暂时用不了，请稍后再试"));
      onChanged(data.conversation);
      if (data.link) await copy(data.link.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(shareLinkUrl(token));
      setCopied(token);
    } catch {
      setCopied("");
    }
  }

  return (
    <section aria-label="分享对话" className="mx-auto max-w-xl rounded-lg bg-white text-sm shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <header className="flex items-start justify-between gap-2 border-b border-[color:var(--wb-border)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--wb-text)]">分享这个对话</h2>
          <p className="text-xs leading-5 text-[color:var(--wb-muted)]">
            生成一个不用登录就能看的链接，内容是现在这一刻的对话记录（之后的新消息不会出现）。链接 3 天后自动失效，也可以随时取消。
            <b className="text-amber-800"> 链接里能看到进价、加价和客人联系方式，只发给信得过的人。</b>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭分享" className="rounded px-2 text-lg text-[color:var(--wb-muted)] hover:text-[color:var(--wb-text)]">
          ×
        </button>
      </header>
      <div className="space-y-2 px-4 py-3">
        {links.map((link) => (
          <div key={link.token} data-testid="share-link" className="rounded-lg border border-[color:var(--wb-line)] px-3 py-2">
            <p className="break-all font-mono text-xs text-[color:var(--wb-text)]">{shareLinkUrl(link.token)}</p>
            <p className="mt-1 text-xs text-[color:var(--wb-muted)]">
              {link.createdBy.split("@")[0]} {when(link.createdAt)} 创建 · {when(link.expiresAt)} 到期
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void copy(link.token)} className="rounded-full bg-[#00a884] px-3 py-1 text-xs font-semibold text-white">
                复制链接
              </button>
              <button type="button" disabled={busy} onClick={() => void call("DELETE", link.token)} className="rounded-full border border-[color:var(--wb-line)] px-3 py-1 text-xs text-[color:var(--wb-icon)] disabled:opacity-50">
                取消分享
              </button>
              {copied === link.token && <span className="text-xs text-emerald-700">已复制</span>}
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void call("POST")}
          className="w-full rounded-full bg-[#00a884] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "正在生成…" : links.length ? "再生成一个新链接（含最新消息）" : "生成分享链接（3 天有效）"}
        </button>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
