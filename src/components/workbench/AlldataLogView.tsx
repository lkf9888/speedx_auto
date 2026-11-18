"use client";

import { useState } from "react";
import { ACTION_POLICY } from "@/lib/workbench/alldata-gates";
import type { OpAction, OpLogEntry } from "@/lib/workbench/alldata-oplog";

const ACTION_LABEL: Record<OpAction, string> = {
  lookup: "查单",
  create_draft: "建草稿",
  create_estimate: "建估价单",
  change: "改单",
  convert_estimate: "转估价单",
  convert_invoice: "转发票",
  gate_release: "老板放开确认",
  gate_revoke: "老板撤销放开",
  failure: "失败",
};
const RESULT_LABEL = { ok: "成功", mismatch: "已保存，核对有差异", failed: "失败", uncertain: "结果不确定" } as const;
const STATE_LABEL = { auto: "员工点一下即可", ask: "需要老板确认", never: "工作台没有入口" } as const;

const when = (iso: string) => new Date(iso).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** The ALLDATA operation log, and which kinds of action need whose yes. No customer details are kept in it. */
export function AlldataLogView() {
  const [entries, setEntries] = useState<OpLogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/workbench/alldata-log");
      if (!response.ok) throw new Error("log");
      setEntries(((await response.json()) as { entries: OpLogEntry[] }).entries);
    } catch {
      setError("操作日志暂时读不出来。");
    }
  }

  return (
    <div className="border-t border-ink-100 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void load()} className="rounded-full border border-ink-300 px-3 py-1 text-xs font-semibold text-ink-700 hover:border-ink-500">
          操作日志
        </button>
        <button type="button" onClick={() => setShowPolicy((v) => !v)} className="rounded-full border border-ink-300 px-3 py-1 text-xs font-semibold text-ink-700 hover:border-ink-500">
          哪些操作要老板确认
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {showPolicy && (
        <table className="mt-2 w-full text-left text-xs">
          <tbody>
            {ACTION_POLICY.map((p) => (
              <tr key={p.id} className="border-t border-ink-100">
                <td className="py-1 pr-2 font-medium text-ink-800">{p.label}</td>
                <td className="py-1 pr-2 text-ink-700">{STATE_LABEL[p.state]}</td>
                <td className="py-1 text-ink-500">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {entries && (
        <ul data-testid="alldata-log" className="mt-2 max-h-72 divide-y divide-ink-100 overflow-y-auto text-xs">
          {entries.length === 0 && <li className="py-2 text-ink-500">还没有记录。</li>}
          {entries.map((e) => (
            <li key={e.id} className="py-1.5">
              <span className="text-ink-500">{when(e.at)}</span> · {e.by.split("@")[0] || "—"} · <span className="font-medium text-ink-900">{ACTION_LABEL[e.action]}</span>
              {e.documentId ? ` · ${e.documentNumber ? `#${e.documentNumber}` : `单据 ${e.documentId}`}` : ""} · {RESULT_LABEL[e.result]}
              {e.errorCode ? `（${e.errorCode}）` : ""}
              <br />
              <span className="text-ink-600">{e.summary}</span>
              {e.gates.length > 0 && <span className="text-amber-800"> · 确认门：{e.gates.join("、")}{e.ownerAck ? "（老板已确认）" : ""}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
