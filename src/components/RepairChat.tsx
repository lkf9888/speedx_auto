"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { company, telLink, whatsappLink } from "@/lib/company";
import type { Locale } from "@/lib/site-routes";
import { TrackedContactLink } from "./TrackedContactLink";

type ChatCopy = Dictionary["repairChat"];
type StatusKey = keyof ChatCopy["status"];

interface Turn {
  role: "user" | "assistant";
  text: string;
  estimates: EstimateCard[];
  failed?: boolean;
}

type KnownVehicle = { key: string; label: string } | null;

const MAX_TURNS = 30;

const currency = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => currency.format(value);
const range = (low: number, high: number) => (low === high ? money(low) : `${money(low)} – ${money(high)}`);

function whatsappHref(copy: ChatCopy, card: EstimateCard): string {
  const lines = [
    `${copy.whatsappIntro} (${card.id}):`,
    `${card.vehicle} — ${card.service}${card.position ? ` (${card.position})` : ""}`,
    `${copy.estimate.total}: ${range(card.totalLow, card.totalHigh)} ${copy.estimate.beforeTax}`,
  ];
  return `${whatsappLink}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function EstimateView({
  card,
  copy,
  locale,
  pagePath,
}: {
  card: EstimateCard;
  copy: ChatCopy;
  locale: Locale;
  pagePath: string;
}) {
  const e = copy.estimate;
  return (
    <article
      data-testid="estimate-card"
      className="mt-3 rounded-2xl border border-brand-100 bg-white p-5 text-sm text-ink-700 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{e.title}</p>
          <h4 className="mt-1 text-base font-semibold text-ink-900">
            {card.service}
            {card.position ? ` · ${card.position}` : ""}
          </h4>
          <p className="mt-0.5 text-xs text-ink-500">
            {e.vehicle}: {card.vehicle}
          </p>
        </div>
        <span className="shrink-0 text-xs text-ink-400">{card.id}</span>
      </div>

      <dl className="mt-4 space-y-3">
        <div className="flex justify-between gap-4">
          <dt>
            {e.labor} · {card.laborHours} {e.hoursUnit} × {money(card.laborRate)}
          </dt>
          <dd className="font-medium text-ink-900">{money(card.laborWalkIn)}</dd>
        </div>
        <div>
          <dt className="text-ink-500">{card.partOptions.length ? `${e.parts}` : e.laborOnly}</dt>
          {card.partOptions.length > 0 && (
            <dd>
              <ul className="mt-1 space-y-1">
                {card.partOptions.map((part) => (
                  <li key={`${part.description}-${part.total}`} className="flex justify-between gap-4">
                    <span>
                      {part.description}
                      {part.quantity > 1 ? ` ×${part.quantity}` : ""}
                      {part.inStockLocally && (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                          {e.inStock}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 font-medium text-ink-900">{money(part.total)}</span>
                  </li>
                ))}
              </ul>
            </dd>
          )}
        </div>
        <div className="flex justify-between gap-4 border-t border-ink-100 pt-3 text-base">
          <dt className="font-semibold text-ink-900">
            {e.total} <span className="text-xs font-normal text-ink-500">({e.beforeTax})</span>
          </dt>
          <dd className="font-semibold text-ink-900">{range(card.totalLow, card.totalHigh)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-ink-500">
          <dt>{e.referral}</dt>
          <dd>{range(card.referralTotalLow, card.referralTotalHigh)}</dd>
        </div>
      </dl>

      {card.laborNote && (
        <p className="mt-3 text-xs leading-5 text-ink-500">
          {e.notIncluded}: {card.laborNote}
        </p>
      )}
      {card.otherPartNames.length > 0 && (
        <p className="mt-1 text-xs leading-5 text-ink-500">
          {e.mayNeed}: {card.otherPartNames.join(", ")}
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-ink-500">{e.disclaimer}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <TrackedContactLink
          href={whatsappHref(copy, card)}
          method="whatsapp"
          intent="auto_repair"
          locale={locale}
          placement="chat"
          pagePath={pagePath}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {e.book}
        </TrackedContactLink>
        <TrackedContactLink
          href={telLink}
          method="phone"
          intent="auto_repair"
          locale={locale}
          placement="chat"
          pagePath={pagePath}
          className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
        >
          {e.call} {company.phoneDisplay}
        </TrackedContactLink>
      </div>
    </article>
  );
}

export function RepairChat({
  locale,
  dict,
  pagePath,
}: {
  locale: Locale;
  dict: Dictionary;
  pagePath: string;
}) {
  const copy = dict.repairChat;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [vehicle, setVehicle] = useState<KnownVehicle>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusKey | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [turns, pending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    const history = turns
      .filter((t) => t.text.trim() && !t.failed)
      .slice(-MAX_TURNS)
      .map((t) => ({ role: t.role, text: t.text }));
    while (history.length > 0 && history[0].role !== "user") history.shift();

    setTurns((prev) => [...prev, { role: "user", text: message, estimates: [] }]);
    setInput("");
    setPending(true);
    setStatus("thinking");

    const estimates: EstimateCard[] = [];
    let reply = "";
    let failure: keyof ChatCopy["errors"] | null = null;
    let nextVehicle = vehicle;

    try {
      const response = await fetch("/api/repair-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, history, message, vehicleKey: vehicle?.key ?? null }),
      });
      if (!response.ok || !response.body) {
        failure = response.status === 429 ? "busy" : "unavailable";
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (!line) continue;
            const event = JSON.parse(line) as
              | { type: "status"; status: StatusKey }
              | { type: "vehicle"; vehicle: { key: string; label: string } }
              | { type: "estimate"; estimate: EstimateCard }
              | { type: "message"; text: string }
              | { type: "error"; code: "busy" | "unavailable" | "invalid" }
              | { type: "done" };
            if (event.type === "status") setStatus(event.status);
            else if (event.type === "vehicle") nextVehicle = event.vehicle;
            else if (event.type === "estimate") estimates.push(event.estimate);
            else if (event.type === "message") reply = event.text;
            else if (event.type === "error") failure = event.code === "busy" ? "busy" : "unavailable";
          }
          if (done) break;
        }
      }
    } catch {
      failure = "unavailable";
    }

    if (!failure && !reply && estimates.length === 0) failure = "empty";
    setVehicle(nextVehicle);
    setTurns((prev) => [
      ...prev,
      failure
        ? { role: "assistant", text: copy.errors[failure], estimates, failed: true }
        : { role: "assistant", text: reply, estimates },
    ]);
    setPending(false);
    setStatus(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function reset() {
    setTurns([]);
    setVehicle(null);
    setInput("");
  }

  return (
    <section id="estimate" className="py-16 sm:py-20" aria-labelledby="repair-chat-title">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
          {copy.eyebrow}
        </span>
        <h2 id="repair-chat-title" className="mt-3 text-3xl font-bold text-ink-900 sm:text-4xl">
          {copy.title}
        </h2>
        <p className="mt-3 leading-7 text-ink-600">{copy.intro}</p>

        <div className="mt-8 rounded-3xl border border-ink-100 bg-ink-50/60 p-4 sm:p-6">
          <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1" aria-live="polite">
            {turns.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {copy.starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void send(starter)}
                    className="rounded-full border border-ink-200 bg-white px-4 py-2 text-sm text-ink-700 hover:border-brand-300 hover:text-brand-700"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            )}
            {turns.map((turn, index) => (
              <div key={index} className={turn.role === "user" ? "flex justify-end" : ""}>
                {turn.role === "user" ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-ink-900 px-4 py-2.5 text-sm text-white">
                    {turn.text}
                  </p>
                ) : (
                  <div className="max-w-full">
                    {turn.text && (
                      <p
                        className={`whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-sm leading-6 ring-1 ring-ink-100 ${
                          turn.failed ? "text-amber-800" : "text-ink-800"
                        }`}
                      >
                        {turn.text}
                      </p>
                    )}
                    {turn.estimates.map((card) => (
                      <EstimateView
                        key={card.id}
                        card={card}
                        copy={copy}
                        locale={locale}
                        pagePath={pagePath}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {pending && status && (
              <p role="status" className="flex items-center gap-2 text-sm text-ink-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                {copy.status[status]}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={onSubmit} className="mt-4 flex gap-2">
            <label htmlFor="repair-chat-input" className="sr-only">
              {copy.placeholder}
            </label>
            <textarea
              id="repair-chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              maxLength={1500}
              placeholder={copy.placeholder}
              className="min-h-[3rem] flex-1 resize-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 focus:border-brand-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="self-end rounded-full bg-ink-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copy.send}
            </button>
          </form>
          <div className="mt-3 flex items-center justify-between gap-4 text-xs text-ink-400">
            <span>{copy.privacyNote}</span>
            {turns.length > 0 && !pending && (
              <button type="button" onClick={reset} className="shrink-0 underline hover:text-ink-600">
                {copy.reset}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
