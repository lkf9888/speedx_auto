"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Member {
  email: string;
  name: string;
  active: boolean;
  addedBy: string;
  addedAt: string;
}

interface Answer {
  staff: Member[];
  owners: string[];
  message?: string;
}

/**
 * The staff accounts (Kevin, 2026-11-16), for the owners: add a colleague's email, turn an account off (or on) or remove
 * it. Cloudflare Access still has to let that email in to sign in at all; this list decides who may then use the workbench.
 */
export function StaffPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [confirming, setConfirming] = useState("");

  async function call(method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workbench/staff", { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const json = (await response.json().catch(() => ({}))) as Answer & { message?: string };
      if (!response.ok) {
        setError(json.message ?? "操作没成功，请再试一次");
        return false;
      }
      setData(json);
      return true;
    } catch {
      setError("网络不通，请再试一次");
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // Loaded once when the panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void call("GET");
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (await call("POST", { email, name })) {
      setEmail("");
      setName("");
    }
  }

  return (
    <section data-testid="staff-panel" className="rounded-2xl bg-white p-4 text-sm text-ink-900 shadow-xl sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">员工账号</h2>
          <p className="mt-1 text-xs leading-5 text-ink-600">名单里的人用自己的邮箱登录就能用工作台。停用后马上不能用，对话记录还在。</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭" className="shrink-0 whitespace-nowrap rounded-full border border-ink-300 px-3 py-1.5 text-xs font-semibold hover:bg-ink-100">
          关闭
        </button>
      </header>

      {error && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{error}</p>}

      <form onSubmit={add} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="员工的邮箱"
          aria-label="员工的邮箱"
          autoCapitalize="none"
          autoComplete="off"
          className="min-w-0 rounded-lg border border-ink-300 px-3 py-2 text-base focus:border-sky-600 focus:outline-none sm:text-sm"
        />
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="名字（选填）"
          aria-label="员工名字"
          className="min-w-0 rounded-lg border border-ink-300 px-3 py-2 text-base focus:border-sky-600 focus:outline-none sm:text-sm"
        />
        <button type="submit" disabled={busy || !email.trim()} className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-[#008069] disabled:opacity-50">
          添加
        </button>
      </form>
      <p className="mt-2 text-[11px] leading-4 text-ink-500">新员工第一次登录前，还要在 Cloudflare Access 里允许这个邮箱进入维修工作台（或把策略放宽成邮箱验证码，由这里的名单决定谁能用）。</p>

      <ul className="mt-4 divide-y divide-ink-200 rounded-xl border border-ink-200">
        {(data?.owners ?? []).map((owner) => (
          <li key={owner} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span className="min-w-0 truncate font-medium">{owner}</span>
            <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-900">老板</span>
          </li>
        ))}
        {(data?.staff ?? []).map((m) => (
          <li key={m.email} data-testid="staff-row" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate font-medium">{m.name || m.email.split("@")[0]}</p>
              <p className="truncate text-xs text-ink-500">{m.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.active ? "bg-emerald-100 text-emerald-900" : "bg-ink-200 text-ink-700"}`}>{m.active ? "可用" : "已停用"}</span>
              <button type="button" disabled={busy} onClick={() => void call("PATCH", { email: m.email, active: !m.active })} className="rounded-full border border-ink-300 px-3 py-1.5 text-xs font-semibold hover:bg-ink-100 disabled:opacity-50">
                {m.active ? "停用" : "启用"}
              </button>
              {confirming === m.email ? (
                <button type="button" disabled={busy} onClick={() => void call("DELETE", { email: m.email }).then(() => setConfirming(""))} className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                  确认删除
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirming(m.email)} className="rounded-full border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                  删除
                </button>
              )}
            </div>
          </li>
        ))}
        {data && data.staff.length === 0 && <li className="px-3 py-3 text-xs text-ink-500">还没有员工账号。</li>}
        {!data && !error && <li className="px-3 py-3 text-xs text-ink-500">正在读取…</li>}
      </ul>
    </section>
  );
}
