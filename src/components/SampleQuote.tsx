import type { Dictionary } from "@/i18n/dictionaries";
import type { EstimateCard } from "@/lib/repair-chat/pricing";

type ChatCopy = Dictionary["repairChat"];

const wholeDollars = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const dollars = (value: number) => wholeDollars.format(value);
const span = (low: number, high: number) => `${dollars(low)} – ${dollars(high)}`;

/** The shop quotes within about 10% either way of the looked-up list prices. */
const SWING = 0.1;

/**
 * Sample estimate drawn like a paper quote handed over the counter. It shows
 * ranges only: how many part options exist, their price span, and a total
 * widened by 10% each way. The itemised part list stays out of the sample.
 */
export function SampleQuote({ card, copy }: { card: EstimateCard; copy: ChatCopy }) {
  const e = copy.estimate;
  const d = copy.demo;
  const totalLow = Math.round(card.totalLow * (1 - SWING));
  const totalHigh = Math.round(card.totalHigh * (1 + SWING));

  return (
    <div className="paper-quote-shadow mx-auto mt-4 max-w-md">
      <article
        data-testid="demo-estimate-card"
        className="paper-quote relative px-6 pb-9 pt-6 font-mono text-ink-800"
      >
        <span aria-hidden className="paper-stamp">
          {d.stamp}
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-500">SPEEDX AUTO</p>
        <h4 className="mt-3 text-base font-bold text-ink-900">
          {card.service}
          {card.position ? ` · ${card.position}` : ""}
        </h4>
        <p className="mt-1 text-xs text-ink-600">
          {e.vehicle}: {card.vehicle}
        </p>

        <dl className="mt-5 space-y-3 border-t border-dashed border-ink-300 pt-4 text-sm">
          <div className="flex items-baseline gap-2">
            <dt>{e.labor}</dt>
            <span aria-hidden className="paper-leader" />
            <dd className="paper-ink font-bold">{dollars(card.laborWalkIn)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt>{d.partsLine.replace("{count}", String(card.partOptions.length))}</dt>
            <span aria-hidden className="paper-leader" />
            <dd className="paper-ink font-bold">{span(card.partsLow, card.partsHigh)}</dd>
          </div>
          <div className="flex items-baseline gap-2 border-t-2 border-double border-ink-400 pt-3 text-base">
            <dt className="font-bold text-ink-900">
              {e.total} <span className="text-xs font-normal text-ink-500">({e.beforeTax})</span>
            </dt>
            <span aria-hidden className="paper-leader" />
            <dd className="paper-ink font-bold">{span(totalLow, totalHigh)}</dd>
          </div>
        </dl>

        <div className="mt-6 text-xs leading-5 text-ink-600">
          <p className="font-bold text-ink-700">{d.remarksTitle}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>{d.remarkReference}</li>
            <li>{d.remarkRange}</li>
          </ol>
        </div>
      </article>
    </div>
  );
}
