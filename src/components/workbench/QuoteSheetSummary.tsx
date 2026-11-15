"use client";

import { useState } from "react";
import { withFinalPrices } from "@/lib/workbench/final-price";
import { atTier, TIER_LABEL, type PriceTier } from "@/lib/workbench/price-tier";
import type { StaffQuote } from "@/lib/workbench/quote";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => usd.format(value);
const cents = (value: number) => Math.round(value * 100) / 100;

/** A quote at the chosen price with agreed prices applied, and the options in stock. */
function inStock(quote: StaffQuote, tier: PriceTier) {
  const priced = withFinalPrices(atTier(quote, tier));
  return priced.options.flatMap((o, i) => (quote.options[i].outOfStock ? [] : [{ index: i, option: o }]));
}

const jobName = (q: StaffQuote) => `${q.service}${q.position ? ` · ${q.position}` : ""}`;
const optionName = (o: { brand: string; label: string; partNumber: string }) =>
  [o.brand, o.label].filter(Boolean).join(" ") + (o.partNumber ? ` #${o.partNumber}` : "");

/**
 * Every job quoted in one reply on one sheet (Kevin, 2026-11-14: front and
 * rear rotors as one quote): one option per job, cheapest in stock first, and
 * the grand total at the conversation's price, with a customer copy.
 */
export function QuoteSheetSummary({ quotes, tier }: { quotes: StaffQuote[]; tier: PriceTier }) {
  const jobs = quotes.filter((q) => q.kind !== "team_quote").map((q) => ({ quote: q, options: inStock(q, tier) }));
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const lines = jobs.map(({ quote, options }) => {
    const cheapest = options.reduce<(typeof options)[number] | null>((best, o) => (!best || o.option.customerTotal < best.option.customerTotal ? o : best), null);
    const chosen = options.find((o) => o.index === picked[quote.id]) ?? cheapest;
    return { quote, options, chosen };
  });
  const priced = lines.filter((l) => l.chosen);
  const total = cents(priced.reduce((sum, l) => sum + l.chosen!.option.customerTotal, 0));
  const vehicle = quotes.find((q) => q.vehicle && q.vehicle !== "—")?.vehicle ?? "—";

  const text = [
    "【SPEEDX AUTO 维修报价】",
    `车辆：${vehicle}`,
    ...priced.map((l, i) => `${i + 1}. ${jobName(l.quote)}：${optionName(l.chosen!.option)}，$${l.chosen!.option.customerTotal.toFixed(2)}`),
    `合计：$${total.toFixed(2)}`,
    "以上为税前参考价，最终以到店检查为准。",
    `报价编号 ${priced.map((l) => l.quote.id).join(" / ")}`,
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <article data-testid="quote-sheet" className="rounded-xl border-2 border-brand-200 bg-white text-sm shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-100 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">合并报价单 · 按{TIER_LABEL[tier]}</p>
          <p className="text-xs text-ink-500">{vehicle}</p>
        </div>
        <p className="text-lg font-semibold tabular-nums text-ink-900" data-testid="quote-sheet-total">
          合计 {money(total)}
        </p>
      </header>
      <ul className="divide-y divide-ink-100">
        {lines.map(({ quote, options, chosen }) => (
          <li key={quote.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
            <span className="basis-full font-medium text-ink-900">{jobName(quote)}</span>
            {options.length === 0 ? (
              <span className="text-amber-800">本地没有现货，未计入合计</span>
            ) : (
              <>
                {options.length > 1 ? (
                  <select
                    aria-label={`${jobName(quote)} 选哪个零件`}
                    value={chosen?.index}
                    onChange={(e) => setPicked((p) => ({ ...p, [quote.id]: Number(e.target.value) }))}
                    className="min-w-0 max-w-full flex-1 rounded-md border border-ink-200 bg-[#fff] px-2 py-1 text-xs text-[#111b21]"
                  >
                    {options.map((o) => (
                      <option key={o.index} value={o.index}>
                        {optionName(o.option)} · {money(o.option.customerTotal)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-600">{optionName(options[0].option)}</span>
                )}
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-ink-900">{chosen ? money(chosen.option.customerTotal) : "—"}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <footer className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-3">
        <button
          type="button"
          onClick={() => void copy()}
          disabled={priced.length === 0}
          className="rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
        >
          复制合并报价给客人
        </button>
        {copied === "done" && <span className="text-xs text-emerald-700">已复制（不含进价）</span>}
        {copied === "failed" && <span className="text-xs text-amber-700">浏览器不允许复制，请手动选择下面的文字</span>}
        <span className="text-xs text-ink-500">各项明细在下面，可以单独改价。</span>
      </footer>
      {copied === "failed" && <pre className="mx-4 mb-3 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs">{text}</pre>}
    </article>
  );
}

/** The assistant asks which price to quote: three buttons; the choice is saved and sent as the next message. */
export function PriceChoiceCard({ current, onChoose, disabled }: { current?: PriceTier; onChoose: (tier: PriceTier) => void; disabled?: boolean }) {
  const tiers: PriceTier[] = ["retail", "referral", "friend"];
  return (
    <div data-testid="price-choice" className="ml-auto w-full max-w-xl rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-[#111b21]">
      <p className="text-xs font-semibold text-sky-900">按哪个价报？</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {tiers.map((tier) => (
          <button
            key={tier}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(tier)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${current === tier ? "bg-sky-700 text-white" : "border border-sky-300 bg-white text-sky-900 hover:bg-sky-100"} disabled:opacity-50`}
          >
            {TIER_LABEL[tier]}
          </button>
        ))}
      </div>
    </div>
  );
}
