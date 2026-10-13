"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { company, telLink, whatsappLink } from "@/lib/company";
import type { Locale } from "@/lib/site-routes";
import { RepairBooking } from "./RepairBooking";
import { TrackedContactLink } from "./TrackedContactLink";

type ChatCopy = Dictionary["repairChat"];
type StatusKey = keyof ChatCopy["status"];

interface Turn {
  role: "user" | "assistant";
  text: string;
  estimates: EstimateCard[];
  /** Shown in the chat but never sent to the model (greeting, error notices). */
  localOnly?: boolean;
  /** Show the booking card under this reply (once per conversation, after the first estimate). */
  booking?: boolean;
}

interface Lead {
  name: string;
  phone: string;
}

type KnownVehicle = { key: string; label: string } | null;

const MAX_TURNS = 30;

/** Sample card from a real speedDIAL lookup (2019 Camry LE front pads). */
export const DEMO_ESTIMATE: EstimateCard = {
  id: "E-SAMPLE",
  vehicle: "2019 Toyota Camry LE 2.5 L4",
  service: "Brake Pads R&R",
  position: "Front",
  laborHours: 1.1,
  laborRate: 120,
  laborWalkIn: 132,
  laborReferral: 105.6,
  primaryPartName: "Brake Pad Set",
  partOptions: [
    { description: "Brake Pad Set, Ceramic, PRO-ACT Ultra-Premium", series: "PRO-ACT Ultra-Premium", unitListPrice: 159.05, quantity: 1, total: 159.05, inStockLocally: true, note: "" },
    { description: "Brake Pad Set, w/ Shims, Ultra-Premium OE Ceramic", series: "", unitListPrice: 185.84, quantity: 1, total: 185.84, inStockLocally: true, note: "" },
    { description: "Brake Pad Set, PCT Prem Ceramic Tech", series: "", unitListPrice: 185.84, quantity: 1, total: 185.84, inStockLocally: true, note: "" },
  ],
  partsLow: 159.05,
  partsHigh: 185.84,
  totalLow: 291.05,
  totalHigh: 317.84,
  referralTotalLow: 264.65,
  referralTotalHigh: 291.44,
  laborNote:
    "Includes: The removal of component and all necessary components for access, and cleaning component. Does not include: Brake Hydraulic System Bleed.",
  otherPartNames: ["Anti Rattle Spring / Clip", "Brake Pad Shim"],
  partsNote: "",
  createdAt: "2026-10-11T00:00:00.000Z",
};

const currency = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (value: number) => currency.format(value);
const range = (low: number, high: number) => (low === high ? money(low) : `${money(low)} – ${money(high)}`);
const fill = (template: string, name: string) => template.replaceAll("{name}", name);
const quoteDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" });

