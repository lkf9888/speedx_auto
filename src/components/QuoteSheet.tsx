import type { Dictionary } from "@/i18n/dictionaries";
import { estimateRanges, type EstimateCard } from "@/lib/repair-chat/pricing";

type ChatCopy = Dictionary["repairChat"];

const wholeDollars = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const dollars = (value: number) => wholeDollars.format(value);
const span = (low: number, high: number) => (low === high ? dollars(low) : `${dollars(low)} – ${dollars(high)}`);
const quoteDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });

function Row({ label, value, strong = false }: { label: React.ReactNode; value?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className={strong ? "whitespace-nowrap font-bold text-ink-900" : undefined}>{label}</dt>
      {value ? (
        <>
          <span aria-hidden className="paper-leader" />
          <dd className="paper-ink whitespace-nowrap font-bold">{value}</dd>
        </>
      ) : null}
    </div>
  );
}

/**
 * An estimate drawn like a paper quote handed over the counter. Labor-based
 * quotes show ranges only (part count and span, total widened by 10% each
 * way); the shop's flat prices are listed as posted. Used for the sample on the
 * page and for the real estimates in the chat.
 */
export function QuoteSheet({
  card,
  copy,
  sample = false,
}: {
  card: EstimateCard;
  copy: ChatCopy;
  sample?: boolean;
}) {
  const e = copy.estimate;
  const d = copy.demo;
  const kind = card.kind ?? "labor";
  const shown = estimateRanges(card);

  return (
    <div className="paper-quote-shadow mt-3 max-w-md">
      <article
        data-testid={sample ? "demo-estimate-card" : "estimate-card"}
        className="paper-quote relative px-5 pb-9 pt-6 font-mono text-ink-800 sm:px-6"
      >
        {sample ? (
          <span aria-hidden className="paper-stamp">
            {d.stamp}
          </span>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-500">SPEEDX AUTO</p>
          {sample ? null : (
            <span className="text-right text-xs leading-5 text-ink-500">
              {card.id}
              <br />
              {e.date} {quoteDate(card.createdAt)}
            </span>
          )}
        </div>
        <h4 className="mt-3 text-base font-bold text-ink-900">
          {card.service}
          {card.position ? ` · ${card.position}` : ""}
        </h4>
        <p className="mt-1 text-xs text-ink-600">
          {e.vehicle}: {card.vehicle}
        </p>

        {kind === "team_quote" ? (
          <p data-testid="team-quote" className="mt-5 border-t border-dashed border-ink-300 pt-4 text-sm leading-6">
            {e.teamQuote}
          </p>
        ) : (
          <dl className="mt-5 space-y-3 border-t border-dashed border-ink-300 pt-4 text-sm">
            {kind === "labor" && <Row label={e.labor} value={dollars(card.laborWalkIn)} />}
            {kind === "flat" ? (
              <>
                <p className="text-xs text-ink-500">{e.flatOptions}</p>
                {card.partOptions.map((part) => (
                  <Row
                    key={`${part.description}-${part.total}`}
                    label={`${part.description}${part.quantity > 1 ? ` ×${part.quantity}` : ""}`}
                    value={dollars(part.total)}
                  />
                ))}
              </>
            ) : card.partOptions.length > 0 ? (
              <Row
                label={(card.partOptions.length === 1 ? d.partsLineOne : d.partsLine).replace(
                  "{count}",
                  String(card.partOptions.length),
                )}
                value={span(shown.partsLow, shown.partsHigh)}
              />
            ) : (
              <p className="text-xs leading-5 text-ink-600">{e.laborOnly}</p>
            )}
            <div className="border-t-2 border-double border-ink-400 pt-3 text-[0.9375rem]">
              <Row
                strong
                label={
                  <>
                    {e.total} <span className="text-xs font-normal text-ink-500">({e.beforeTax})</span>
                  </>
                }
                value={span(shown.totalLow, shown.totalHigh)}
              />
            </div>
          </dl>
        )}

        <div className="mt-6 text-xs leading-5 text-ink-600">
          <p className="font-bold text-ink-700">{d.remarksTitle}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            {kind === "flat" ? (
              <>
                {card.partsNote ? <li>{card.partsNote}</li> : null}
                <li>{e.disclaimer}</li>
              </>
            ) : (
              <>
                <li>{d.remarkReference}</li>
                <li>{d.remarkRange}</li>
              </>
            )}
          </ol>
        </div>
      </article>
    </div>
  );
}
