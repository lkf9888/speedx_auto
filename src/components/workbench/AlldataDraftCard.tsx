"use client";

import { useState, type FormEvent } from "react";
import { bridgeErrorText, callAlldata, failureCode, isUncertainWrite, type AlldataCustomerRow } from "@/lib/workbench/alldata-bridge";
import { logOp, type OpLogLine } from "@/lib/workbench/alldata-log-client";
import { draftTotals, lineTotal, toAlldataDatalines, type AlldataCreated, type AlldataDraft } from "@/lib/workbench/alldata-draft";
import { checkReadback, expectedTotals, type ReadbackCheck } from "@/lib/workbench/alldata-readback";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => usd.format(value);

const flagKey = (id: string) => `alldata-uncertain:${id}`;
const readFlag = (id: string): boolean => {
  try {
    return window.localStorage.getItem(flagKey(id)) === "1";
  } catch {
    return false;
  }
};
const writeFlag = (id: string, on: boolean) => {
  try {
    if (on) window.localStorage.setItem(flagKey(id), "1");
    else window.localStorage.removeItem(flagKey(id));
  } catch {
    // Not kept: the lock then lasts only while the card is open.
  }
};

type Pick = { customerId: number; customerVehicleId: number | null; label: string } | "none" | null;

/**
 * A drafted ALLDATA estimate. Staff check the lines, pick the customer from
 * ALLDATA (or none) and create it; creation runs in their own browser through
 * the SPEEDX ALLDATA extension.
 */
