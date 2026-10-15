"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { estimateRanges, type EstimateCard } from "@/lib/repair-chat/pricing";
import { prepareAttachment, type PreparedAttachment } from "@/lib/workbench/prepare-attachment";
import { company, telLink, whatsappLink } from "@/lib/company";
import type { Locale } from "@/lib/site-routes";
import { RepairBooking } from "./RepairBooking";
import { QuoteSheet } from "./QuoteSheet";
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
  /** When the message was sent or received; unset on the greeting so server and browser render the same. */
  at?: number;
  /** Thumbnails of photos the customer sent with this message (this visit only). */
  photos?: string[];
}

const MAX_PHOTOS = 2;

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

const shownRange = (card: EstimateCard) => {
  const { totalLow, totalHigh } = estimateRanges(card);
  return totalLow === totalHigh ? `$${totalLow}` : `$${totalLow} – $${totalHigh}`;
};
const fill = (template: string, name: string) => template.replaceAll("{name}", name);

function phoneDigits(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

function whatsappHref(copy: ChatCopy, card: EstimateCard, name: string): string {
  const lines = [
    `${fill(copy.whatsappIntro, name)} (${card.id}):`,
    `${card.vehicle} — ${card.service}${card.position ? ` (${card.position})` : ""}`,
    card.kind === "team_quote"
      ? copy.estimate.teamQuoteTitle
      : `${copy.estimate.total}: ${shownRange(card)} ${copy.estimate.beforeTax}`,
  ];
  return `${whatsappLink}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function Meta({ at, locale, sent = false }: { at?: number; locale: Locale; sent?: boolean }) {
  if (at === undefined) return null;
  const time = new Date(at).toLocaleTimeString(locale === "en" ? "en-CA" : locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

function EstimateView({
  card,
  copy,
  locale,
  pagePath,
  leadName,
}: {
  card: EstimateCard;
  copy: ChatCopy;
  locale: Locale;
  pagePath: string;
  leadName: string;
}) {
  const e = copy.estimate;
  const kind = card.kind ?? "labor";
  return (
    <div className="mt-2">
      <QuoteSheet card={card} copy={copy} />
      {kind !== "team_quote" && (
        <p data-testid="screenshot-tip" className="mt-3 max-w-md rounded-lg bg-white/80 px-3 py-2 text-xs font-medium leading-5 text-[#3b4a54]">
          {e.screenshotTip.replace("{id}", card.id)}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <TrackedContactLink
          href={whatsappHref(copy, card, leadName)}
          method="whatsapp"
          intent="auto_repair"
          locale={locale}
          placement="chat"
          pagePath={pagePath}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-[#00a884] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008069]"
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
          className="rounded-full border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
        >
          {e.call} {company.phoneDisplay}
        </TrackedContactLink>
      </div>
    </div>
  );
}

function LeadGate({
  copy,
  onStart,
  reason = "estimate",
}: {
  copy: ChatCopy;
  onStart: (lead: Lead) => Promise<boolean>;
  /** Why we're asking: to show a ready estimate, or to pass an appointment request on. */
  reason?: "estimate" | "appointment";
}) {
  const appointment = reason === "appointment";
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
          {appointment ? copy.gate.appointmentTitle : copy.gate.title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-ink-600">{appointment ? copy.gate.appointmentIntro : copy.gate.intro}</p>
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
          {appointment ? copy.gate.appointmentSubmit : copy.gate.submit}
        </button>
      </div>
    </form>
  );
}

export function RepairChat({
  locale,
  dict,
  pagePath,
  cardCopies,
}: {
  locale: Locale;
  dict: Dictionary;
  pagePath: string;
  /** Chat copy in every language, so an estimate card follows the customer's language. */
  cardCopies?: Partial<Record<Locale, ChatCopy>>;
}) {
  const copy = dict.repairChat;
  const copyFor = (card: EstimateCard) => (card.lang && cardCopies?.[card.lang]) || copy;
  const [lead, setLead] = useState<Lead | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const greeting: Turn = { role: "assistant", text: copy.greeting, estimates: [], localOnly: true };
  const [turns, setTurns] = useState<Turn[]>([greeting]);
  const [vehicle, setVehicle] = useState<KnownVehicle>(null);
  const [input, setInput] = useState("");
  const [photos, setPhotos] = useState<PreparedAttachment[]>([]);
  const [photoNotice, setPhotoNotice] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  /** The photos of the last question, sent again if that question is re-asked (after name and phone). */
  const lastPhotos = useRef<PreparedAttachment[]>([]);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<StatusKey | null>(null);
  /** Over today's limit: show "please call us" instead of the chat. */
  const [capped, setCapped] = useState(false);
  /** The server is holding a reply with an estimate until name and phone are given. */
  const [awaitingLead, setAwaitingLead] = useState<false | "estimate" | "appointment">(false);
  const endRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const seenTurns = useRef(1);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Grow the message box with its text, up to about five lines, like a messaging app.
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 120)}px`;
  }, [input]);

  // Keep the conversation in view. Scroll the chat box itself (not the page,
  // and without smooth scrolling, which phones often drop inside a nested
  // scroller): to the bottom while waiting, and to the top of a new reply so
  // it is read from its first line.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const added = turns.length > seenTurns.current;
    seenTurns.current = turns.length;
    const last = turns[turns.length - 1];
    if (added && last?.role === "assistant" && turns.length > 1) {
      const el = log.querySelector<HTMLElement>(`[data-turn="${turns.length - 1}"]`);
      if (!el) return;
      log.scrollTop += el.getBoundingClientRect().top - log.getBoundingClientRect().top - 8;
      // The page may have the chat box half off screen (phones): bring the reply's first line into view.
      const top = el.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight - 160) window.scrollBy({ top: top - 96, behavior: "instant" });
    } else if (added || pending || awaitingLead) {
      log.scrollTop = log.scrollHeight;
      const bottom = log.getBoundingClientRect().bottom;
      if (turns.length > 1 && (bottom > window.innerHeight || bottom < 120)) {
        window.scrollBy({ top: bottom - window.innerHeight + 140, behavior: "instant" });
      }
    }
  }, [turns, pending, awaitingLead]);

  /** Add an assistant reply; the first reply with an estimate also gets the booking card. */
  function appendReply(text: string, estimates: EstimateCard[], localOnly = false) {
    setTurns((prev) => {
      const booking = estimates.length > 0 && !prev.some((t) => t.booking);
      return [...prev, { role: "assistant", text, estimates, localOnly, booking, at: Date.now() }];
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

  async function addPhotos(picked: FileList | File[]) {
    setPhotoNotice("");
    const files = Array.from(picked).filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (files.length < Array.from(picked).length) setPhotoNotice(copy.photo.failed);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setPhotoNotice(copy.photo.max);
    const added: PreparedAttachment[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      const result = await prepareAttachment(file);
      if ("error" in result) setPhotoNotice(copy.photo.failed);
      else added.push(result);
    }
    if (added.length) setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
  }

  async function send(text: string, options: { repeat?: boolean; contact?: Lead } = {}) {
    const message = text.trim();
    const attached = options.repeat ? lastPhotos.current : photos;
    if ((!message && attached.length === 0) || pending) return;
    // Sending the question just answered again (e.g. the reply was missed):
    // show that reply instead of paying for the same answer twice.
    const lastAsked = [...turns].reverse().find((t) => t.role === "user");
    const lastTurn = turns[turns.length - 1];
    if (
      !options.repeat &&
      lastAsked?.text === message &&
      lastTurn?.role === "assistant" &&
      !lastTurn.localOnly &&
      Date.now() - (lastTurn.at ?? 0) < 5 * 60 * 1000
    ) {
      setInput("");
      const log = logRef.current;
      const el = log?.querySelector<HTMLElement>(`[data-turn="${turns.length - 1}"]`);
      if (log && el) log.scrollTop += el.getBoundingClientRect().top - log.getBoundingClientRect().top - 8;
      return;
    }
    const contact = options.contact ?? lead;
    const earlier = options.repeat ? turns.slice(0, turns.map((t) => t.role).lastIndexOf("user")) : turns;
    const history = earlier
      .filter((t) => (t.text.trim() || t.photos?.length) && !t.localOnly)
      .slice(-MAX_TURNS)
      // Earlier photos aren't sent again; the model is told there were some.
      .map((t) => ({ role: t.role, text: t.photos?.length ? `${t.text} [${copy.photo.sent} ×${t.photos.length}]`.trim() : t.text }));
    while (history.length > 0 && history[0].role !== "user") history.shift();

    if (!options.repeat) {
      const thumbs = attached.map((p) => p.preview ?? "").filter(Boolean);
      setTurns((prev) => [...prev, { role: "user", text: message, estimates: [], at: Date.now(), ...(attached.length ? { photos: thumbs.length ? thumbs : attached.map(() => "") } : {}) }]);
      lastPhotos.current = attached;
    }
    setInput("");
    setPhotos([]);
    setPhotoNotice("");
    setPending(true);
    setStatus("thinking");

    const estimates: EstimateCard[] = [];
    let reply = "";
    let failure: keyof ChatCopy["errors"] | null = null;
    let nextVehicle = vehicle;
    let needsLead = false;
    let gateReason: "estimate" | "appointment" = "estimate";

    try {
      const response = await fetch("/api/repair-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          history,
          message,
          vehicleKey: vehicle?.key ?? null,
          lead: contact,
          sessionId,
          ...(attached.length ? { photos: attached.map(({ name, mediaType, data }) => ({ name, mediaType, data })) } : {}),
        }),
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
              | { type: "lead_required"; reason?: "estimate" | "appointment" }
              | { type: "capped" }
              | { type: "error"; code: "busy" | "unavailable" | "invalid" }
              | { type: "done" };
            if (event.type === "status") setStatus(event.status);
            else if (event.type === "vehicle") nextVehicle = event.vehicle;
            else if (event.type === "estimate") estimates.push(event.estimate);
            else if (event.type === "message") reply = event.text;
            else if (event.type === "session") setSessionId(event.id);
            else if (event.type === "lead_required") {
              needsLead = true;
              gateReason = event.reason ?? "estimate";
            }
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
    else if (needsLead) setAwaitingLead(gateReason);
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
    setPhotos([]);
    setPhotoNotice("");
    lastPhotos.current = [];
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

          {/* min-h: the opening state is ~20% taller than its content; kept afterwards so it doesn't jump when the starter chips go away */}
          <div ref={logRef} className="wa-chat-bg max-h-[32rem] min-h-[16.5rem] space-y-2 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite">
            {turns.map((turn, index) => (
              <div key={index} data-turn={index} className={turn.role === "user" ? "flex justify-end" : ""}>
                {turn.role === "user" ? (
                  <div className="wa-bubble wa-bubble-out max-w-[80%] whitespace-pre-wrap">
                    {turn.photos?.length ? (
                      <div className="mb-1 flex flex-wrap gap-1.5" data-testid="sent-photos">
                        {turn.photos.map((src, i) =>
                          src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={src} alt={copy.photo.sent} className="h-24 w-24 rounded-md object-cover" />
                          ) : (
                            <span key={i} className="rounded-md bg-black/5 px-2 py-1 text-xs">📷 {copy.photo.sent}</span>
                          ),
                        )}
                      </div>
                    ) : null}
                    {turn.text}
                    <Meta at={turn.at} locale={locale} sent />
                  </div>
                ) : (
                  <div className="max-w-[92%]">
                    {turn.text && (
                      <p className="wa-bubble wa-bubble-in whitespace-pre-wrap">
                        {turn.text}
                        <Meta at={turn.at} locale={locale} />
                      </p>
                    )}
                    {turn.estimates.map((card) => (
                      <EstimateView
                        key={card.id}
                        card={card}
                        copy={copyFor(card)}
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
                  className="rounded-full bg-[#00a884] px-4 py-2 text-sm font-semibold text-white hover:bg-[#008069]"
                >
                  WhatsApp
                </TrackedContactLink>
              </div>
            )}
            {noQuestionYet && !capped && !pending && (
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {copy.starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void send(starter)}
                    className="rounded-full bg-white px-3.5 py-2 text-left text-sm text-[#008069] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] hover:bg-[#f5f6f6]"
                  >
                    {starter}
                  </button>
                ))}
                <p className="w-full text-right text-xs text-[#667781]">📷 {copy.photo.tip}</p>
              </div>
            )}
            {awaitingLead && (
              <div data-testid="lead-gate" className="rounded-xl bg-white p-4 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                <LeadGate copy={copy} onStart={unlock} reason={awaitingLead || "estimate"} />
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

          {!capped && !awaitingLead && (
            <form onSubmit={onSubmit} className="bg-[#f0f2f5] px-2.5 py-2">
              {(photos.length > 0 || photoNotice) && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {photos.map((photo, index) => (
                    <span key={`${photo.name}-${index}`} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.preview ?? ""} alt={photo.name} className="h-14 w-14 rounded-lg object-cover" />
                      <button
                        type="button"
                        aria-label={`${copy.photo.remove} ${photo.name}`}
                        onClick={() => setPhotos((list) => list.filter((_, i) => i !== index))}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-xs text-white"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {photoNotice && (
                    <span role="alert" className="text-xs text-amber-800">
                      {photoNotice}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-end gap-2">
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                multiple
                hidden
                data-testid="photo-input"
                aria-label={copy.photo.add}
                onChange={(event) => {
                  void addPhotos(event.target.files ?? []);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label={copy.photo.add}
                title={copy.photo.tip}
                onClick={() => photoInput.current?.click()}
                disabled={pending || photos.length >= MAX_PHOTOS}
                className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5 disabled:opacity-40"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </button>
              <label htmlFor="repair-chat-input" className="sr-only">
                {copy.placeholder}
              </label>
              <textarea
                ref={inputRef}
                id="repair-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={1500}
                placeholder={copy.placeholder}
                className="max-h-[120px] min-h-[2.75rem] flex-1 resize-none rounded-[1.4rem] border-0 bg-white px-4 py-[0.7rem] text-sm leading-5 text-[#111b21] placeholder:text-[#667781] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
              />
              <button
                type="submit"
                aria-label={copy.send}
                disabled={pending || (!input.trim() && photos.length === 0)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition-colors hover:bg-[#008069] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z" />
                </svg>
              </button>
              </div>
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

        <div className="mt-10">
          <p className="text-sm font-semibold text-ink-900">{copy.demo.label}</p>
          <p className="mt-1 text-sm text-ink-500">{copy.demo.caption}</p>
          <QuoteSheet card={DEMO_ESTIMATE} copy={copy} sample />
        </div>
      </div>
    </section>
  );
}
