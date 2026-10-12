"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { addDays, weekday, type BookableDay } from "@/lib/repair-chat/booking";
import type { Locale } from "@/lib/site-routes";

type BookingCopy = Dictionary["repairChat"]["booking"];
type State = "loading" | "ready" | "sending" | "done" | "failed" | "taken" | "none";

const monthOf = (date: string) => date.slice(0, 7);

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Calendar cells for a month: leading blanks, then each date. */
function monthCells(month: string): Array<string | null> {
  const first = `${month}-01`;
  const cells: Array<string | null> = Array.from({ length: weekday(first) }, () => null);
  for (let date = first; monthOf(date) === month; date = addDays(date, 1)) cells.push(date);
  return cells;
}

async function fetchDays(): Promise<BookableDay[]> {
  const response = await fetch("/api/repair-booking");
  const data = (await response.json()) as { days?: BookableDay[] };
  return Array.isArray(data.days) ? data.days : [];
}

export function RepairBooking({
  copy,
  locale,
  lead,
  sessionId,
}: {
  copy: BookingCopy;
  locale: Locale;
  lead: { name: string; phone: string };
  sessionId: string | null;
}) {
  const [days, setDays] = useState<BookableDay[]>([]);
  const [state, setState] = useState<State>("loading");
  const [month, setMonth] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  function apply(open: BookableDay[]) {
    setDays(open);
    setMonth(open[0] ? monthOf(open[0].date) : "");
    setState(open.length ? "ready" : "none");
  }

  async function load() {
    try {
      apply(await fetchDays());
    } catch {
      setState("failed");
    }
  }

  useEffect(() => {
    let active = true;
    fetchDays()
      .then((open) => active && apply(open))
      .catch(() => active && setState("failed"));
    return () => {
      active = false;
    };
  }, []);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d.slots])), [days]);
  const months = useMemo(() => [...new Set(days.map((d) => monthOf(d.date)))], [days]);
  const dateLabel = (d: string) =>
    new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`));

  async function submit() {
    if (!date || !time) return;
    setState("sending");
    try {
      const response = await fetch("/api/repair-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, lead, sessionId, date, time }),
      });
      if (response.status === 409) {
        // The slot is no longer open (e.g. it got too close): refresh the list.
        setTime(null);
        await load();
        setState("taken");
        return;
      }
      setState(response.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <section
      data-testid="booking-card"
      aria-labelledby="repair-booking-title"
      className="mt-3 rounded-2xl border border-emerald-100 bg-white p-5 text-sm text-ink-700 shadow-sm"
    >
      <h4 id="repair-booking-title" className="text-base font-semibold text-ink-900">
        {copy.title}
      </h4>
      <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium leading-5 text-brand-700">
        {copy.screenshot}
      </p>

      {state === "done" && date && time ? (
        <p role="status" className="mt-4 leading-6 text-emerald-800">
          {copy.done.replace("{slot}", `${dateLabel(date)} ${time}`)}
        </p>
      ) : state === "loading" ? (
        <p className="mt-4 text-ink-500">{copy.loading}</p>
      ) : state === "none" ? (
        <p className="mt-4 leading-6">{copy.none}</p>
      ) : (
        <>
          <p className="mt-3 leading-6">{copy.intro}</p>
          <p className="mt-1 text-xs text-ink-500">{copy.hours}</p>

          {month && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMonth(shiftMonth(month, -1))}
                  disabled={month === months[0]}
                  aria-label={copy.prevMonth}
                  className="rounded-full px-3 py-1 text-ink-600 hover:bg-ink-50 disabled:opacity-30"
                >
                  ‹
                </button>
                <p className="font-semibold text-ink-900">{monthLabel(month)}</p>
                <button
                  type="button"
                  onClick={() => setMonth(shiftMonth(month, 1))}
                  disabled={month === months[months.length - 1]}
                  aria-label={copy.nextMonth}
                  className="rounded-full px-3 py-1 text-ink-600 hover:bg-ink-50 disabled:opacity-30"
                >
                  ›
                </button>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs" role="group" aria-label={copy.pickDate}>
                {copy.weekdays.map((w) => (
                  <span key={w} className="py-1 text-ink-400">
                    {w}
                  </span>
                ))}
                {monthCells(month).map((cell, index) =>
                  cell ? (
                    <button
                      key={cell}
                      type="button"
                      disabled={!byDate.has(cell)}
                      aria-pressed={date === cell}
                      aria-label={dateLabel(cell)}
                      onClick={() => {
                        setDate(cell);
                        setTime(null);
                        if (state === "taken" || state === "failed") setState("ready");
                      }}
                      className={`rounded-lg py-2 text-sm ${
                        date === cell
                          ? "bg-ink-900 font-semibold text-white"
                          : byDate.has(cell)
                            ? "text-ink-900 hover:bg-brand-50"
                            : "text-ink-300"
                      }`}
                    >
                      {Number(cell.slice(8))}
                    </button>
                  ) : (
                    <span key={`blank-${index}`} />
                  ),
                )}
              </div>
            </div>
          )}

          {date && (
            <div className="mt-4">
              <p className="text-xs font-medium text-ink-500">
                {copy.pickTime} · {dateLabel(date)}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {(byDate.get(date) ?? []).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    aria-pressed={time === slot}
                    onClick={() => setTime(slot)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      time === slot
                        ? "border-ink-900 bg-ink-900 font-semibold text-white"
                        : "border-ink-200 text-ink-700 hover:border-brand-300"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )}

          {state === "taken" && (
            <p role="alert" className="mt-3 text-amber-800">
              {copy.taken}
            </p>
          )}
          {state === "failed" && (
            <p role="alert" className="mt-3 text-amber-800">
              {copy.failed}
            </p>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!date || !time || state === "sending"}
            className="mt-4 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state === "sending" ? copy.sending : copy.submit}
          </button>
        </>
      )}
    </section>
  );
}
