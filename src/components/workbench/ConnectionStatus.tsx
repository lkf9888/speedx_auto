"use client";

import { useCallback, useEffect, useState } from "react";
import { bridgeErrorText, bridgeInstalled, callAlldata } from "@/lib/workbench/alldata-bridge";
import type { SourceState, SourceStatus, StatusReport } from "@/lib/workbench/status";

const LABEL: Record<SourceState, string> = { ok: "正常", down: "连不上", not_configured: "未设置", not_connected: "未接入" };
const DOT: Record<SourceState, string> = { ok: "bg-emerald-500", down: "bg-red-600", not_configured: "bg-amber-400", not_connected: "bg-slate-300" };
const BADGE: Record<SourceState, string> = {
  ok: "bg-emerald-50 text-emerald-800",
  down: "bg-red-50 text-red-800",
  not_configured: "bg-amber-50 text-amber-900",
  not_connected: "bg-slate-100 text-slate-600",
};

/** While the panel is open it re-reads the server's report this often (the server re-checks every 5 minutes). */
const REREAD_MS = 60_000;
/** The header dot looks at the report this often. */
const SUMMARY_MS = 5 * 60_000;

const time = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

async function readReport(fresh: boolean): Promise<StatusReport> {
  const response = await fetch(`/api/workbench/status${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "登录已过期，请刷新页面" : `服务器返回 ${response.status}`);
  return (await response.json()) as StatusReport;
}

/** ALLDATA goes through this computer's Chrome extension, so the page asks it directly. */
async function checkAlldata(): Promise<SourceStatus> {
  const base = { id: "alldata", name: "ALLDATA", purpose: "维修手册、估价单 / 工单 / 发票（经这台电脑的 Chrome 扩展）" };
  const started = Date.now();
  if (!(await bridgeInstalled())) return { ...base, state: "not_configured", detail: "这台电脑没装 SPEEDX ALLDATA 扩展，或扩展没启用" };
  try {
    const result = await callAlldata("status", {}, 20_000);
    if (!result.signedIn) return { ...base, state: "down", detail: "扩展正常，但这台电脑的 Chrome 没登录 ALLDATA" };
    return { ...base, state: "ok", detail: `已登录（扩展 ${result.version}）`, latencyMs: Date.now() - started };
  } catch (error) {
    return { ...base, state: "down", detail: bridgeErrorText(error), latencyMs: Date.now() - started };
  }
}

/** Header button with a dot: red when any connection is down. */
export function ConnectionButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [down, setDown] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const look = () =>
      readReport(false)
        .then((report) => live && setDown(report.sources.filter((s) => s.state === "down").length))
        .catch(() => undefined);
    void look();
    const timer = window.setInterval(look, SUMMARY_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={down ? `连接状态（${down} 个连不上）` : "连接状态"}
      title={down ? `${down} 个数据源连不上` : "后台连接了哪些网站"}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--wb-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--wb-icon)] hover:bg-[color:var(--wb-hover)]"
    >
      <span aria-hidden data-testid="connection-dot" className={`h-2 w-2 rounded-full ${down === null ? "bg-slate-300" : down > 0 ? "bg-red-600" : "bg-emerald-500"}`} />
      <span>
        连接<span className="hidden sm:inline">状态</span>
      </span>
    </button>
  );
}

/** Which sites the assistant is connected to, and whether each answers now. */
export function ConnectionStatus({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [alldata, setAlldata] = useState<SourceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const read = useCallback((fresh: boolean, withAlldata: boolean, live: () => boolean = () => true) => {
    if (withAlldata) void checkAlldata().then((result) => live() && setAlldata(result));
    return readReport(fresh)
      .then((next) => {
        if (!live()) return;
        setReport(next);
        setError("");
      })
      .catch((e: Error) => live() && setError(e.message || "检查失败"));
  }, []);

  useEffect(() => {
    let live = true;
    const alive = () => live;
    void read(false, true, alive);
    const timer = window.setInterval(() => void read(false, false, alive), REREAD_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [read]);

  function recheck() {
    setBusy(true);
    setError("");
    void read(true, true).finally(() => setBusy(false));
  }

  const sources = [...(alldata ? [alldata] : []), ...(report?.sources ?? [])];
  const down = sources.filter((s) => s.state === "down").length;

  return (
    <section aria-label="连接状态" className="rounded-xl border border-ink-200 bg-white text-sm shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink-900">连接状态</h2>
          <p className="text-xs text-ink-500">
            估价助手后台连着的网站和服务。服务器每 5 分钟检查一次，点“立即检查”马上重查。
            {report && <> 上次检查 {time(report.checkedAt)}。</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={recheck}
            disabled={busy}
            className="rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            {busy ? "检查中…" : "立即检查"}
          </button>
          <button type="button" onClick={onClose} aria-label="关闭连接状态" className="rounded px-2 text-lg text-ink-500 hover:text-ink-900">
            ×
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="mx-4 mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
      {report && (
        <p data-testid="connection-summary" className={`mx-4 mt-3 rounded px-3 py-2 text-xs font-semibold ${down ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>
          {down ? `${down} 个连不上，AI 用到它们时会少一部分数据` : "已接入的都正常"}
        </p>
      )}
      {!report && !error && <p className="px-4 py-6 text-center text-xs text-ink-500">正在检查…</p>}
      <ul className="divide-y divide-ink-100 px-4 py-2">
        {sources.map((source) => (
          <li key={source.id} data-testid={`source-${source.id}`} className="flex items-start gap-3 py-2.5">
            <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[source.state]}`} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 font-medium text-ink-900">
                {source.name}
                <span className={`rounded px-1.5 py-0.5 text-[0.7rem] font-semibold ${BADGE[source.state]}`}>{LABEL[source.state]}</span>
                {source.state === "ok" && source.latencyMs !== undefined && <span className="text-[0.7rem] font-normal text-ink-400">{source.latencyMs} ms</span>}
              </p>
              <p className="text-xs text-ink-500">{source.purpose}</p>
              <p className={`text-xs ${source.state === "down" ? "text-red-700" : "text-ink-600"}`}>{source.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
