"use client";

import { useState, type FormEvent } from "react";
import { bridgeErrorText, callAlldata, type AlldataCustomerRow } from "@/lib/workbench/alldata-bridge";
import { draftTotals, lineTotal, toAlldataDatalines, type AlldataCreated, type AlldataDraft } from "@/lib/workbench/alldata-draft";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => usd.format(value);

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
  const [busy, setBusy] = useState<"search" | "create" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const totals = draftTotals(draft);
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

  async function create() {
    if (!pick) return;
    setBusy("create");
    setError("");
    try {
      const result = await callAlldata("createEstimate", {
        customerId: pick === "none" ? null : pick.customerId,
        customerVehicleId: pick === "none" ? null : pick.customerVehicleId,
        mileageIn: draft.mileage,
        shopNote: [draft.note, `工作台 ${draft.id}`].filter(Boolean).join(" · "),
        datalines: toAlldataDatalines(draft.lines),
      });
      onCreated(result);
    } catch (e) {
      setError(bridgeErrorText(e));
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
      <p className="px-4 pt-2 text-xs text-ink-500">GST / PST 由 ALLDATA 按店里的税率自动加。</p>

      <div className="space-y-3 px-4 py-3">
        {created ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2">
            <p className="font-medium text-emerald-800">
              已在 ALLDATA 建好{created.estimateNumber ? ` Estimate #${created.estimateNumber}` : "草稿（Draft）"}
              {!created.customerAttached && "，还没有关联客户，请在 ALLDATA 里点“+ Customer”添加"}
            </p>
            <button
              type="button"
              onClick={() => void openPdf()}
              disabled={busy !== null}
              className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
            >
              {busy === "pdf" ? "正在打开…" : "打开 PDF（打印 / 下载）"}
            </button>
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

            <button
              type="button"
              onClick={() => void create()}
              disabled={busy !== null || pick === null}
              className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {busy === "create" ? "正在 ALLDATA 建单…" : "在 ALLDATA 创建估价单"}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
