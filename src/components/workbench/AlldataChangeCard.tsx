"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bridgeErrorText, callAlldata, failureCode, isUncertainWrite, type AlldataCustomerRow, type AlldataDocumentRow } from "@/lib/workbench/alldata-bridge";
import { changeDetail, checkChange, docLines, evaluateGates, planChange, type AlldataChangeRequest, type Taxes } from "@/lib/workbench/alldata-change";
import { GATE_LABEL, type GateId, type GateReleases } from "@/lib/workbench/alldata-gates";
import { logOp, type OpLogLine } from "@/lib/workbench/alldata-log-client";
import type { AlldataReadback, ReadbackCheck } from "@/lib/workbench/alldata-readback";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => usd.format(value);
const KIND = { part: "零件", labor: "工时", flat_fee: "一口价", discount: "折扣", other: "其他" } as const;

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

type CustomerPick = { customerId: number; customerVehicleId: number | null; label: string } | null;

/**
 * A proposed change to (or lookup of) an ALLDATA draft or estimate. The page reads the document from ALLDATA through
 * the extension, shows what would change and the new total, and saves only when staff press the button. Changes the
 * owner must confirm (money, a printed estimate, another customer) need a ticked confirmation first; nothing here
 * can touch an invoice, except the separate typed confirmation to create one.
 */