function phoneDigits(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

function whatsappHref(copy: ChatCopy, card: EstimateCard, name: string): string {
  const lines = [
    `${fill(copy.whatsappIntro, name)} (${card.id}):`,
    `${card.vehicle} — ${card.service}${card.position ? ` (${card.position})` : ""}`,
    card.kind === "team_quote"
      ? copy.estimate.teamQuoteTitle
      : `${copy.estimate.total}: ${range(card.totalLow, card.totalHigh)} ${copy.estimate.beforeTax}`,
  ];
  return `${whatsappLink}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function EstimateView({
  card,
  copy,
  locale,
  pagePath,
  leadName,
  demo = false,
}: {
  card: EstimateCard;
  copy: ChatCopy;
  locale: Locale;
  pagePath: string;
  leadName: string;
  demo?: boolean;
}) {
  const e = copy.estimate;
  const kind = card.kind ?? "labor";
  return (
    <article
      data-testid={demo ? "demo-estimate-card" : "estimate-card"}
      className="mt-3 rounded-2xl border border-brand-100 bg-white p-5 text-sm text-ink-700 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {demo ? copy.demo.label : kind === "team_quote" ? e.teamQuoteTitle : e.title}
          </p>
          <h4 className="mt-1 text-base font-semibold text-ink-900">
            {card.service}
            {card.position ? ` · ${card.position}` : ""}
          </h4>
          <p className="mt-0.5 text-xs text-ink-500">
            {e.vehicle}: {card.vehicle}
          </p>
        </div>
        {!demo && (
          <span className="shrink-0 text-right text-xs text-ink-400">
            {card.id}
            <br />
            {e.date} {quoteDate(card.createdAt)}
          </span>
        )}
      </div>

      {kind === "team_quote" ? (
        <p data-testid="team-quote" className="mt-4 leading-6">
          {e.teamQuote}
        </p>
      ) : (
        <dl className="mt-4 space-y-3">
          {kind === "labor" && (
            <div className="flex justify-between gap-4">
              <dt>
                {e.labor} · {card.laborHours} {e.hoursUnit} × {money(card.laborRate)}
              </dt>
              <dd className="font-medium text-ink-900">{money(card.laborWalkIn)}</dd>
            </div>
          )}
          <div>
            <dt className="text-ink-500">
              {kind === "flat" ? e.flatOptions : card.partOptions.length ? e.parts : e.laborOnly}
            </dt>
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
        </dl>
      )}
      {kind === "flat" && card.partsNote && (
        <p className="mt-3 text-xs leading-5 text-ink-500">{card.partsNote}</p>
      )}

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
      {kind !== "team_quote" && <p className="mt-3 text-xs leading-5 text-ink-500">{e.disclaimer}</p>}
      {!demo && kind !== "team_quote" && (
        <p data-testid="screenshot-tip" className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium leading-5 text-brand-700">
          {e.screenshotTip.replace("{id}", card.id)}
        </p>
      )}

      {!demo && (
        <div className="mt-4 flex flex-wrap gap-2">
          <TrackedContactLink
            href={whatsappHref(copy, card, leadName)}
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
      )}
    </article>
  );
}

function LeadGate({
  copy,
  onStart,
}: {
  copy: ChatCopy;
  onStart: (lead: Lead) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return setError(copy.gate.invalidName);
    const digits = phoneDigits(phone);
    if (digits < 10 || digits > 15 || !/^\+?[\d\s().-]+$/.test(phone.trim())) {
      return setError(copy.gate.invalidPhone);
    }
    setError(null);
    setSubmitting(true);
    const started = await onStart({ name: cleanName, phone: phone.trim() });
    setSubmitting(false);
    if (!started) setError(copy.gate.failed);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby="repair-gate-title">
      <div>
        <h3 id="repair-gate-title" className="text-lg font-semibold text-ink-900">
          {copy.gate.title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-ink-600">{copy.gate.intro}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink-700">
          {copy.gate.name}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={60}
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-brand-400 focus:outline-none"
          />
        </label>
        <label className="block text-sm font-medium text-ink-700">
          {copy.gate.phone}
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={25}
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-brand-400 focus:outline-none"
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-ink-400 sm:max-w-md">{copy.gate.consent}</p>
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
        >
          {copy.gate.submit}
        </button>
      </div>
    </form>
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
  const [lead, setLead] = useState<Lead | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const greeting: Turn = { role: "assistant", text: copy.greeting, estimates: [], localOnly: true };
  const [turns, setTurns] = useState<Turn[]>([greeting]);
  const [vehicle, setVehicle] = useState<KnownVehicle>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusKey | null>(null);
  /** Over today's limit: show "please call us" instead of the chat. */
  const [capped, setCapped] = useState(false);
  /** The server is holding a reply with an estimate until name and phone are given. */
  const [awaitingLead, setAwaitingLead] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Tell the server the visit is over so the shop gets its follow-up email now
  // rather than after the idle timeout.
  useEffect(() => {
    if (!sessionId) return;
    const finish = () => {
      const body = new Blob([JSON.stringify({ sessionId })], { type: "application/json" });
      navigator.sendBeacon?.("/api/repair-lead/finish", body);
    };
    window.addEventListener("pagehide", finish);
    return () => window.removeEventListener("pagehide", finish);
  }, [sessionId]);

  useEffect(() => {
    if (turns.length > 1) endRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [turns, pending]);

  /** Add an assistant reply; the first reply with an estimate also gets the booking card. */
  function appendReply(text: string, estimates: EstimateCard[], localOnly = false) {
    setTurns((prev) => {
      const booking = estimates.length > 0 && !prev.some((t) => t.booking);
      return [...prev, { role: "assistant", text, estimates, localOnly, booking }];
    });
  }

  /** Name and phone given on the "estimate ready" form: release the held reply. */
  async function unlock(next: Lead): Promise<boolean> {
    let held: { text: string; estimates: EstimateCard[] } | null = null;
    try {
      const response = await fetch("/api/repair-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, lead: next, sessionId }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as {
        sessionId?: string;
        pending?: { text: string; estimates: EstimateCard[] } | null;
      };
      if (typeof data.sessionId === "string") setSessionId(data.sessionId);
      held = data.pending ?? null;
    } catch {
      return false;
    }
    setLead(next);
    setAwaitingLead(false);
    if (held) {
      appendReply(held.text, held.estimates);
    } else {
      // The server lost the held reply (e.g. it restarted): ask again, now with the contact details.
      const lastQuestion = [...turns].reverse().find((t) => t.role === "user");
      if (lastQuestion) void send(lastQuestion.text, { repeat: true, contact: next });
    }
    return true;
  }

  async function send(text: string, options: { repeat?: boolean; contact?: Lead } = {}) {
    const message = text.trim();
    if (!message || pending) return;
    const contact = options.contact ?? lead;
    const earlier = options.repeat ? turns.slice(0, turns.map((t) => t.role).lastIndexOf("user")) : turns;
    const history = earlier
      .filter((t) => t.text.trim() && !t.localOnly)
      .slice(-MAX_TURNS)
      .map((t) => ({ role: t.role, text: t.text }));
    while (history.length > 0 && history[0].role !== "user") history.shift();

    if (!options.repeat) setTurns((prev) => [...prev, { role: "user", text: message, estimates: [] }]);
    setInput("");
    setPending(true);
    setStatus("thinking");

    const estimates: EstimateCard[] = [];
    let reply = "";
    let failure: keyof ChatCopy["errors"] | null = null;
    let nextVehicle = vehicle;
    let needsLead = false;

    try {
      const response = await fetch("/api/repair-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, history, message, vehicleKey: vehicle?.key ?? null, lead: contact, sessionId }),
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
              | { type: "session"; id: string }
              | { type: "lead_required" }
              | { type: "capped" }
              | { type: "error"; code: "busy" | "unavailable" | "invalid" }
              | { type: "done" };
            if (event.type === "status") setStatus(event.status);
            else if (event.type === "vehicle") nextVehicle = event.vehicle;
            else if (event.type === "estimate") estimates.push(event.estimate);
            else if (event.type === "message") reply = event.text;
            else if (event.type === "session") setSessionId(event.id);
            else if (event.type === "lead_required") needsLead = true;
            else if (event.type === "capped") setCapped(true);
            else if (event.type === "error") failure = event.code === "busy" ? "busy" : "unavailable";
          }
          if (done) break;
        }
      }
    } catch {
      failure = "unavailable";
    }

    if (!failure && !needsLead && !reply && estimates.length === 0) failure = "empty";
    setVehicle(nextVehicle);
    if (failure) appendReply(copy.errors[failure], estimates, true);
    else if (needsLead) setAwaitingLead(true);
    else appendReply(reply, estimates);
    setPending(false);
    setStatus(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  function reset() {
    setTurns([greeting]);
    setAwaitingLead(false);
    setVehicle(null);
    setInput("");
  }

  const noQuestionYet = !turns.some((t) => t.role === "user");

  return (
    <section id="estimate" className="py-10 sm:py-20" aria-labelledby="repair-chat-title">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
          {copy.eyebrow}
        </span>
        <h2 id="repair-chat-title" className="mt-3 text-2xl font-bold text-ink-900 sm:text-4xl">
          {copy.title}
        </h2>
        <p className="mt-3 leading-7 text-ink-600">{copy.intro}</p>

        <div className="mt-8 rounded-3xl border border-ink-100 bg-ink-50/60 p-4 sm:p-6">
          <>
            <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1" aria-live="polite">
              {turns.map((turn, index) => (
                <div key={index} className={turn.role === "user" ? "flex justify-end" : ""}>
                  {turn.role === "user" ? (
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-ink-900 px-4 py-2.5 text-sm text-white">
                      {turn.text}
                    </p>
                  ) : (
                    <div className="max-w-full">
                      {turn.text && (
                        <p className="whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-ink-800 ring-1 ring-ink-100">
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
                          leadName={lead?.name ?? ""}
                        />
                      ))}
                      {turn.booking && lead && (
                        <RepairBooking copy={copy.booking} locale={locale} lead={lead} sessionId={sessionId} />
                      )}
                    </div>
                  )}
                </div>
              ))}
              {capped && (
                <div data-testid="capped-contact" className="flex flex-wrap gap-2">
                  <TrackedContactLink
                    href={telLink}
                    method="phone"
                    intent="auto_repair"
                    locale={locale}
                    placement="chat"
                    pagePath={pagePath}
                    className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                  >
                    {copy.estimate.call} {company.phoneDisplay}
                  </TrackedContactLink>
                  <TrackedContactLink
                    href={whatsappLink}
                    method="whatsapp"
                    intent="auto_repair"
                    locale={locale}
                    placement="chat"
                    pagePath={pagePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    WhatsApp
                  </TrackedContactLink>
                </div>
              )}
              {noQuestionYet && !capped && !pending && (
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
              {awaitingLead && (
                <div data-testid="lead-gate" className="rounded-2xl bg-white p-5 ring-1 ring-brand-100">
                  <LeadGate copy={copy} onStart={unlock} />
                </div>
              )}
              {pending && status && (
                <p role="status" className="flex items-center gap-2 text-sm text-ink-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                  {copy.status[status]}
                </p>
              )}
              <div ref={endRef} />
            </div>

            {!capped && !awaitingLead && (
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
            )}
            <div className="mt-3 flex items-center justify-between gap-4 text-xs text-ink-400">
              <span>{copy.privacyNote}</span>
              {!noQuestionYet && !pending && (
                <button type="button" onClick={reset} className="shrink-0 underline hover:text-ink-600">
                  {copy.reset}
                </button>
              )}
            </div>
          </>
        </div>

        <div className="mt-10">
          <p className="text-sm font-semibold text-ink-900">{copy.demo.label}</p>
          <p className="mt-1 text-sm text-ink-500">{copy.demo.caption}</p>
          <EstimateView
            card={DEMO_ESTIMATE}
            copy={copy}
            locale={locale}
            pagePath={pagePath}
            leadName=""
            demo
          />
        </div>
      </div>
    </section>
  );
}
