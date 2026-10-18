"use client";

import { useState } from "react";
import { optionLinks, type ProductLink } from "@/lib/workbench/links";
import { finalCustomerText, priceOption, withFinalPrices } from "@/lib/workbench/final-price";
import { staffName } from "@/lib/workbench/conversation-types";
import type { StaffQuote } from "@/lib/workbench/quote";
import { surchargeOf } from "@/lib/workbench/surcharge";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number | null) => (value === null ? "—" : usd.format(value));
const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

const KIND_LABEL: Record<StaffQuote["kind"], string> = {
  labor: "工时 + 零件",
  flat: "店内一口价",
  tires: "新轮胎",
  team_quote: "对外不报价",
};

/** Buttons that open the part at the supplier or on marketplaces, in a new tab. */
function ProductLinks({ links }: { links: ProductLink[] }) {
  const [copied, setCopied] = useState("");
  if (links.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.copy ? `复制零件号 ${link.copy}，再打开 ${link.label} 粘贴搜索` : `在 ${link.label} 打开`}
          onClick={() => {
            if (!link.copy) return;
            void navigator.clipboard?.writeText(link.copy).then(
              () => setCopied(link.copy!),
              () => setCopied(""),
            );
          }}
          className="rounded-full border border-ink-200 px-2 py-0.5 text-[11px] font-medium text-ink-600 hover:border-brand-400 hover:text-brand-700"
        >
          {link.label} ↗
        </a>
      ))}
      {copied && <span className="text-[11px] text-emerald-700">已复制 {copied}，在 speedDIAL 搜索框粘贴</span>}
    </div>
  );
}

type Totals = Record<string, number> | null;

/**
 * One staff quote: every option with cost and margin, and a customer-safe text
 * and PDF. Staff can change the customer prices after bargaining ("改价"); the
 * agreed prices are saved for everyone and used for the text and the PDF.
 */