export function AlldataChangeCard({
  request,
  onApplied,
  isOwner = false,
  releases,
  onRelease,
  verifyReleases,
}: {
  request: AlldataChangeRequest;
  onApplied: (applied: { documentId: number; version: number }) => void;
  isOwner?: boolean;
  /** Kinds of change the owner let go ahead without his tick in this conversation. */
  releases?: GateReleases;
  /** The owner lets a kind of change go ahead (or takes that back) for this conversation. */
  onRelease?: (gate: GateId, released: boolean) => void;
  /** The releases as the server has them now; null when they can't be read. Checked before a change that relies on one. */
  verifyReleases?: () => Promise<GateReleases | null>;
}) {
  const [rows, setRows] = useState<AlldataDocumentRow[] | null>(null);
  const [documentId, setDocumentId] = useState<number | null>(request.applied?.documentId ?? request.document.documentId);
  const [doc, setDoc] = useState<AlldataReadback | null>(null);
  const [taxes, setTaxes] = useState<Taxes | null>(null);
  const [customers, setCustomers] = useState<AlldataCustomerRow[] | null>(null);
  const [pick, setPick] = useState<CustomerPick>(null);
  // The owner's tick belongs to one exact change (document version, edits, customer): any other change needs a new tick.
  const [ackFor, setAckFor] = useState("");
  const [busy, setBusy] = useState<"load" | "apply" | "convert" | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<{ ok: boolean; checks: ReadbackCheck[]; markupSaved: boolean } | null>(null);
  const [convertAsked, setConvertAsked] = useState<{ to: "estimate" | "invoice"; version: number } | null>(null);
  const [invoiceWord, setInvoiceWord] = useState("");
  const [loadTick, setLoadTick] = useState(0);
  // After a write whose outcome is unknown (the connection dropped, nothing answered) the same write is not offered
  // again until staff have looked at the document as it is now and said so.
  const [uncertain, setUncertainState] = useState(() => readFlag(request.id));
  const [uncertainAck, setUncertainAck] = useState(false);
  // Kept in this browser so reopening the card or switching conversations doesn't clear it.
  const setUncertain = (on: boolean) => {
    writeFlag(request.id, on);
    setUncertainState(on);
  };
  const [uncertainWhy, setUncertainWhy] = useState("");
  const [logNote, setLogNote] = useState("");
  const looked = useRef(false);
  const done = Boolean(request.applied) || applied !== null;

  const sequence = useRef(0);

  /** Find the document by searching (when this conversation didn't make it). */
  async function search() {
    const mine = (sequence.current += 1);
    setBusy("load");
    try {
      const result = await callAlldata("searchDocuments", { search: request.document.query });
      if (mine !== sequence.current) return;
      setRows(result.documents);
      if (result.documents.length === 1) setDocumentId(result.documents[0].documentId);
    } catch (e) {
      if (mine === sequence.current) setError(bridgeErrorText(e));
    } finally {
      if (mine === sequence.current) setBusy(null);
    }
  }

  /** Read the document and ALLDATA's tax switches; a newer read replaces an older one still in flight. */
  async function load(id: number) {
    const mine = (sequence.current += 1);
    setBusy("load");
    setError("");
    try {
      const [d, t] = await Promise.all([callAlldata("readDocument", { documentId: id }), callAlldata("readTaxSettings", {})]);
      if (mine !== sequence.current) return;
      setDoc(d);
      setTaxes(t);
      if (!looked.current) {
        looked.current = true;
        void record({ action: "lookup", documentId: d.documentId, documentNumber: d.documentNumber, detail: { after: d.totals.total }, result: "ok" });
      }
    } catch (e) {
      if (mine === sequence.current) {
        setError(bridgeErrorText(e));
        void record({ action: "failure", documentId: id, result: "failed", errorCode: failureCode(e) });
      }
    } finally {
      if (mine === sequence.current) setBusy(null);
    }
  }

  useEffect(() => {
    // Reads ALLDATA once for each document this card is pointed at (and again after a conversion).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (documentId === null) void search();
    else void load(documentId);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, loadTick]);

  const plan = useMemo(() => (doc && !done ? planChange(doc, request.ops, taxes) : null), [doc, taxes, request.ops, done]);
  const needsCustomer = Boolean(plan?.customerSearch);
  const signature = doc && plan ? JSON.stringify([doc.version, plan.edits, pick?.customerId ?? null, pick?.customerVehicleId ?? null]) : "";
  const ack = signature !== "" && ackFor === signature;
  // A conversion confirmation belongs to the document version it was asked for.
  const convert = doc && convertAsked && convertAsked.version === doc.version ? convertAsked.to : null;
  // A change that is waiting, or couldn't be placed, keeps the conversions away: the document would be locked before it is right.
  const pending = Boolean(plan && (plan.diff.length > 0 || plan.problems.length > 0 || needsCustomer));
  const gates = doc && plan ? evaluateGates(doc, plan, needsCustomer, releases) : null;
  const lines = doc ? docLines(doc) : [];
  const hasChange = Boolean(plan && (plan.diff.length > 0 || (needsCustomer && pick)));
  const ready = Boolean(
    plan &&
      taxes &&
      gates &&
      !gates.blocked &&
      plan.problems.length === 0 &&
      hasChange &&
      (!needsCustomer || pick) &&
      (gates.gates.length === 0 || ack) &&
      (!uncertain || uncertainAck) &&
      busy === null,
  );
  // The tax switches in ALLDATA Settings decide the tax on every save: say so when they differ from how this document was taxed.
  const pstNow = taxes?.pst.apply ?? null;
  const pstThen = doc ? doc.totals.pst > 0 : null;

  /** One line in the operation log; a line that can't be written is reported, never hidden. */
  async function record(line: OpLogLine) {
    const wrote = await logOp(line);
    setLogNote(wrote ? "" : "这一步没有记进操作日志（日志服务连不上）。");
  }

  async function findCustomer() {
    if (!plan?.customerSearch) return;
    setError("");
    try {
      setCustomers((await callAlldata("searchCustomers", { search: plan.customerSearch })).customers);
    } catch (e) {
      setError(bridgeErrorText(e));
    }
  }

  /** Another tab may have hit an unknown outcome on this card since this one opened: its flag is read again before any write. */
  function lockedElsewhere(): boolean {
    if (!uncertain && readFlag(request.id)) {
      setUncertain(true);
      setUncertainAck(false);
      setLoadTick((n) => n + 1);
      return true;
    }
    return false;
  }

  async function apply() {
    if (!doc || !plan || !ready || !gates || lockedElsewhere()) return;
    setBusy("apply");
    setError("");
    // A release the owner has since taken back must not be used: ask the server, not this page's copy.
    if (gates.released.length > 0) {
      const fresh = verifyReleases ? await verifyReleases() : null;
      if (!fresh || gates.released.some((g) => !fresh[g.id as GateId])) {
        setError("老板刚刚撤销了放开（或读不到当前设置），这次需要老板重新确认。请再点一次。");
        setBusy(null);
        return;
      }
    }
    const gateIds = [...gates.gates, ...gates.released].map((g) => g.id);
    const ownerAck = gates.gates.length > 0 && ack;
    const detail = changeDetail(plan);
    try {
      const saved = await callAlldata("saveDocument", {
        documentId: doc.documentId,
        expectedVersion: doc.version,
        expectedTaxes: taxes!,
        edits: plan.edits,
        ...(pick ? { customerId: pick.customerId, customerVehicleId: pick.customerVehicleId } : {}),
      });
      setUncertain(false);
      setUncertainAck(false);
      let result: OpLogLine["result"] = "ok";
      try {
        const after = await callAlldata("readDocument", { documentId: saved.documentId });
        const check = checkChange(plan, after, pick ? { customerId: pick.customerId } : {});
        const good = check.ok && saved.markupSaved;
        result = good ? "ok" : "mismatch";
        setApplied({ ok: good, checks: check.checks, markupSaved: saved.markupSaved });
        setDoc(after);
      } catch (e) {
        result = "uncertain";
        setApplied({ ok: false, checks: [], markupSaved: saved.markupSaved });
        setError(`已保存到 ALLDATA，但回读核对没有完成：${bridgeErrorText(e)}`);
      }
      await record({ action: "change", documentId: saved.documentId, documentNumber: doc.documentNumber, detail, gates: gateIds, ownerAck, result });
      // Recorded on the conversation only after the check is on screen, so the card never shows a bare "applied".
      onApplied({ documentId: saved.documentId, version: saved.version });
    } catch (e) {
      setError(bridgeErrorText(e));
      const unsure = isUncertainWrite("saveDocument", e);
      if (unsure) {
        // Look again at what ALLDATA holds now; the change is shown (or not) against that.
        setUncertain(true);
        setUncertainAck(false);
        setUncertainWhy(bridgeErrorText(e));
        setLoadTick((n) => n + 1);
      }
      await record({ action: "change", documentId: doc.documentId, documentNumber: doc.documentNumber, detail, gates: gateIds, ownerAck, result: unsure ? "uncertain" : "failed", errorCode: failureCode(e) });
    } finally {
      setBusy(null);
    }
  }

  async function convertNow() {
    if (!doc || !convert || (uncertain && !uncertainAck) || lockedElsewhere()) return;
    setBusy("convert");
    setError("");
    const action = convert === "invoice" ? "convert_invoice" : "convert_estimate";
    const detail = { after: doc.totals.total };
    try {
      const converted = await callAlldata("convertDocument", {
        documentId: doc.documentId,
        expectedVersion: doc.version,
        to: convert,
        ...(convert === "invoice" ? { confirm: `invoice:${doc.documentId}:${doc.version}` } : {}),
      });
      setConvertAsked(null);
      setInvoiceWord("");
      setApplied(null);
      setUncertain(false);
      setUncertainAck(false);
      setLoadTick((n) => n + 1);
      await record({ action, documentId: doc.documentId, documentNumber: converted.documentNumber, detail, ownerAck: convert === "invoice", result: "ok" });
    } catch (e) {
      setError(bridgeErrorText(e));
      const unsure = isUncertainWrite("convertDocument", e);
      if (unsure) {
        setConvertAsked(null);
        setInvoiceWord("");
        setUncertain(true);
        setUncertainAck(false);
        setUncertainWhy(bridgeErrorText(e));
        setLoadTick((n) => n + 1);
      }
      await record({ action, documentId: doc.documentId, documentNumber: doc.documentNumber, detail, ownerAck: convert === "invoice", result: unsure ? "uncertain" : "failed", errorCode: failureCode(e) });
    } finally {
      setBusy(null);
    }
  }

  const title = doc ? `${doc.documentNumber ? `#${doc.documentNumber}` : "草稿（无单号）"} · ${doc.state}${doc.voided ? "（已作废）" : ""}` : "";

  return (
    <article data-testid="alldata-change" className="rounded-xl border border-sky-200 bg-white text-sm shadow-sm">
      <header className="border-b border-sky-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{request.ops.length ? "ALLDATA 改单" : "ALLDATA 查单"}</p>
        <h3 className="mt-0.5 text-base font-semibold text-ink-900">{doc ? title : request.document.documentId ? `单据 ${request.document.documentId}` : `查找“${request.document.query}”`}</h3>
        {request.reason && <p className="text-xs text-ink-500">{request.reason}</p>}
      </header>

      <div className="space-y-3 px-4 py-3">
        {busy === "load" && <p className="text-xs text-ink-500">正在从 ALLDATA 读取…</p>}

        {documentId === null && rows && (
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-ink-600">{rows.length ? "选择要改的单据" : "ALLDATA 里没有找到，请换个关键词再问一次。"}</legend>
            {rows.map((r) => (
              <button
                key={r.documentId}
                type="button"
                onClick={() => setDocumentId(r.documentId)}
                className="block w-full rounded-lg border border-ink-200 px-3 py-1.5 text-left text-sm hover:border-ink-500"
              >
                {r.number ? `#${r.number}` : "草稿"} · {r.state}
                {r.voided ? "（已作废）" : ""} · {r.customerName || "无客户"} · {r.vehicle || "无车辆"}
              </button>
            ))}
          </fieldset>
        )}

        {doc && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left tabular-nums">
              <thead className="bg-ink-50 text-xs text-ink-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">类型</th>
                  <th className="px-2 py-1.5 font-medium">项目</th>
                  <th className="px-2 py-1.5 text-right font-medium">数量 / 小时</th>
                  <th className="px-2 py-1.5 text-right font-medium">单价</th>
                  <th className="px-2 py-1.5 text-right font-medium">金额</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.datalineId ?? i} className="border-t border-ink-100">
                    <td className="px-2 py-1.5 text-xs text-ink-500">{i + 1}</td>
                    <td className="px-2 py-1.5 text-xs text-ink-500">{KIND[l.kind]}</td>
                    <td className="px-2 py-1.5">
                      {l.description}
                      {l.partNumber && <span className="ml-1 font-mono text-xs text-ink-500">#{l.partNumber}</span>}
                      {!l.taxable && <span className="ml-1 text-xs text-amber-700">不计税</span>}
                      {!l.editable && <span className="ml-1 text-xs text-ink-400">（在 ALLDATA 里改）</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">{l.quantity ?? ""}</td>
                    <td className="px-2 py-1.5 text-right">{money(l.unitPrice)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ink-200 text-ink-700">
                <tr>
                  <td colSpan={5} className="px-2 py-1.5 text-right">
                    税前 {money(doc.totals.subTotal)} · 税 {money(doc.totals.tax)} · 含税合计
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">{money(doc.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {uncertain && (
          <div className="space-y-1 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900">
            <p className="font-semibold">不确定上一次有没有保存到 ALLDATA。</p>
            {uncertainWhy && <p>{uncertainWhy}</p>}
            <p>已经重新读取这张单，请对照上面的内容；如果这次改动已经在单子里，就不要再应用，免得重复。</p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={uncertainAck} onChange={(e) => setUncertainAck(e.target.checked)} />
              我看过现在的单据，确认这次改动还没保存
            </label>
          </div>
        )}


        {isOwner && onRelease && releases && Object.keys(releases).length > 0 && (
          <p className="text-xs text-ink-600">
            本次对话已放开：
            {(Object.keys(releases) as GateId[]).map((g) => (
              <span key={g} className="ml-1">
                {GATE_LABEL[g]}
                <button type="button" onClick={() => onRelease(g, false)} className="ml-1 underline">
                  撤销
                </button>
              </span>
            ))}
          </p>
        )}

        {doc && pstNow !== null && pstThen !== null && pstNow !== pstThen && !done && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ALLDATA 设置里 PST 现在是{pstNow ? "收" : "不收"}，这张单原来{pstThen ? "收了" : "没收"} PST。保存时 ALLDATA 会按现在的设置重新计税，下面的新合计已按现在的设置算。
          </p>
        )}

        {plan && gates && !done && (
          <section aria-label="将要修改的内容" className="space-y-2 rounded-lg bg-sky-50 px-3 py-2">
            {gates.blocked && <p className="font-medium text-red-700">{gates.blocked}</p>}
            {plan.problems.map((p) => (
              <p key={p} className="text-red-700">
                ⚠ {p}
              </p>
            ))}
            {plan.diff.length > 0 && (
              <ul className="space-y-1">
                {plan.diff.map((d, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink-800">{d.label}</span>：<span className="text-ink-500 line-through decoration-ink-300">{d.before}</span> → <span className="font-medium">{d.after}</span>
                  </li>
                ))}
              </ul>
            )}
            {request.ops.length > 0 && plan.diff.length === 0 && plan.problems.length === 0 && !needsCustomer && <p className="text-ink-600">这张单已经是这个样子，没有要改的。</p>}
            {request.ops.length > 0 && (
              <p>
                含税合计 {money(plan.before.total)} → <span className="font-semibold">{money(plan.predicted.total)}</span>（{gates.delta >= 0 ? "+" : "-"}
                {money(Math.abs(gates.delta))}）{plan.predicted.approximate && <span className="text-xs text-ink-500"> · 含套餐或目录行，税额为估算</span>}
              </p>
            )}

            {needsCustomer && (
              <div className="space-y-1">
                <button type="button" onClick={() => void findCustomer()} className="rounded-full border border-ink-300 px-3 py-1 text-xs font-semibold text-ink-700 hover:border-ink-500">
                  查找客户“{plan.customerSearch}”
                </button>
                {customers?.length === 0 && <p className="text-xs text-ink-500">ALLDATA 里没有找到这个客户。</p>}
                {customers?.flatMap((c) =>
                  (c.vehicles.length ? c.vehicles : [null]).map((v) => {
                    const label = `${c.name || "（无名）"} ${c.phone} · ${v ? v.description || v.vin || "车辆" : "没有车辆"}`;
                    return (
                      <label key={`${c.customerId}:${v?.customerVehicleId ?? ""}`} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name={`customer-${request.id}`}
                          checked={pick?.customerId === c.customerId && (pick?.customerVehicleId ?? null) === (v?.customerVehicleId ?? null)}
                          onChange={() => setPick({ customerId: c.customerId, customerVehicleId: v?.customerVehicleId ?? null, label })}
                        />
                        {label}
                      </label>
                    );
                  }),
                )}
              </div>
            )}

            {gates.gates.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                {gates.gates.map((g) => (
                  <p key={g.id} className="text-amber-900">
                    <span className="font-semibold">需要老板确认：{g.label}。</span>
                    {g.reason}
                    {isOwner && onRelease && g.id !== "locked" && (
                      <button type="button" onClick={() => onRelease(g.id as GateId, true)} className="ml-2 rounded-full border border-amber-500 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-100">
                        本次对话里这一类不再问我
                      </button>
                    )}
                  </p>
                ))}
                <label className="flex items-center gap-2 text-sm font-medium text-amber-900">
                  <input type="checkbox" checked={ack} onChange={(e) => setAckFor(e.target.checked ? signature : "")} />
                  老板已确认这次改动（照上面的内容）
                </label>
              </div>
            )}

            {gates.released.length > 0 && (
              <p className="text-xs text-ink-600">
                老板已对本次对话放开：{gates.released.map((g) => GATE_LABEL[g.id as GateId]).join("；")}。这次不用再勾确认。
              </p>
            )}

            {request.ops.length > 0 && (
              <button
                type="button"
                onClick={() => void apply()}
                disabled={!ready}
                className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
              >
                {busy === "apply" ? "正在 ALLDATA 保存…" : "在 ALLDATA 应用修改"}
              </button>
            )}
          </section>
        )}

        {done && (
          <div data-testid="alldata-change-result" className={`rounded-lg px-3 py-2 text-xs ${applied && !applied.ok ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
            {applied ? (
              <>
                <p className="font-semibold">
                  {applied.ok ? `已修改并回读核对：${applied.checks.length} 项全部一致` : `已保存，但回读核对有 ${applied.checks.filter((c) => !c.ok).length} 项不一致，请在 ALLDATA 里检查这张单`}
                </p>
                {!applied.markupSaved && <p>新加零件的加价没有保存成功，零件现在按进价入账，请在 ALLDATA 里改。</p>}
                <ul className="mt-1 space-y-0.5">
                  {applied.checks
                    .filter((c) => !c.ok)
                    .map((c) => (
                      <li key={c.field}>
                        {c.field}：应为 {c.expected}，ALLDATA {c.actual}
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="font-semibold">这次修改已经应用到 ALLDATA。上表是这张单现在的样子。</p>
            )}
          </div>
        )}

        {doc && doc.editable && !pending && !busy && (
          <div className="space-y-2 border-t border-ink-100 pt-3">
            <p className="text-xs font-medium text-ink-600">转成下一种单据</p>
            {convert === null && (
              <div className="flex flex-wrap gap-2">
                {doc.state === "Draft" && (
                  <button type="button" onClick={() => setConvertAsked({ to: "estimate", version: doc.version })} disabled={busy !== null || (uncertain && !uncertainAck)} className="rounded-full border border-ink-300 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-ink-500 disabled:opacity-40">
                    转成估价单（会领取单号）
                  </button>
                )}
                <button type="button" onClick={() => setConvertAsked({ to: "invoice", version: doc.version })} disabled={busy !== null || (uncertain && !uncertainAck)} className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:border-red-500 disabled:opacity-40">
                  转成发票（不可撤销）
                </button>
              </div>
            )}
            {convert === "estimate" && (
              <div className="flex flex-wrap items-center gap-2">
                <span>把这张草稿转成估价单，ALLDATA 会给它一个单号。</span>
                <button type="button" onClick={() => void convertNow()} disabled={busy !== null || (uncertain && !uncertainAck)} className="rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                  {busy === "convert" ? "正在转换…" : "确认转成估价单"}
                </button>
                <button type="button" onClick={() => setConvertAsked(null)} className="text-xs text-ink-500 underline">
                  取消
                </button>
              </div>
            )}
            {convert === "invoice" && (
              <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900">
                <p className="font-semibold">需要老板确认：开发票。</p>
                <p>
                  ALLDATA 规定发票开出后只读，不能改、不能删{doc.customerAttached ? "（可以作废，但作废后不能撤销）" : "，没挂客户的发票连作废也不行"}。这张单含税合计 {money(doc.totals.total)}。
                </p>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  输入“开发票”确认
                  <input value={invoiceWord} onChange={(e) => setInvoiceWord(e.target.value)} className="w-28 rounded-lg border border-red-300 px-2 py-1 text-sm" aria-label="输入开发票确认" />
                </label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void convertNow()} disabled={busy !== null || invoiceWord.trim() !== "开发票" || (uncertain && !uncertainAck)} className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                    {busy === "convert" ? "正在开发票…" : "确认开发票"}
                  </button>
                  <button type="button" onClick={() => setConvertAsked(null)} className="text-xs underline">
                    取消
                  </button>
                </div>
              </div>
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
