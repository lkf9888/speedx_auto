"use client";

import { useState } from "react";
import { withFinalPrices } from "@/lib/workbench/final-price";
import { atTier, TIER_HINT, TIER_LABEL, type PriceTier } from "@/lib/workbench/price-tier";
import type { StaffQuote } from "@/lib/workbench/quote";

const usd = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => usd.format(value);
const cents = (value: number) => Math.round(value * 100) / 100;

/** A quote at the chosen price with agreed prices applied, and the options in stock. */
function inStock(quote: StaffQuote, tier: PriceTier, labelled: boolean) {
  const priced = withFinalPrices(atTier(quote, tier));
  return priced.options.flatMap((o, i) => (quote.options[i].outOfStock ? [] : [{ key: `${quote.id}:${i}`, quote, option: o, note: labelled ? quote.vehicle : "" }]));
}

const jobName = (q: StaffQuote) => (q.kind === "tires" ? "新轮胎（含安装）" : `${q.service}${q.position ? ` · ${q.position}` : ""}`);
/** Staff see the part number; the customer copy doesn't (it would let them shop the part elsewhere). */
const optionName = (o: { brand: string; label: string; partNumber: string }, withNumber = true) =>
  [o.brand, o.label].filter(Boolean).join(" ") + (withNumber && o.partNumber ? ` #${o.partNumber}` : "");

/**
 * The jobs in one reply. Cards for the same job are alternatives, not extras
 * (one per engine when the engine isn't known, or new tires from two
 * suppliers), so they share one row and only one of their options counts.
 */
function jobsOf(quotes: StaffQuote[], tier: PriceTier) {
  const groups = new Map<string, StaffQuote[]>();
  for (const quote of quotes) {
    if (quote.kind === "team_quote") continue;
    const key = quote.kind === "tires" ? "tires" : `${quote.service}|${quote.position}`;
    groups.set(key, [...(groups.get(key) ?? []), quote]);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key,
    name: jobName(group[0]),
    options: group.flatMap((q) => inStock(q, tier, group.length > 1 && q.kind !== "tires")),
  }));
}

/**
 * Every job quoted in one reply on one sheet (Kevin, 2026-11-14: front and
 * rear rotors as one quote): one option per job, cheapest in stock first, and
 * the grand total at the conversation's price, with a customer copy.
 */
export function QuoteSheetSummary({ quotes, tier }: { quotes: StaffQuote[]; tier: PriceTier }) {
  const jobs = jobsOf(quotes, tier);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const lines = jobs.map((job) => {
    const cheapest = job.options.reduce<(typeof job.options)[number] | null>((best, o) => (!best || o.option.customerTotal < best.option.customerTotal ? o : best), null);
    const chosen = job.options.find((o) => o.key === picked[job.key]) ?? cheapest;
    return { ...job, chosen };
  });
  const priced = lines.filter((l) => l.chosen);
  const total = cents(priced.reduce((sum, l) => sum + l.chosen!.option.customerTotal, 0));
  const vehicle = quotes.find((q) => q.vehicle && q.vehicle !== "—")?.vehicle ?? "—";

  const text = [
    "【SPEEDX AUTO 维修报价】",
    `车辆：${vehicle}`,
    ...priced.map((l, i) => `${i + 1}. ${l.name}：${optionName(l.chosen!.option, false)}，$${l.chosen!.option.customerTotal.toFixed(2)}`),
    `合计：$${total.toFixed(2)}`,
    "以上为税前参考价，最终以到店检查为准。",
    `报价编号 ${priced.map((l) => l.chosen!.quote.id).join(" / ")}`,
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
        {lines.map(({ key, name, options, chosen }) => (
          <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
            <span className="basis-full font-medium text-ink-900">{name}</span>
            {options.length === 0 ? (
              <span className="text-amber-800">本地没有现货，未计入合计</span>
            ) : (
              <>
                {options.length > 1 ? (
                  <select
                    aria-label={`${name} 选哪个零件`}
                    value={chosen?.key}
                    onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.value }))}
                    className="min-w-0 max-w-full flex-1 rounded-md border border-ink-200 bg-[#fff] px-2 py-1 text-xs text-[#111b21]"
                  >
                    {options.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.note ? `${o.note} · ` : ""}
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

/** How many different jobs a reply quoted: the combined sheet shows only for two or more. */
export function distinctJobs(quotes: StaffQuote[]): number {
  return new Set(quotes.filter((q) => q.kind !== "team_quote").map((q) => (q.kind === "tires" ? "tires" : `${q.service}|${q.position}`))).size;
}

/** The assistant asks which price to quote, in the chat: one button per price with its rule; the choice is saved and sent as the next message. */
export function PriceChoiceCard({ current, onChoose, disabled }: { current?: PriceTier; onChoose: (tier: PriceTier) => void; disabled?: boolean }) {
  const tiers: PriceTier[] = ["retail", "referral", "friend"];
  return (
    <div data-testid="price-choice" className="ml-auto w-full max-w-xl rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-[#111b21]">
      <p className="text-xs font-semibold text-sky-900">按哪个价报？{current ? `（现在按${TIER_LABEL[current]}，点别的可以换）` : ""}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {tiers.map((tier) => (
          <button
            key={tier}
            type="button"
            disabled={disabled}
            aria-pressed={current === tier}
            onClick={() => onChoose(tier)}
            className={`rounded-lg px-3 py-2 text-left disabled:opacity-50 ${current === tier ? "bg-sky-700 text-white" : "border border-sky-300 bg-white text-sky-900 hover:bg-sky-100"}`}
          >
            <span className="block text-sm font-semibold">{TIER_LABEL[tier]}</span>
            <span className={`mt-0.5 block text-[11px] leading-4 ${current === tier ? "text-sky-100" : "text-sky-800/80"}`}>{TIER_HINT[tier]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
