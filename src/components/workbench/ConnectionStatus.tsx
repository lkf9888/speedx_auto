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

/** While the panel is open it re-reads the server's report this often (the server decides what is due for a re-check). */
const REREAD_MS = 60_000;
/** The header dot peeks at the last report this often; peeking never starts a check. */
const SUMMARY_MS = 5 * 60_000;

const time = (at: number) => new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

async function readReport(mode: "due" | "fresh" | "peek"): Promise<StatusReport> {
  const response = await fetch(`/api/workbench/status${mode === "due" ? "" : `?${mode}=1`}`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "登录已过期，请刷新页面" : `服务器返回 ${response.status}`);
  return (await response.json()) as StatusReport;
}

/** ALLDATA goes through this computer's Chrome extension, so the page asks it directly. */
async function checkAlldata(): Promise<SourceStatus> {
  const started = Date.now();
  const base = { id: "alldata", name: "ALLDATA", purpose: "维修手册、估价单 / 工单 / 发票（经这台电脑的 Chrome 扩展）", checkedAt: started };
  if (!(await bridgeInstalled())) return { ...base, state: "not_configured", detail: "这台电脑没装 SPEEDX ALLDATA 扩展，或扩展没启用" };
  try {
    const result = await callAlldata("status", {}, 20_000);
    if (!result.signedIn) return { ...base, state: "down", detail: "扩展正常，但这台电脑的 Chrome 没登录 ALLDATA" };
    return { ...base, state: "ok", detail: `已登录（扩展 ${result.version}）`, latencyMs: Date.now() - started };
  } catch (error) {
    return { ...base, state: "down", detail: bridgeErrorText(error), latencyMs: Date.now() - started };
  }
}

export interface ConnectionSummary {
  /** Sources down, ALLDATA included once this page has checked it; null before anything was checked. */
  down: number | null;
  update: (change: { server?: StatusReport; alldata?: SourceStatus }) => void;
}

/** Shared by the header dot and the panel, so a re-check in the panel shows on the dot right away. */
export function useConnectionSummary(): ConnectionSummary {
  // The newest server report wins: a slow peek must not overwrite a newer re-check.
  const [server, setServer] = useState<{ checkedAt: number; down: number } | null>(null);
  const [alldataDown, setAlldataDown] = useState(false);
  const update = useCallback((change: { server?: StatusReport; alldata?: SourceStatus }) => {
    const report = change.server;
    if (report && report.checkedAt > 0) {
      const down = report.sources.filter((s) => s.state === "down").length;
      setServer((previous) => (previous && previous.checkedAt > report.checkedAt ? previous : { checkedAt: report.checkedAt, down }));
    }
    if (change.alldata) setAlldataDown(change.alldata.state === "down");
  }, []);
  useEffect(() => {
    let live = true;
    const look = () => {
      if (document.hidden) return;
      readReport("peek")
        .then((report) => live && update({ server: report }))
        .catch(() => undefined);
    };
    look();
    const timer = window.setInterval(look, SUMMARY_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [update]);
  const down = server === null && !alldataDown ? null : (server?.down ?? 0) + (alldataDown ? 1 : 0);
  return { down, update };
}

/** Header button with a dot: red when any connection is down, grey before anything was checked. */
export function ConnectionButton({ open, onToggle, down }: { open: boolean; onToggle: () => void; down: number | null }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={down ? `连接状态（${down} 个连不上）` : "连接状态"}
      title={down ? `${down} 个数据源连不上` : down === 0 ? "接入的都正常" : "后台连接了哪些网站（点开检查）"}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--wb-line)] bg-white px-2.5 py-2 text-xs font-semibold text-[color:var(--wb-icon)] hover:bg-[color:var(--wb-hover)] sm:px-3 sm:py-1.5"
    >
      <span aria-hidden data-testid="connection-dot" className={`h-2 w-2 rounded-full ${down === null ? "bg-slate-300" : down > 0 ? "bg-red-600" : "bg-emerald-500"}`} />
      <span className="hidden sm:inline">连接状态</span>
    </button>
  );
}

/** Which sites the assistant is connected to, and whether each answers now. */
export function ConnectionStatus({ onClose, onChange }: { onClose: () => void; onChange?: ConnectionSummary["update"] }) {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [alldata, setAlldata] = useState<SourceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const read = useCallback(
    (fresh: boolean, withAlldata: boolean, live: () => boolean = () => true) => {
      if (withAlldata)
        void checkAlldata().then((result) => {
          if (!live()) return;
          setAlldata(result);
          onChange?.({ alldata: result });
        });
      return readReport(fresh ? "fresh" : "due")
        .then((next) => {
          if (!live()) return;
          setReport(next);
          setError("");
          onChange?.({ server: next });
        })
        .catch((e: Error) => live() && setError(e.message || "检查失败"));
    },
    [onChange],
  );

  useEffect(() => {
    let live = true;
    const alive = () => live;
    void read(false, true, alive);
    const timer = window.setInterval(() => {
      if (!document.hidden) void read(false, false, alive);
    }, REREAD_MS);
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
            估价助手后台连着的网站和服务。检查结果会保留一段时间（供货商 30 分钟，其他 5 分钟），点“立即检查”马上重查。供货商登录被拒后 30 分钟内不会自动重试，免得账号被锁。
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
              {source.checkedAt > 0 && <p className="text-[0.7rem] text-ink-400">检查于 {time(source.checkedAt)}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
