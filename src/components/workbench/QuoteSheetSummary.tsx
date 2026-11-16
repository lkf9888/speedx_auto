"use client";

import { useState } from "react";
import { withFinalPrices } from "@/lib/workbench/final-price";
import {
  tierLabor,
  atTier,
  describePricing,
  EXTRA_MAX,
  EXTRA_STEP,
  extraPctOf,
  laborWithExtra,
  priceLabel,
  LABOR_MAX,
  LABOR_MIN,
  LABOR_STEP,
  PARTS_STEP,
  PRESET_PRICING,
  QUICK_TIERS,
  TIER_HINT,
  TIER_LABEL,
  type CustomPricing,
  type PriceTier,
} from "@/lib/workbench/price-tier";
import { orderLine } from "@/lib/workbench/links";
import { supplierLabel, type StaffQuote } from "@/lib/workbench/quote";
import { taxOn } from "@/lib/workbench/tax";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => usd.format(value);
const cents = (value: number) => Math.round(value * 100) / 100;

/** A quote at the chosen price with agreed prices applied, and the options in stock. */
function inStock(quote: StaffQuote, tier: PriceTier, custom: CustomPricing | null | undefined, labelled: boolean) {
  const priced = withFinalPrices(atTier(quote, tier, custom));
  return priced.options.flatMap((o, i) => (quote.options[i].outOfStock ? [] : [{ key: `${quote.id}:${i}`, quote, option: o, note: labelled ? quote.vehicle : "" }]));
}

const jobName = (q: StaffQuote) => (q.kind === "tires" ? "新轮胎（含安装）" : `${q.service}${q.position ? ` · ${q.position}` : ""}`);
/** Staff see the part number; the customer copy doesn't (it would let them shop the part elsewhere). */
const optionName = (o: { brand: string; label: string; partNumber: string; source?: string }, withNumber = true) =>
  [o.brand, o.label].filter(Boolean).join(" ") + (withNumber && o.partNumber ? ` #${o.partNumber}` : "") + (!withNumber && o.source === "used" ? "（二手件，质保以卖家陈述为准）" : "");

/**
 * The jobs in one reply. Cards for the same job are alternatives, not extras
 * (one per engine when the engine isn't known, or new tires from two
 * suppliers), so they share one row and only one of their options counts.
 */
function jobsOf(quotes: StaffQuote[], tier: PriceTier, custom: CustomPricing | null | undefined) {
  const groups = new Map<string, StaffQuote[]>();
  for (const quote of quotes) {
    if (quote.kind === "team_quote") continue;
    const key = quote.kind === "tires" ? "tires" : `${quote.service}|${quote.position}`;
    groups.set(key, [...(groups.get(key) ?? []), quote]);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    name: jobName(group[0]),
    // A used-part search card that has no price yet is only links; its labor-only line must not stand in for the new-part price.
    options: group.flatMap((q) => (group.length > 1 && q.used && !q.options.some((o) => o.source === "used") ? [] : inStock(q, tier, custom, group.length > 1 && q.kind !== "tires"))),
  }));
}

/**
 * Every job quoted in one reply on one sheet (Kevin, 2026-11-14: front and
 * rear rotors as one quote): one option per job, cheapest in stock first, and
 * the grand total at the conversation's price, with a customer copy.
 */