export function StaffQuoteCard({ quote, onSaveFinal }: { quote: StaffQuote; onSaveFinal?: (totals: Totals) => Promise<boolean> }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const [raw, setRaw] = useState(false);
  /** Options left out of the customer text (unticked); out-of-stock ones start unticked so they aren't copied by accident. */
  const [left, setLeft] = useState<Set<number>>(() => new Set(quote.options.flatMap((o, i) => (o.outOfStock ? [i] : []))));
  /** Price inputs while editing, by option index. */
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [pdf, setPdf] = useState<{ state: "idle" | "making" | "failed" } | { state: "ready"; file: File }>({ state: "idle" });

  const priced = withFinalPrices(quote);
  const draftTotal = (i: number) => {
    const value = editing?.[String(i)];
    const n = value === undefined || value.trim() === "" ? NaN : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  // While editing, the row shows what the typed price would give.
  const rows = editing ? quote.options.map((o, i) => priceOption(quote, o, draftTotal(i))) : priced.options;
  const chosen = priced.options.filter((_, i) => !left.has(i));
  const textForCustomer = finalCustomerText(quote, (i) => !left.has(i));

  function startEditing() {
    setNotice("");
    setEditing(Object.fromEntries(priced.options.map((o, i) => [String(i), o.customerTotal.toFixed(2)])));
  }

  async function saveFinal(totals: Totals) {
    if (!onSaveFinal) return;
    setSaving(true);
    setNotice("");
    const ok = await onSaveFinal(totals).catch(() => false);
    setSaving(false);
    if (ok) {
      setEditing(null);
      setPdf({ state: "idle" });
      setNotice(totals ? "最终价已保存，复制和 PDF 都按最终价" : "已恢复 AI 报价");
    } else {
      setNotice("保存失败，请稍后再试");
    }
  }

  function saveEdits() {
    const totals: Record<string, number> = {};
    for (let i = 0; i < quote.options.length; i += 1) {
      const value = draftTotal(i);
      if (value === undefined) {
        setNotice("每个价格都要填一个数字");
        return;
      }
      totals[String(i)] = Math.round(value * 100) / 100;
    }
    void saveFinal(totals);
  }

  async function makePdf() {
    setPdf({ state: "making" });
    try {
      const { downloadFile, quotePdf } = await import("@/lib/workbench/quote-pdf");
      const file = await quotePdf({ ...priced, options: chosen });
      downloadFile(file);
      setPdf({ state: "ready", file });
    } catch {
      setPdf({ state: "failed" });
    }
  }

  async function sharePdf(file: File) {
    try {
      await navigator.share({ files: [file], title: `SPEEDX AUTO ${quote.id}` });
    } catch {
      // Cancelled, or the browser can't share files: the PDF was already downloaded.
    }
  }
  const canShare = pdf.state === "ready" && typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [pdf.file] });

  async function copyForCustomer() {
    try {
      await navigator.clipboard.writeText(textForCustomer);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  const showCost = quote.kind === "labor" || quote.kind === "tires";

  return (
    <article data-testid="staff-quote" className="rounded-xl border border-ink-200 bg-white text-sm shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{KIND_LABEL[quote.kind]}</p>
          <h3 className="mt-0.5 text-base font-semibold text-ink-900">
            {quote.service}
            {quote.position ? ` · ${quote.position}` : ""}
          </h3>
          <p className="text-xs text-ink-500">{quote.vehicle}</p>
          {quote.final && (
            <p data-testid="final-badge" className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              最终价 · {staffName(quote.final.by)} 修改
            </p>
          )}
        </div>
        <span className="shrink-0 font-mono text-xs text-ink-400">{quote.id}</span>
      </header>

      {quote.labor && (
        <p className="border-b border-ink-100 px-4 py-2 text-ink-700">
          工时 <b className="tabular-nums">{quote.labor.hours} h</b> × {money(quote.labor.rate)} ={" "}
          <b className="tabular-nums">{money(quote.labor.walkIn)}</b>
          <span className="text-ink-500"> · 推荐价 {money(quote.labor.referral)}</span>
        </p>
      )}

      {quote.options.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left tabular-nums">
            <thead className="bg-ink-50 text-xs text-ink-500">
              <tr>
                <th className="px-3 py-2 font-medium">选项</th>
                <th className="px-3 py-2 font-medium">数量</th>
                <th className="px-3 py-2 text-right font-medium">{quote.kind === "tires" ? "每条（含安装）" : quote.kind === "labor" ? "零件售价" : "单价"}</th>
                {showCost && <th className="px-3 py-2 text-right font-medium">进价</th>}
                {showCost && <th className="px-3 py-2 text-right font-medium">加价</th>}
                <th className="px-3 py-2 text-right font-medium">{quote.kind === "labor" && quote.labor ? "客户总价（零件+工时）" : "客户总价"}</th>
                {quote.kind === "labor" && <th className="px-3 py-2 text-right font-medium">推荐价</th>}
                {showCost && <th className="px-3 py-2 text-right font-medium">毛利</th>}
                {showCost && <th className="px-3 py-2 text-right font-medium">毛利率</th>}
                <th className="px-3 py-2 font-medium">库存 / 类别</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={`${o.label}-${i}`} className="border-t border-ink-100 align-top">
                  <td className="px-3 py-2">
                    {quote.options.length > 1 && (
                      <label className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-500">
                        <input
                          type="checkbox"
                          checked={!left.has(i)}
                          onChange={() =>
                            setLeft((current) => {
                              const next = new Set(current);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            })
                          }
                          aria-label={`复制给客人时包含 ${[o.brand, o.label].filter(Boolean).join(" ")}${o.partNumber ? ` #${o.partNumber}` : ""}`}
                        />
                        给客人
                      </label>
                    )}
                    <div className="font-medium text-ink-900">{[o.brand, o.label].filter(Boolean).join(" ")}</div>
                    {o.partNumber && <div className="font-mono text-xs text-ink-500">#{o.partNumber}</div>}
                    {o.core !== null && <div className="text-xs text-amber-700">核心件押金 {money(o.core)}</div>}
                    <ProductLinks links={optionLinks(quote, o)} />
                  </td>
                  <td className="px-3 py-2">{o.quantity}</td>
                  <td className="px-3 py-2 text-right">{money(o.unitPrice)}</td>
                  {showCost && <td className="px-3 py-2 text-right">{money(o.unitCost)}</td>}
                  {showCost && (
                    <td data-testid="surcharge" className="px-3 py-2 text-right text-ink-600">
                      {surchargeOf(quote, quote.options[i]) === null ? "—" : `+${Math.round(surchargeOf(quote, quote.options[i])! * 100)}%`}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-semibold text-ink-900">
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={editing[String(i)] ?? ""}
                        onChange={(e) => setEditing((current) => ({ ...(current ?? {}), [String(i)]: e.target.value }))}
                        aria-label={`最终价 ${[o.brand, o.label].filter(Boolean).join(" ")}`}
                        className="w-28 rounded-md border border-ink-300 px-2 py-1 text-right font-semibold focus:border-brand-500 focus:outline-none"
                      />
                    ) : (
                      money(o.customerTotal)
                    )}
                    {o.originalTotal !== null && <div className="text-[11px] font-normal text-ink-400 line-through">{money(o.originalTotal)}</div>}
                  </td>
                  {quote.kind === "labor" && <td className="px-3 py-2 text-right text-ink-600">{money(o.referralTotal)}</td>}
                  {showCost && <td className="px-3 py-2 text-right">{money(o.profit)}</td>}
                  {showCost && (
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        o.margin === null ? "text-ink-400" : o.margin < 0.25 ? "text-amber-700" : "text-emerald-700"
                      }`}
                    >
                      {percent(o.margin)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-xs text-ink-600">{o.stock || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quote.notes.length > 0 && (
        <ul className="space-y-1 border-t border-ink-100 px-4 py-3 text-xs leading-5 text-ink-600">
          {quote.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
          {quote.kind === "labor" && <li>• 进价按 WorldPac 字段 {quote.costField} 计算。</li>}
        </ul>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-3">
        {editing ? (
          <>
            <button type="button" disabled={saving} onClick={saveEdits} className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {saving ? "保存中…" : "保存最终价"}
            </button>
            <button type="button" disabled={saving} onClick={() => setEditing(null)} className="rounded-full border border-ink-200 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
              取消
            </button>
            {quote.final && (
              <button type="button" disabled={saving} onClick={() => void saveFinal(null)} className="rounded-full border border-ink-200 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
                恢复 AI 报价
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void copyForCustomer()}
              disabled={chosen.length === 0}
              className="rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
            >
              {left.size === 0 ? "复制客户报价" : `复制客户报价（${chosen.length} 个选项）`}
            </button>
            {quote.options.length > 0 && (
              <button
                type="button"
                onClick={() => void makePdf()}
                disabled={chosen.length === 0 || pdf.state === "making"}
                className="rounded-full border border-ink-900 px-4 py-1.5 text-xs font-semibold text-ink-900 hover:bg-ink-50 disabled:opacity-50"
              >
                {pdf.state === "making" ? "正在生成 PDF…" : "下载 PDF 报价单"}
              </button>
            )}
            {pdf.state === "ready" && canShare && (
              <button type="button" onClick={() => void sharePdf(pdf.file)} className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                发给客人（WhatsApp / 微信）
              </button>
            )}
            {onSaveFinal && quote.options.length > 0 && (
              <button type="button" onClick={startEditing} className="rounded-full border border-amber-400 px-4 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50">
                ✎ 改价
              </button>
            )}
          </>
        )}
        {notice && <span className="text-xs text-amber-800">{notice}</span>}
        {pdf.state === "ready" && <span className="text-xs text-emerald-700">已下载 {pdf.file.name}{canShare ? "" : "，可在 WhatsApp / 微信里作为文件发给客人"}</span>}
        {pdf.state === "failed" && <span className="text-xs text-amber-700">PDF 生成失败，请再试一次</span>}
        {copied === "done" && <span className="text-xs text-emerald-700">已复制，可直接粘贴给客人（不含进价）</span>}
        {copied === "failed" && <span className="text-xs text-amber-700">浏览器不允许复制，请在下面手动选择文字</span>}
        {quote.kind === "labor" && (
          <button
            type="button"
            onClick={() => setRaw((v) => !v)}
            className="rounded-full border border-ink-200 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            {raw ? "隐藏原始字段" : "显示 WorldPac 原始字段"}
          </button>
        )}
      </footer>

      {copied === "failed" && (
        <pre className="mx-4 mb-3 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs">{textForCustomer}</pre>
      )}

      {raw && (
        <div className="space-y-3 border-t border-ink-100 px-4 py-3 text-xs">
          {quote.options.map((o, i) => (
            <div key={`raw-${i}`} className="overflow-x-auto">
              <p className="font-medium text-ink-800">{o.label}</p>
              <p className="mt-1 font-mono text-ink-600">
                {Object.entries(o.prices)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("  ")}
              </p>
              <p className="mt-1 font-mono text-ink-400">
                {Object.entries(o.fields)
                  .map(([k, v]) => `${k}=${v}`)
                  .join("  ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