export function AlldataDraftCard({ draft, onCreated }: { draft: AlldataDraft; onCreated: (created: AlldataCreated) => void }) {
  const [search, setSearch] = useState(draft.customer?.phone || draft.customer?.name || "");
  const [customers, setCustomers] = useState<AlldataCustomerRow[] | null>(null);
  const [pick, setPick] = useState<Pick>(null);
  const [busy, setBusy] = useState<"search" | "create" | "draft" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const [pst, setPst] = useState<"charge" | "exempt" | null>(null);
  const [checks, setChecks] = useState<{ ok: boolean; checks: ReadbackCheck[] } | null>(null);
  const [taxNote, setTaxNote] = useState("");
  // After a create whose outcome is unknown, creating again is locked until staff have searched ALLDATA and said so.
  const [uncertain, setUncertainState] = useState(() => readFlag(draft.id));
  const [uncertainAck, setUncertainAck] = useState(false);
  // Kept in this browser so reopening the card or switching conversations doesn't clear it.
  const setUncertain = (on: boolean) => {
    writeFlag(draft.id, on);
    setUncertainState(on);
  };
  const [logNote, setLogNote] = useState("");
  const locked = uncertain && !uncertainAck;
  const totals = draftTotals(draft);
  const preview = expectedTotals(draft, pst === "charge");
  const created = draft.created;

  async function findCustomer(event: FormEvent) {
    event.preventDefault();
    if (!search.trim()) return;
    setBusy("search");
    setError("");
    try {
      const result = await callAlldata("searchCustomers", { search: search.trim() });
      setCustomers(result.customers);
    } catch (e) {
      setError(bridgeErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  /** Creates the document (a Draft, or an estimate that takes a document number), then reads it back and compares it with this card. */
  async function record(line: OpLogLine) {
    const wrote = await logOp(line);
    setLogNote(wrote ? "" : "这一步没有记进操作日志（日志服务连不上）。");
  }

  async function submit(kind: "draft" | "estimate") {
    if (!pick || !pst || locked) return;
    // Another tab may have hit an unknown outcome on this card since this one opened.
    if (!uncertain && readFlag(draft.id)) {
      setUncertain(true);
      setUncertainAck(false);
      return;
    }
    const chargePst = pst === "charge";
    setBusy(kind === "draft" ? "draft" : "create");
    setError("");
    setChecks(null);
    setTaxNote("");
    try {
      const shopNote = [draft.note, `工作台 ${draft.id}`].filter(Boolean).join(" · ");
      const args = {
        customerId: pick === "none" ? null : pick.customerId,
        customerVehicleId: pick === "none" ? null : pick.customerVehicleId,
        mileageIn: draft.mileage,
        shopNote,
        datalines: toAlldataDatalines(draft.lines),
      };
      const result = kind === "draft" ? await callAlldata("createDraft", args) : await callAlldata("createEstimate", args);
      setUncertain(false);
      setUncertainAck(false);
      onCreated(result);
      const totals = draftTotals(draft);
      const detail = { parts: draft.lines.filter((l) => l.kind === "part").length, labor: draft.lines.filter((l) => l.kind === "labor").length, subtotal: totals.subtotal };
      const base = { action: kind === "draft" ? ("create_draft" as const) : ("create_estimate" as const), documentId: result.documentId, documentNumber: result.estimateNumber || null, detail };
      try {
        const doc = await callAlldata("readDocument", { documentId: result.documentId });
        // The shop-wide tax switches in ALLDATA Settings decide the tax on every save; PST is turned on and off there.
        const taxes = await callAlldata("readTaxSettings", {}).catch(() => null);
        if (taxes && taxes.pst.apply !== chargePst) setTaxNote(`ALLDATA 设置里 PST 现在是${taxes.pst.apply ? "收" : "不收"}，和你选的不一样。税额以 ALLDATA 为准；需要的话请在 ALLDATA 里处理这张单。`);
        const check = checkReadback(draft, doc, {
          shopNote,
          mileage: draft.mileage,
          customerAttached: result.customerAttached,
          chargePst,
          state: result.estimateNumber > 0 ? "Estimate" : "Draft",
          ...(taxes ? { rates: { gst: taxes.gst.apply ? taxes.gst.rate / 100 : 0, pst: taxes.pst.rate / 100 } } : {}),
        });
        setChecks(check);
        await record({ ...base, result: check.ok && result.markupSaved !== false ? "ok" : "mismatch" });
      } catch (e) {
        setError(`单据已建好，但回读核对没有完成：${bridgeErrorText(e)}`);
        await record({ ...base, result: "uncertain", errorCode: failureCode(e) });
      }
    } catch (e) {
      setError(bridgeErrorText(e));
      const unsure = isUncertainWrite(kind === "draft" ? "createDraft" : "createEstimate", e);
      if (unsure) {
        setUncertain(true);
        setUncertainAck(false);
      }
      await record({ action: kind === "draft" ? "create_draft" : "create_estimate", result: unsure ? "uncertain" : "failed", errorCode: failureCode(e) });
    } finally {
      setBusy(null);
    }
  }

  async function openPdf() {
    if (!created) return;
    setBusy("pdf");
    setError("");
    try {
      await callAlldata("openPdf", { documentId: created.documentId, documentType: "Estimate" });
    } catch (e) {
      setError(bridgeErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article data-testid="alldata-draft" className="rounded-xl border border-emerald-200 bg-white text-sm shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-emerald-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">ALLDATA 估价单草稿</p>
          <h3 className="mt-0.5 text-base font-semibold text-ink-900">{draft.title}</h3>
          <p className="text-xs text-ink-500">
            {[draft.vehicle, draft.vin && `VIN ${draft.vin}`, draft.mileage !== null && `${draft.mileage.toLocaleString()} km`].filter(Boolean).join(" · ") || "未填车辆"}
            {draft.customer && ` · 客户：${[draft.customer.name, draft.customer.phone].filter(Boolean).join(" ")}`}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-ink-400">{draft.id}</span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left tabular-nums">
          <thead className="bg-ink-50 text-xs text-ink-500">
            <tr>
              <th className="px-3 py-2 font-medium">类型</th>
              <th className="px-3 py-2 font-medium">项目</th>
              <th className="px-3 py-2 text-right font-medium">数量 / 小时</th>
              <th className="px-3 py-2 text-right font-medium">单价</th>
              <th className="px-3 py-2 text-right font-medium">金额</th>
              <th className="px-3 py-2 text-right font-medium">进价</th>
            </tr>
          </thead>
          <tbody>
            {draft.lines.map((line, i) => (
              <tr key={i} className="border-t border-ink-100">
                <td className="px-3 py-2 text-xs text-ink-500">{line.kind === "labor" ? "工时" : "零件"}</td>
                <td className="px-3 py-2">
                  {line.description}
                  {line.partNumber && <span className="ml-1 font-mono text-xs text-ink-500">#{line.partNumber}</span>}
                  {!line.taxable && <span className="ml-1 text-xs text-amber-700">免税</span>}
                </td>
                <td className="px-3 py-2 text-right">{line.quantity}</td>
                <td className="px-3 py-2 text-right">{money(line.unitPrice)}</td>
                <td className="px-3 py-2 text-right font-semibold">{money(lineTotal(line))}</td>
                <td className="px-3 py-2 text-right text-ink-500">{line.unitCost === null ? "—" : money(line.unitCost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-ink-200 text-ink-700">
            <tr>
              <td colSpan={4} className="px-3 py-2 text-right">
                零件 {money(totals.parts)} · 工时 {money(totals.labor)} · 税前合计
              </td>
              <td className="px-3 py-2 text-right font-semibold">{money(totals.subtotal)}</td>
              <td className="px-3 py-2 text-right text-ink-500">{totals.cost === null ? "" : money(totals.cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-4 pt-2 text-xs text-ink-500">
        GST / PST 由 ALLDATA 按店里的税率自动加。税额预览（仅供参考，以 ALLDATA 回读为准）：GST {money(preview.gst)}
        {pst === "charge" ? ` · PST ${money(preview.pst)}` : pst === "exempt" ? " · 不收 PST" : " · PST 待选"} · 含税合计 {money(preview.total)}
      </p>

      <div className="space-y-3 px-4 py-3">
        {created ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2">
            <p className="font-medium text-emerald-800">
              已在 ALLDATA 建好{created.estimateNumber ? ` Estimate #${created.estimateNumber}` : "草稿（Draft）"}
              {!created.customerAttached && "，还没有关联客户，请在 ALLDATA 里点“+ Customer”添加"}
            </p>
            {created.markupSaved === false && (
              <p role="alert" className="w-full font-medium text-amber-800">
                零件的加价没有保存成功，零件现在按进价入账（单据保持草稿，没有转估价单）。请在 ALLDATA 里打开这张草稿检查零件价格，不要重复创建。
              </p>
            )}
            {created.estimateNumber > 0 && (
              <button
                type="button"
                onClick={() => void openPdf()}
                disabled={busy !== null}
                className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
              >
                {busy === "pdf" ? "正在打开…" : "打开 PDF（打印 / 下载）"}
              </button>
            )}
          </div>
        ) : (
          <>
            <form onSubmit={(e) => void findCustomer(e)} className="flex flex-wrap items-center gap-2">
              <label htmlFor={`customer-${draft.id}`} className="text-xs font-medium text-ink-600">
                ALLDATA 客户
              </label>
              <input
                id={`customer-${draft.id}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="电话或姓名"
                className="min-w-[12rem] flex-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
              />
              <button type="submit" disabled={busy !== null || !search.trim()} className="rounded-full border border-ink-300 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-ink-500 disabled:opacity-40">
                {busy === "search" ? "查找中…" : "查找"}
              </button>
            </form>

            <fieldset className="space-y-1">
              <legend className="sr-only">选择客户和车辆</legend>
              {customers?.length === 0 && <p className="text-xs text-ink-500">ALLDATA 里没有找到这个客户。可以不关联客户先建单，再到 ALLDATA 里新建客户。</p>}
              {customers?.flatMap((c) => {
                const vehicles = c.vehicles.length ? c.vehicles : [null];
                return vehicles.map((v) => {
                  const value = `${c.customerId}:${v?.customerVehicleId ?? ""}`;
                  const label = `${c.name || "（无名）"} ${c.phone} · ${v ? v.description || v.vin || "车辆" : "没有车辆"}`;
                  const checked = pick !== null && pick !== "none" && `${pick.customerId}:${pick.customerVehicleId ?? ""}` === value;
                  return (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`pick-${draft.id}`}
                        checked={checked}
                        onChange={() => setPick({ customerId: c.customerId, customerVehicleId: v?.customerVehicleId ?? null, label })}
                      />
                      {label}
                    </label>
                  );
                });
              })}
              <label className="flex items-center gap-2 text-sm text-ink-600">
                <input type="radio" name={`pick-${draft.id}`} checked={pick === "none"} onChange={() => setPick("none")} />
                不关联客户（之后在 ALLDATA 里添加）
              </label>
            </fieldset>

            <fieldset className="flex flex-wrap items-center gap-3">
              <legend className="sr-only">PST</legend>
              <span className="text-xs font-medium text-ink-600">PST（必选，用于预览和核对）</span>
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" name={`pst-${draft.id}`} checked={pst === "charge"} disabled={busy !== null} onChange={() => setPst("charge")} />收 PST
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" name={`pst-${draft.id}`} checked={pst === "exempt"} disabled={busy !== null} onChange={() => setPst("exempt")} />不收（如公司客户有 PST#）
              </label>
            </fieldset>
            <p className="text-xs text-ink-500">草稿只存在 ALLDATA 里，不发给客人、不收款、不占单号；建好后会读回来逐项核对。工作台不改 ALLDATA 的税设置：如果这里选了“收 PST”而 ALLDATA 没收，核对会标出来，请在 ALLDATA 里处理。</p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void submit("draft")}
                disabled={busy !== null || pick === null || pst === null || locked}
                className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
              >
                {busy === "draft" ? "正在 ALLDATA 建草稿…" : "在 ALLDATA 创建草稿并核对"}
              </button>
              <button
                type="button"
                onClick={() => void submit("estimate")}
                disabled={busy !== null || pick === null || pst === null || locked}
                className="rounded-full border border-ink-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-ink-500 disabled:opacity-40"
              >
                {busy === "create" ? "正在 ALLDATA 建单…" : "在 ALLDATA 创建估价单"}
              </button>
            </div>
          </>
        )}
        {uncertain && !created && (
          <div className="space-y-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">
            <p className="font-semibold">不确定 ALLDATA 里有没有建出来。先不要再建。</p>
            <p>请到“ALLDATA 单据”里按备注里的 “工作台 {draft.id}” 搜一下；搜到了就用那张，不要重复创建。</p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={uncertainAck} onChange={(e) => setUncertainAck(e.target.checked)} />
              我已经搜过，确实没有建出来
            </label>
          </div>
        )}
        {taxNote && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{taxNote}</p>}
        {checks && (
          <div data-testid="alldata-readback" className={`rounded-lg px-3 py-2 text-xs ${checks.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            <p className="font-semibold">
              {checks.ok ? `回读核对：${checks.checks.length} 项全部一致` : `回读核对：${checks.checks.filter((c) => !c.ok).length} 项不一致，请在 ALLDATA 里检查这张草稿`}
            </p>
            {!checks.ok && (
              <ul className="mt-1 space-y-0.5">
                {checks.checks
                  .filter((c) => !c.ok)
                  .map((c) => (
                    <li key={c.field}>
                      {c.field}：卡上 {c.expected}，ALLDATA {c.actual}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {logNote && <p className="text-xs text-amber-800">{logNote}</p>}
      </div>
    </article>
  );
}
