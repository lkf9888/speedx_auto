"use client";

import { useState, type FormEvent } from "react";
import { bridgeErrorText, callAlldata, type AlldataDocumentRow, type AlldataDocumentType } from "@/lib/workbench/alldata-bridge";

const PDF_LABEL: Record<AlldataDocumentType, string> = {
  Estimate: "估价单",
  RepairOrder: "工单",
  Invoice: "发票 / 收据",
};

const STATE_LABEL: Record<string, string> = {
  Draft: "草稿",
  Estimate: "估价单",
  "Repair Order": "工单",
  RepairOrder: "工单",
  Invoice: "发票",
};

const day = (at: number) => (at ? new Date(at).toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }) : "");

/** Find past ALLDATA documents and open their PDFs to print or download. */
export function AlldataDocuments({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [documents, setDocuments] = useState<AlldataDocumentRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await callAlldata("searchDocuments", { search: search.trim() });
      setDocuments(result.documents);
    } catch (e) {
      setError(bridgeErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function open(documentId: number, documentType: AlldataDocumentType) {
    setError("");
    try {
      await callAlldata("openPdf", { documentId, documentType });
    } catch (e) {
      setError(bridgeErrorText(e));
    }
  }

  return (
    <section aria-label="ALLDATA 单据" className="rounded-xl border border-ink-200 bg-white text-sm shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink-900">ALLDATA 单据</h2>
          <p className="text-xs text-ink-500">按客户姓名、电话、单号或车辆查找；PDF 在新标签页打开，可以打印或下载。</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭 ALLDATA 单据" className="rounded px-2 text-lg text-ink-500 hover:text-ink-900">
          ×
        </button>
      </header>
      <form onSubmit={(e) => void find(e)} className="flex gap-2 px-4 py-3">
        <label htmlFor="alldata-search" className="sr-only">
          查找单据
        </label>
        <input
          id="alldata-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="例如 953、Kaiyu、604…；留空看最近的单据"
          className="flex-1 rounded-lg border border-ink-200 px-3 py-1.5 focus:border-brand-400 focus:outline-none"
        />
        <button type="submit" disabled={busy} className="rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40">
          {busy ? "查找中…" : "查找"}
        </button>
      </form>
      {error && (
        <p role="alert" className="px-4 pb-3 text-red-700">
          {error}
        </p>
      )}
      {documents && (
        <ul className="max-h-[28rem] divide-y divide-ink-100 overflow-y-auto border-t border-ink-100">
          {documents.length === 0 && <li className="px-4 py-3 text-ink-500">没有找到单据。</li>}
          {documents.map((d) => (
            <li key={d.documentId} data-testid="alldata-document" className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">
                  #{d.number} · {STATE_LABEL[d.state] ?? d.state}
                  {d.voided && <span className="ml-1 text-xs text-red-700">已作废</span>}
                  <span className="ml-2 text-xs font-normal text-ink-500">{day(d.updatedOn)}</span>
                </p>
                <p className="truncate text-xs text-ink-500">{[d.customerName || "无客户", d.vehicle].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {d.printable.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => void open(d.documentId, type)}
                    className="rounded-full border border-ink-300 px-3 py-1 text-xs text-ink-700 hover:border-brand-400 hover:text-brand-700"
                  >
                    {PDF_LABEL[type]} PDF
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
