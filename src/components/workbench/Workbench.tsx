"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { StaffQuote } from "@/lib/workbench/quote";
import { StaffQuoteCard } from "./StaffQuoteCard";

interface Turn {
  role: "user" | "assistant";
  text: string;
  quotes: StaffQuote[];
  /** Shown but not sent back to the assistant (errors). */
  localOnly?: boolean;
}

const STATUS: Record<string, string> = {
  thinking: "思考中…",
  vehicle: "正在查车…",
  services: "正在查维修项目…",
  estimate: "正在查工时和零件价格…",
};

const STARTERS = ["2019 Toyota Camry LE 前刹车片", "225/65R17 四季胎，四条", "2018 Honda Civic LX 换机油"];

const ERRORS = {
  unauthorized: "登录已失效，请刷新页面重新登录。",
  busy: "请求太频繁，请稍后再试。",
  unavailable: "暂时无法查询，请稍后再试。",
  empty: "没有得到回复，请换个说法再试一次。",
};

/** The staff repair workbench: the estimate assistant at full detail. */
export function Workbench({ email }: { email: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("thinking");
  const [vehicle, setVehicle] = useState<{ key: string; label: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "instant" });
  }, [turns, pending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    const history = turns.filter((t) => !t.localOnly && t.text.trim()).slice(-40).map((t) => ({ role: t.role, text: t.text }));
    setTurns((prev) => [...prev, { role: "user", text: message, quotes: [] }]);
    setInput("");
    setPending(true);
    setStatus("thinking");

    const quotes: StaffQuote[] = [];
    let reply = "";
    let failure: keyof typeof ERRORS | null = null;
    let nextVehicle = vehicle;
    try {
      const response = await fetch("/api/workbench/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history, message, vehicleKey: vehicle?.key ?? null }),
      });
      if (!response.ok || !response.body) {
        failure = response.status === 401 ? "unauthorized" : response.status === 429 ? "busy" : "unavailable";
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
              | { type: "status"; status: string }
              | { type: "vehicle"; vehicle: { key: string; label: string } }
              | { type: "quote"; quote: StaffQuote }
              | { type: "message"; text: string }
              | { type: "error"; code: "busy" | "unavailable" }
              | { type: "done" };
            if (event.type === "status") setStatus(event.status);
            else if (event.type === "vehicle") nextVehicle = event.vehicle;
            else if (event.type === "quote") quotes.push(event.quote);
            else if (event.type === "message") reply = event.text;
            else if (event.type === "error") failure = event.code;
          }
          if (done) break;
        }
      }
    } catch {
      failure = "unavailable";
    }
    if (!failure && !reply && quotes.length === 0) failure = "empty";
    setVehicle(nextVehicle);
    setTurns((prev) => [
      ...prev,
      failure ? { role: "assistant", text: ERRORS[failure], quotes, localOnly: true } : { role: "assistant", text: reply, quotes },
    ]);
    setPending(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(input);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-900 px-4 py-3 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-bold">SPEEDX 维修工作台</h1>
            <p className="text-xs text-ink-300">内部使用 · 含进价和毛利，请勿截图发给客人</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-300">
            {vehicle && <span className="rounded-full bg-white/10 px-3 py-1 text-white">当前车辆：{vehicle.label}</span>}
            <span>{email}</span>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setVehicle(null);
                }}
                className="rounded-full border border-white/20 px-3 py-1 text-white hover:bg-white/10"
              >
                新对话
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        {turns.length === 0 && (
          <section className="rounded-xl border border-dashed border-ink-300 bg-white p-5 text-sm text-ink-600">
            <p className="font-medium text-ink-900">像外面的估价助手一样提问，这里会显示完整明细：每个零件选项的标价、进价、毛利、库存，工时小时数和推荐价。</p>
            <p className="mt-2">每张报价单下面的“复制客户报价”只包含客户价，可以直接发给客人。</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-ink-200 px-3.5 py-1.5 text-ink-700 hover:border-brand-300 hover:text-brand-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </section>
        )}

        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <div key={index} className="flex justify-end">
              <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-ink-900 px-4 py-2 text-sm text-white">{turn.text}</p>
            </div>
          ) : (
            <div key={index} className="space-y-3">
              {turn.text && (
                <p className="max-w-3xl whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-ink-800 ring-1 ring-ink-100">
                  {turn.text}
                </p>
              )}
              {turn.quotes.map((quote) => (
                <StaffQuoteCard key={quote.id} quote={quote} />
              ))}
            </div>
          ),
        )}

        {pending && (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            {STATUS[status] ?? STATUS.thinking}
          </p>
        )}
        <div ref={endRef} />
      </main>

      <form onSubmit={onSubmit} className="sticky bottom-0 border-t border-ink-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl gap-2">
          <label htmlFor="workbench-input" className="sr-only">
            问一个报价
          </label>
          <textarea
            id="workbench-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="车型 + 项目，例如：2019 Camry LE 前刹车片；或 VIN；或轮胎尺寸"
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="self-end rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
          >
            查询
          </button>
        </div>
      </form>
    </div>
  );
}
