"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { company, telLink, whatsappLink } from "@/lib/company";
import type { IncomeCard } from "@/lib/hosting-estimate/estimate";
import type { Locale } from "@/lib/site-routes";
import { TrackedContactLink } from "./TrackedContactLink";

type Copy = Dictionary["hostingEstimate"];

interface Turn {
  role: "user" | "assistant";
  text: string;
  cards: IncomeCard[];
  /** Shown here but never sent back to the assistant (greeting, errors). */
  localOnly?: boolean;
  at?: number;
}

interface Lead {
  name: string;
  phone: string;
}

const MAX_TURNS = 20;
const dollars = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const money = (n: number) => dollars.format(n);

function Meta({ at, locale, sent = false }: { at?: number; locale: Locale; sent?: boolean }) {
  if (at === undefined) return null;
  const time = new Date(at).toLocaleTimeString(locale === "en" ? "en-CA" : locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <span className="wa-meta">
      {time}
      {sent && (
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="#53bdeb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 6l3 3 6-7M6.5 8.5l.5.5 6-7" />
        </svg>
      )}
    </span>
  );
}

/** The income report: yearly net, range, monthly average and a bar per month. */
export function IncomeReport({ card, copy }: { card: IncomeCard; copy: Copy }) {
  const r = copy.report;
  const peak = Math.max(...card.months.map((m) => m.net), 1);
  return (
    <article data-testid="income-report" className="mt-2 max-w-md rounded-xl bg-white p-4 text-ink-800 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#00a884]">{r.title}</p>
      <h4 className="mt-1 text-base font-bold text-ink-900">{card.vehicle}</h4>
      <div className="mt-3 grid grid-cols-2 gap-3 border-y border-ink-100 py-3">
        <div>
          <p className="text-xs text-ink-500">{r.annual}</p>
          <p className="text-2xl font-bold tabular-nums text-ink-900">{money(card.annualNet)}</p>
          <p className="text-xs tabular-nums text-ink-500">
            {r.range} {money(card.annualLow)} – {money(card.annualHigh)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-500">{r.monthly}</p>
          <p className="text-2xl font-bold tabular-nums text-ink-900">{money(card.monthlyAverage)}</p>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium text-[#008069]">{r.afterFee}</p>
      <ol className="mt-3 flex h-36 items-end gap-1" aria-label={r.title}>
        {card.months.map((m) => (
          <li key={`${m.year}-${m.month}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-0.5 text-[9px] tabular-nums text-ink-500">{m.net >= 1000 ? `${(m.net / 1000).toFixed(1)}k` : m.net}</span>
            <span
              className="w-full rounded-t bg-[#25d366]"
              style={{ height: `${Math.max(4, (m.net / peak) * 100)}px` }}
              title={`${r.months[m.month - 1]} ${m.year}: ${money(m.net)}`}
            />
            <span className="mt-1 text-[9px] text-ink-500">{r.months[m.month - 1]}</span>
            <span className="sr-only">{money(m.net)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink-500">{card.observed ? r.basisObserved : r.basisSimilar}</p>
      <div className="mt-2 text-xs leading-5 text-ink-500">
        <p className="font-semibold text-ink-700">{r.notesTitle}</p>
        <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
          {r.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function LeadGate({ copy, onStart }: { copy: Copy; onStart: (lead: Lead) => Promise<boolean> }) {
  const g = copy.gate;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError(g.invalidName);
    const digits = phone.replace(/\D/g, "").length;
    if (digits < 10 || digits > 15 || !/^\+?[\d\s().-]+$/.test(phone.trim())) return setError(g.invalidPhone);
    setError(null);
    setBusy(true);
    const ok = await onStart({ name: name.trim(), phone: phone.trim() });
    setBusy(false);
    if (!ok) setError(g.failed);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-labelledby="hosting-gate-title">
      <div>
        <h3 id="hosting-gate-title" className="text-lg font-semibold text-ink-900">
          {g.title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-ink-600">{g.intro}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink-700">
          {g.name}
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-[#00a884] focus:outline-none" />
        </label>
        <label className="block text-sm font-medium text-ink-700">
          {g.phone}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" maxLength={25} className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 focus:border-[#00a884] focus:outline-none" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-ink-400 sm:max-w-md">{g.consent}</p>
        <button type="submit" disabled={busy} className="shrink-0 rounded-full bg-[#00a884] px-6 py-3 text-sm font-semibold text-white hover:bg-[#008069] disabled:opacity-40">
          {g.submit}
        </button>
      </div>
    </form>
  );
}

/** The hosting page's AI income estimate, styled like the repair estimate chat (WhatsApp look). */
export function HostingEstimateChat({ locale, dict, pagePath }: { locale: Locale; dict: Dictionary; pagePath: string }) {
  const copy = dict.hostingEstimate;
  const greeting: Turn = { role: "assistant", text: copy.greeting, cards: [], localOnly: true };
  const [turns, setTurns] = useState<Turn[]>([greeting]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<keyof Copy["status"] | null>(null);
  const [awaitingLead, setAwaitingLead] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll the chat box, not the page, to the newest message.
    const box = boxRef.current;
    if (box && turns.length > 1) box.scrollTop = box.scrollHeight;
  }, [turns, pending, awaitingLead]);

  function reply(text: string, cards: IncomeCard[], localOnly = false) {
    setTurns((prev) => [...prev, { role: "assistant", text, cards, localOnly, at: Date.now() }]);
  }

  async function unlock(next: Lead): Promise<boolean> {
    let held: { text: string; cards: IncomeCard[] } | null = null;
    try {
      const response = await fetch("/api/hosting-estimate/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, lead: next, sessionId }),
      });
      if (!response.ok) return false;
      held = ((await response.json()) as { pending: { text: string; cards: IncomeCard[] } | null }).pending;
    } catch {
      return false;
    }
    setLead(next);
    setAwaitingLead(false);
    if (held) reply(held.text, held.cards);
    else {
      // The server lost the held report (restart): ask again, now with the contact.
      const last = [...turns].reverse().find((t) => t.role === "user");
      if (last) void send(last.text, { repeat: true, contact: next });
    }
    return true;
  }

  async function send(text: string, options: { repeat?: boolean; contact?: Lead } = {}) {
    const message = text.trim();
    if (!message || pending) return;
    const contact = options.contact ?? lead;
    const earlier = options.repeat ? turns.slice(0, turns.map((t) => t.role).lastIndexOf("user")) : turns;
    const history = earlier.filter((t) => !t.localOnly && t.text.trim()).slice(-MAX_TURNS).map((t) => ({ role: t.role, text: t.text }));
    while (history.length && history[0].role !== "user") history.shift();
    if (!options.repeat) setTurns((prev) => [...prev, { role: "user", text: message, cards: [], at: Date.now() }]);
    setInput("");
    setPending(true);
    setStatus("thinking");

    const cards: IncomeCard[] = [];
    let text_ = "";
    let failure: keyof Copy["errors"] | null = null;
    let needsLead = false;
    try {
      const response = await fetch("/api/hosting-estimate/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, history, message, lead: contact, sessionId }),
      });
      if (!response.ok || !response.body) failure = response.status === 429 ? "busy" : "unavailable";
      else {
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
              | { type: "session"; id: string }
              | { type: "status"; status: keyof Copy["status"] }
              | { type: "income_estimate"; estimate: IncomeCard }
              | { type: "message"; text: string }
              | { type: "lead_required" }
              | { type: "error"; code: "busy" | "unavailable" }
              | { type: "done" };
            if (event.type === "session") setSessionId(event.id);
            else if (event.type === "status") setStatus(event.status);
            else if (event.type === "income_estimate") cards.push(event.estimate);
            else if (event.type === "message") text_ = event.text;
            else if (event.type === "lead_required") needsLead = true;
            else if (event.type === "error") failure = event.code;
          }
          if (done) break;
        }
      }
    } catch {
      failure = "unavailable";
    }
    if (!failure && !needsLead && !text_ && cards.length === 0) failure = "empty";
    if (failure) reply(copy.errors[failure], [], true);
    else if (needsLead) setAwaitingLead(true);
    else reply(text_, cards);
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
    setInput("");
  }

  const noQuestionYet = !turns.some((t) => t.role === "user");

  return (
    <section id="income-estimate" className="py-10 sm:py-16" aria-labelledby="hosting-estimate-title">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">{copy.eyebrow}</span>
        <h2 id="hosting-estimate-title" className="mt-3 text-2xl font-bold text-ink-900 sm:text-4xl">
          {copy.title}
        </h2>
        <p className="mt-3 leading-7 text-ink-600">{copy.intro}</p>

        <div className="mt-8 overflow-hidden rounded-2xl border border-ink-200 bg-[#efeae2] shadow-sm">
          <div className="flex items-center gap-3 bg-[#008069] px-3 py-2 text-white">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[0.9375rem] font-semibold">{company.name}</p>
              <p className="truncate text-xs text-white/80">{copy.assistantStatus}</p>
            </div>
          </div>

          <div ref={boxRef} className="wa-chat-bg max-h-[34rem] min-h-[16.5rem] space-y-2 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
            {turns.map((turn, index) =>
              turn.role === "user" ? (
                <div key={index} className="flex justify-end">
                  <p className="wa-bubble wa-bubble-out max-w-[80%] whitespace-pre-wrap">
                    {turn.text}
                    <Meta at={turn.at} locale={locale} sent />
                  </p>
                </div>
              ) : (
                <div key={index} className="max-w-[92%]">
                  {turn.cards.map((card) => (
                    <IncomeReport key={card.id} card={card} copy={copy} />
                  ))}
                  {turn.text && (
                    <p className="wa-bubble wa-bubble-in mt-2 whitespace-pre-wrap">
                      {turn.text}
                      <Meta at={turn.at} locale={locale} />
                    </p>
                  )}
                  {turn.cards.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <TrackedContactLink href={whatsappLink} method="whatsapp" intent="hosting" locale={locale} placement="chat" pagePath={pagePath} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#00a884] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008069]">
                        {copy.report.whatsapp}
                      </TrackedContactLink>
                      <TrackedContactLink href={telLink} method="phone" intent="hosting" locale={locale} placement="chat" pagePath={pagePath} className="rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                        {copy.report.call} {company.phoneDisplay}
                      </TrackedContactLink>
                    </div>
                  )}
                </div>
              ),
            )}
            {noQuestionYet && !pending && (
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {copy.starters.map((starter) => (
                  <button key={starter} type="button" onClick={() => void send(starter)} className="rounded-full bg-white px-3.5 py-2 text-left text-sm text-[#008069] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] hover:bg-[#f5f6f6]">
                    {starter}
                  </button>
                ))}
              </div>
            )}
            {awaitingLead && (
              <div data-testid="hosting-lead-gate" className="rounded-xl bg-white p-4 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                <LeadGate copy={copy} onStart={unlock} />
              </div>
            )}
            {pending && status && (
              <div role="status" className="wa-bubble wa-bubble-in flex w-fit items-center gap-2 text-[#667781]">
                <span aria-hidden className="wa-typing">
                  <i />
                  <i />
                  <i />
                </span>
                {copy.status[status]}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {!awaitingLead && (
            <form onSubmit={onSubmit} className="flex items-end gap-2 bg-[#f0f2f5] px-2.5 py-2">
              <label htmlFor="hosting-estimate-input" className="sr-only">
                {copy.placeholder}
              </label>
              <textarea
                id="hosting-estimate-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={800}
                placeholder={copy.placeholder}
                className="max-h-[120px] min-h-[2.75rem] flex-1 resize-none rounded-[1.4rem] border-0 bg-white px-4 py-[0.7rem] text-sm leading-5 text-[#111b21] placeholder:text-[#667781] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
              <button type="submit" aria-label={copy.send} disabled={pending || !input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-colors hover:bg-[#008069] disabled:cursor-not-allowed disabled:opacity-50">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z" />
                </svg>
              </button>
            </form>
          )}
          <div className="flex items-center justify-between gap-4 bg-[#f0f2f5] px-3 pb-2.5 text-xs text-[#667781]">
            <span>{copy.privacyNote}</span>
            {!noQuestionYet && !pending && (
              <button type="button" onClick={reset} className="shrink-0 underline hover:text-ink-700">
                {copy.reset}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
