"use client";

import { useState } from "react";

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  async function unsubscribe() {
    setState("busy");
    const response = await fetch(`/api/followup/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => null);
    setState(response?.ok ? "done" : "failed");
  }
  if (state === "done") return <p className="font-semibold text-emerald-700">已退订，我们不会再给您发优惠邮件。You&apos;re unsubscribed.</p>;
  return (
    <div className="grid gap-2">
      <button type="button" disabled={state === "busy"} onClick={() => void unsubscribe()} className="rounded-full bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {state === "busy" ? "正在退订…" : "退订 / Unsubscribe"}
      </button>
      {state === "failed" && <p className="text-sm text-red-700">这个退订链接无效或已过期，请直接回复邮件或致电 778-917-0710。</p>}
    </div>
  );
}