export function QuoteSheetSummary({ quotes, tier, custom }: { quotes: StaffQuote[]; tier: PriceTier; custom?: CustomPricing | null }) {
  const jobs = jobsOf(quotes, tier, custom);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const lines = jobs.map((job) => {
    // A used part is only quoted when staff pick it (or when nothing new can be had).
    const choices = job.options.some((o) => o.option.source !== "used") ? job.options.filter((o) => o.option.source !== "used") : job.options;
    const cheapest = choices.reduce<(typeof job.options)[number] | null>((best, o) => (!best || o.option.customerTotal < best.option.customerTotal ? o : best), null);
    const chosen = job.options.find((o) => o.key === picked[job.key]) ?? cheapest;
    return { ...job, chosen };
  });
  /** Labor at the shop's $120/h list price, what this price charges, and the discount (Kevin, 2026-11-15). */
  const laborOf = (l: (typeof lines)[number]) => {
    const labor = l.chosen?.quote.labor;
    if (!l.chosen || !labor || l.chosen.option.originalTotal != null) return null;
    const charged = tierLabor(l.chosen.quote, tier, custom) ?? labor.walkIn;
    const { hours, list } = laborWithExtra(labor, custom);
    const discount = cents(list - charged);
    return discount > 0.004 && l.chosen.option.customerTotal >= charged ? { hours, list, charged, discount, pct: Math.round((discount / list) * 100) } : null;
  };
  const discountTotal = cents(lines.reduce((sum, l) => sum + (laborOf(l)?.discount ?? 0), 0));
  const priced = lines.filter((l) => l.chosen);
  const total = cents(priced.reduce((sum, l) => sum + l.chosen!.option.customerTotal, 0));
  const taxed = taxOn(total);
  const vehicle = quotes.find((q) => q.vehicle && q.vehicle !== "—")?.vehicle ?? "—";

  // Kevin, 2026-11-14: a job with no price yet can still go out, marked 待补价.
  const pending = lines.filter((l) => !l.chosen);
  const eta = (l: (typeof lines)[number]) => (l.chosen?.option.eta ? `（需调货，${l.chosen.option.eta}）` : "");
  const text = [
    "【SPEEDX AUTO 维修报价】",
    `车辆：${vehicle}`,
    ...lines.map((l, i) =>
      l.chosen ? `${i + 1}. ${l.name}：${optionName(l.chosen.option, false)}，$${l.chosen.option.customerTotal.toFixed(2)}${eta(l)}` : `${i + 1}. ${l.name}：待补价（零件确认后补报）`,
    ),
    ...(discountTotal > 0 ? [`工时按 $120/h 原价，已优惠 −$${discountTotal.toFixed(2)}`] : []),
    `${pending.length ? "已报价部分合计" : "合计"}（税前）：$${total.toFixed(2)}`,
    `GST 5%：$${taxed.gst.toFixed(2)}　PST 7%：$${taxed.pst.toFixed(2)}`,
    `税后${pending.length ? "合计（已报价部分）" : "合计"}：$${taxed.total.toFixed(2)}`,
    "以上为参考价，最终以到店检查为准。",
    `报价编号 ${priced.map((l) => l.chosen!.quote.id).join(" / ")}`,
  ].join("\n");
  // Parts to order (Kevin, 2026-11-16): the chosen option of each job, grouped by supplier. Staff only: it carries the cost.
  const orderRows = priced.flatMap((l) => {
    const o = l.chosen!.option;
    const q = l.chosen!.quote;
    return q.kind === "labor" && o.partNumber && o.source !== "used" && !o.outOfStock ? [{ supplier: (supplierLabel(q, o) || "供货商未知").split(" · ")[0], line: orderLine(q, o), job: l.name }] : [];
  });
  const orderText = [
    "【订货单（内部，含进价，别发给客人）】",
    `车辆：${vehicle}`,
    ...[...new Set(orderRows.map((r) => r.supplier))].flatMap((supplier) => [`■ ${supplier}`, ...orderRows.filter((r) => r.supplier === supplier).map((r) => `  - ${r.job}：${r.line}`)]),
    "（在供货商页面搜零件号、加购物车、核对后自己提交；这里不会替你下单。）",
  ].join("\n");
  const [orderCopied, setOrderCopied] = useState<"idle" | "done" | "failed">("idle");
  const [pdf, setPdf] = useState<"idle" | "making" | "failed">("idle");
  const [image, setImage] = useState<"idle" | "making" | "failed">("idle");
  const sheetFor = () => ({
    rows: lines.map((l) => ({
      labor: l.chosen?.quote.labor && l.chosen.option.originalTotal == null ? { ...laborWithExtra(l.chosen.quote.labor, custom), charged: tierLabor(l.chosen.quote, tier, custom) ?? l.chosen.quote.labor.walkIn } : null,
      label: `${l.name}${l.chosen ? ` – ${[l.chosen.option.brand, l.chosen.option.label].filter(Boolean).join(" ")}${l.chosen.option.source === "used" ? " (used part, warranty as stated by the seller)" : ""}` : ""}`,
      amount: l.chosen ? l.chosen.option.customerTotal : null,
      ...(l.chosen?.option.eta ? { note: "special order" } : {}),
    })),
    total,
  });
  const estimate = () => {
    const first = priced[0]?.chosen?.quote ?? quotes[0];
    return { ...withFinalPrices(first), id: priced.map((l) => l.chosen!.quote.id).join("-") || first.id, vehicle };
  };
  async function makeImage() {
    setImage("making");
    try {
      const { downloadFile, quoteImage } = await import("@/lib/workbench/quote-pdf");
      downloadFile(await quoteImage(estimate(), new Date(), sheetFor()));
      setImage("idle");
    } catch {
      setImage("failed");
    }
  }
  async function makePdf() {
    setPdf("making");
    try {
      const { downloadFile, quotePdf } = await import("@/lib/workbench/quote-pdf");
      downloadFile(await quotePdf(estimate(), new Date(), sheetFor()));
      setPdf("idle");
    } catch {
      setPdf("failed");
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  // The sums on the side panel: parts, labor at the $120/h list price (with any extra hours) and what the price charges for it.
  const withLabor = lines.flatMap((l) => {
    const labor = l.chosen?.quote.labor;
    if (!l.chosen || !labor || l.chosen.option.originalTotal != null) return [];
    const charged = tierLabor(l.chosen.quote, tier, custom) ?? labor.walkIn;
    return l.chosen.option.customerTotal >= charged ? [{ list: laborWithExtra(labor, custom).list, charged }] : [];
  });
  const laborList = cents(withLabor.reduce((sum, l) => sum + l.list, 0));
  const laborCharged = cents(withLabor.reduce((sum, l) => sum + l.charged, 0));
  const kv = "flex items-baseline justify-between gap-3 text-[13px] text-slate-200";
  const asideBtn = "rounded-lg border border-slate-500 bg-[#2b3648] px-3 py-2 text-center text-xs font-semibold text-white hover:bg-[#364258] disabled:opacity-50";

  return (
    <article data-testid="quote-sheet" className="overflow-hidden rounded-xl border-2 border-brand-200 bg-white text-sm shadow-sm">
      <div className="grid md:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="min-w-0">
          <header className="px-4 py-3">
            <p className="text-base font-semibold text-ink-900">{vehicle}</p>
            <p className="mt-1 text-xs text-ink-600">
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-900">报价单 · 按{TIER_LABEL[tier]}{tier === "custom" && custom ? `（${describePricing(custom)}）` : ""}</span>
              {pending.length ? <span className="ml-2 font-semibold text-amber-800">{pending.length} 项待补价</span> : null}
            </p>
          </header>
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {lines.map(({ key, name, options, chosen }) => (
              <li key={key} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink-900">{name}</span>
                  <span className="shrink-0 text-right text-base font-semibold tabular-nums text-ink-900">{chosen ? money(chosen.option.customerTotal) : "—"}</span>
                </div>
                {options.length === 0 ? (
                  <p className="mt-0.5 font-semibold text-amber-800">待补价（WorldPac 本地和调货都没有，先不计入合计）</p>
                ) : (
                  <>
                    {options.length > 1 ? (
                      <select
                        aria-label={`${name} 选哪个零件`}
                        value={chosen?.key}
                        onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.value }))}
                        className="mt-1 block w-full min-w-0 rounded-md border border-ink-200 bg-[#fff] px-2 py-1 text-xs text-[#111b21]"
                      >
                        {options.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.note ? `${o.note} · ` : ""}
                            {optionName(o.option)} · {supplierLabel(o.quote, o.option) || ""} · {money(o.option.customerTotal)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p data-testid="sheet-supplier" className="mt-0.5 truncate text-xs text-ink-600">{optionName(options[0].option)} · {supplierLabel(options[0].quote, options[0].option)}</p>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 text-xs">
                      {(() => {
                        const l = laborOf({ key, name, options, chosen });
                        return l ? (
                          <span data-testid="labor-discount" className="text-emerald-800">
                            工时 {l.hours}h 原价 {money(l.list)} → 优惠 −{money(l.discount)}（{l.pct}% off）→ {money(l.charged)}
                          </span>
                        ) : (
                          <span />
                        );
                      })()}
                      {chosen?.option.eta && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">本地没货，调货 · {chosen.option.eta}</span>}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
        <aside className="flex flex-col gap-1.5 bg-[#1c2430] p-4 text-slate-100">
          <p data-testid="quote-sheet-total">
            <span className="block text-xs text-slate-300">{pending.length ? "已报价合计" : "合计"}</span>{" "}
            <span className="text-3xl font-extrabold tabular-nums text-white">{money(total)}</span>
          </p>
          <p className="text-[11px] text-slate-400">税前</p>
          <div className="mt-1 space-y-1">
            {laborCharged > 0 && (
              <>
                <p className={kv}><span>零件</span><span className="tabular-nums">{money(cents(total - laborCharged))}</span></p>
                <p className={kv}><span>工时（$120/h 原价）</span><span className="tabular-nums">{money(laborList)}</span></p>
              </>
            )}
            {discountTotal > 0 && (
              <p data-testid="labor-discount-total" className={`${kv} font-semibold text-emerald-300!`}>
                <span>工时优惠</span><span className="tabular-nums">−{money(discountTotal)}</span>
              </p>
            )}
          </div>
          <div data-testid="quote-sheet-after-tax" className="mt-1 space-y-1 border-t border-slate-600 pt-2">
            <p className={kv}><span>GST 5%</span><span className="tabular-nums">{money(taxed.gst)}</span></p>
            <p className={kv}><span>PST 7%</span><span className="tabular-nums">{money(taxed.pst)}</span></p>
            <p className={`${kv} text-white! font-bold`}><span>税后</span><span className="tabular-nums">{money(taxed.total)}</span></p>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              disabled={priced.length === 0}
              className="rounded-lg bg-[#f7b900] px-3 py-2 text-xs font-bold text-[#1c2430] hover:bg-[#e0a800] disabled:opacity-50"
            >
              复制报价给客人
            </button>
            {orderRows.length > 0 && (
              <button type="button" data-testid="copy-order-list" onClick={() => void navigator.clipboard.writeText(orderText).then(() => setOrderCopied("done"), () => setOrderCopied("failed"))} className={asideBtn}>
                复制订货单（内部，含进价）
              </button>
            )}
            <button type="button" onClick={() => void makePdf()} disabled={priced.length === 0 || pdf === "making"} className={asideBtn}>
              {pdf === "making" ? "正在生成 PDF…" : "下载 PDF 报价单"}
            </button>
            <button type="button" onClick={() => void makeImage()} disabled={priced.length === 0 || image === "making"} className={asideBtn}>
              {image === "making" ? "正在生成图片…" : "下载图片报价单"}
            </button>
          </div>
          {orderCopied === "done" && <p className="text-xs text-emerald-300">订货单已复制（含进价，别发给客人）</p>}
          {orderCopied === "failed" && <p className="text-xs text-amber-300">浏览器不让复制订货单</p>}
          {image === "failed" && <p className="text-xs text-amber-300">图片生成失败，请再试一次</p>}
          {pdf === "failed" && <p className="text-xs text-amber-300">PDF 生成失败，请再试一次</p>}
          {copied === "done" && <p className="text-xs text-emerald-300">已复制（不含进价）</p>}
          {copied === "failed" && <p className="text-xs text-amber-300">浏览器不允许复制，请手动选择下面的文字</p>}
          <p className="mt-1 text-[11px] leading-4 text-slate-400">这是要发给客人的报价单；要改价时展开下面的“各项明细”。</p>
        </aside>
      </div>
      {copied === "failed" && <pre className="mx-4 my-3 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs">{text}</pre>}
    </article>
  );
}

/** How many different jobs a reply quoted: the combined sheet shows only for two or more. */
export function distinctJobs(quotes: StaffQuote[]): number {
  return new Set(quotes.filter((q) => q.kind !== "team_quote").map((q) => (q.kind === "tires" ? "tires" : `${q.service}|${q.position}`))).size;
}

/** What a choice sends: a quick price by name, or the two slider positions. */
export type PriceChoice = { tier: Exclude<PriceTier, "custom">; pricing?: CustomPricing } | { tier: "custom"; pricing: CustomPricing };

interface Draft extends CustomPricing {
  laborExtraPct: number;
  /** The quick button the sliders still sit on; null once a slider has been moved. */
  preset: Exclude<PriceTier, "custom"> | null;
}

function startingDraft(current?: PriceTier, pricing?: CustomPricing | null): Draft {
  const laborExtraPct = extraPctOf(pricing);
  if (current === "custom" && pricing) return { ...pricing, laborExtraPct, preset: null };
  if (current === "retail" || current === "referral" || current === "friend" || current === "cost") return { ...PRESET_PRICING[current], laborExtraPct, preset: current };
  return { ...PRESET_PRICING.retail, laborExtraPct, preset: "retail" };
}

/** What a draft sends: a quick price by name (with the extra hours, if any), or the slider positions. */
function choiceOf(draft: Draft): PriceChoice {
  const extra = draft.laborExtraPct > 0 ? { laborExtraPct: draft.laborExtraPct } : {};
  if (draft.preset) return { tier: draft.preset, ...(draft.laborExtraPct > 0 ? { pricing: { ...PRESET_PRICING[draft.preset], ...extra } } : {}) };
  return { tier: "custom", pricing: { partsPct: draft.partsPct, laborRate: draft.laborRate, ...extra } };
}

/**
 * The assistant asks which price to quote (Kevin, 2026-11-15): three quick
 * buttons that just move two sliders (parts: cost to suggested retail in 5%
 * steps; labor: $60 to $120 in $1 steps). Before the first confirm nothing goes
 * on to the assistant; once a price is chosen the sliders stay live (Kevin,
 * 2026-11-16): each move re-prices the quotes at once, without asking the
 * assistant again.
 */
export function PriceChoiceCard({
  current,
  currentPricing,
  onChoose,
  onAdjust,
  disabled,
}: {
  current?: PriceTier;
  currentPricing?: CustomPricing | null;
  onChoose: (choice: PriceChoice) => void;
  /** Once a price is chosen, every slider move or quick button lands here and re-prices the quotes. */
  onAdjust?: (choice: PriceChoice) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => startingDraft(current, currentPricing));
  // A price saved elsewhere (a reload, a colleague, the assistant) moves the sliders with it:
  // the draft is rebuilt during render when the saved price changes.
  const saved = `${current ?? ""}|${currentPricing?.partsPct ?? ""}|${currentPricing?.laborRate ?? ""}|${extraPctOf(currentPricing)}`;
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setDraft(startingDraft(current, currentPricing));
  }
  const live = Boolean(current) && Boolean(onAdjust);
  const change = (next: Draft) => {
    setDraft(next);
    if (live) onAdjust?.(choiceOf(next));
  };
  const friend = draft.preset === "friend";
  return (
    <div data-testid="price-choice" className="ml-auto w-full max-w-xl rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-[#111b21]">
      <p className="text-xs font-semibold text-sky-900">按哪个价报？{current ? `（现在按${priceLabel(current, currentPricing)}，可以重新选）` : ""}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {QUICK_TIERS.map((tier) => {
          const quick = tier as Exclude<PriceTier, "custom">;
          return (
            <button
              key={tier}
              type="button"
              disabled={disabled}
              aria-pressed={draft.preset === tier}
              onClick={() => change({ ...PRESET_PRICING[quick], laborExtraPct: draft.laborExtraPct, preset: quick })}
              className={`rounded-lg px-3 py-2 text-left disabled:opacity-50 ${draft.preset === tier ? "bg-sky-700 text-white" : "border border-sky-300 bg-white text-sky-900 hover:bg-sky-100"}`}
            >
              <span className="block text-sm font-semibold">{TIER_LABEL[tier]}</span>
              <span className={`mt-0.5 block text-[11px] leading-4 ${draft.preset === tier ? "text-sky-100" : "text-sky-800/80"}`}>{TIER_HINT[tier]}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="flex items-baseline justify-between text-xs font-semibold text-sky-900">
            <span>零件加价</span>
            <span data-testid="parts-value" className="tabular-nums">
              {friend ? "进价 + $100/零件号" : `${draft.partsPct}%`}
            </span>
          </span>
          <input
            data-testid="parts-slider"
            type="range"
            min={0}
            max={100}
            step={PARTS_STEP}
            value={draft.partsPct}
            disabled={disabled}
            aria-label="零件加价"
            onChange={(e) => change({ ...draft, partsPct: Number(e.target.value), preset: null })}
            className="mt-1 w-full accent-sky-700"
          />
          <span className="flex justify-between text-[11px] text-sky-800/80">
            <span>0% 进价</span>
            <span>100% 建议零售价</span>
          </span>
        </label>
        <label className="block">
          <span className="flex items-baseline justify-between text-xs font-semibold text-sky-900">
            <span>工时</span>
            <span data-testid="labor-value" className="tabular-nums">
              ${draft.laborRate}/h
            </span>
          </span>
          <input
            data-testid="labor-slider"
            type="range"
            min={LABOR_MIN}
            max={LABOR_MAX}
            step={LABOR_STEP}
            value={draft.laborRate}
            disabled={disabled}
            aria-label="工时单价"
            onChange={(e) => change({ ...draft, laborRate: Number(e.target.value), preset: null })}
            className="mt-1 w-full accent-sky-700"
          />
          <span className="flex justify-between text-[11px] text-sky-800/80">
            <span>${LABOR_MIN}</span>
            <span>${LABOR_MAX}</span>
          </span>
        </label>
        <label className="block">
          <span className="flex items-baseline justify-between text-xs font-semibold text-sky-900">
            <span>工时加时（在建议工时上加）</span>
            <span data-testid="extra-value" className="tabular-nums">
              {draft.laborExtraPct > 0 ? `+${draft.laborExtraPct}%` : "不加时"}
            </span>
          </span>
          <input
            data-testid="extra-slider"
            type="range"
            min={0}
            max={EXTRA_MAX}
            step={EXTRA_STEP}
            value={draft.laborExtraPct}
            disabled={disabled}
            aria-label="工时加时"
            onChange={(e) => change({ ...draft, laborExtraPct: Number(e.target.value) })}
            className="mt-1 w-full accent-sky-700"
          />
          <span className="flex justify-between text-[11px] text-sky-800/80">
            <span>0% 建议工时</span>
            <span>+{EXTRA_MAX}%</span>
          </span>
        </label>
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        {live && <span data-testid="price-live" className="text-[11px] text-sky-800/80">已确认：调整滑块，下面的报价会自动按新价格更新</span>}
        <button
          type="button"
          data-testid="price-confirm"
          disabled={disabled}
          onClick={() => onChoose(choiceOf(draft))}
          className="rounded-lg bg-sky-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
        >
          {live ? "按此价重新报价" : "确认"}
        </button>
      </div>
    </div>
  );
}
