"use client";

import { ASSISTANT, staffName, WEBSITE_CUSTOMER, type Turn } from "@/lib/workbench/conversation-types";
import { describePricing, TIER_LABEL } from "@/lib/workbench/price-tier";
import type { SharedConversation } from "@/lib/workbench/shares";
import { distinctJobs, QuoteSheetSummary } from "./QuoteSheetSummary";
import { StaffQuoteCard } from "./StaffQuoteCard";
import { WebsiteEstimateCard, WebsiteVisitorBar } from "./WebsiteCards";

const when = (at: number) =>
  new Date(at).toLocaleString("zh-CN", { timeZone: "America/Vancouver", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function Meta({ at }: { at?: number }) {
  return at === undefined ? null : <span className="wa-meta">{when(at)}</span>;
}

function Files({ turn }: { turn: Turn }) {
  if (!turn.attachments?.length) return null;
  return (
    <div className="mb-1 flex flex-wrap gap-1.5">
      {turn.attachments.map((file, i) => (
        <span key={i} className="flex max-w-full items-center gap-1.5 rounded-md bg-black/5 px-2 py-1.5 text-xs">
          📎 <span className="truncate">{file.name}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * A shared workbench conversation, read-only: the messages and quote cards as
 * staff saw them when the link was made. Nothing here can change anything:
 * no price edits, ALLDATA buttons, memory saves or price choices.
 */
export function SharedConversationView({ shared }: { shared: SharedConversation }) {
  const c = shared.conversation;
  const tier = c.priceTier ?? "retail";
  return (
    <div data-theme="light" className="wb-root min-h-dvh bg-[color:var(--wb-outer)] md:p-4">
      <div className="mx-auto max-w-3xl overflow-hidden bg-[color:var(--wb-bg)] md:rounded-lg md:shadow">
        <header className="border-b border-[color:var(--wb-border)] bg-[color:var(--wb-header)] px-4 py-3">
          <p className="text-xs text-[color:var(--wb-muted)]">SPEEDX AUTO 维修工作台 · 分享的对话记录（只读）</p>
          <h1 className="mt-0.5 text-base font-semibold text-[color:var(--wb-text)]">{c.title || "维修报价"}</h1>
          <p className="text-xs text-[color:var(--wb-muted)]">
            {c.vehicle ? `车辆：${c.vehicle.label} · ` : ""}
            {c.priceTier ? `按${TIER_LABEL[c.priceTier]}${c.priceTier === "custom" && c.pricing ? `（${describePricing(c.pricing)}）` : ""} · ` : ""}
            {staffName(shared.createdBy)} 分享于 {when(shared.createdAt)}，链接 {when(shared.expiresAt)} 到期
          </p>
        </header>
        {c.website && <WebsiteVisitorBar visitor={c.website} />}
        <main className="wb-chat space-y-2 px-3 py-4 sm:px-6" data-testid="shared-turns">
          {c.turns
            .filter((t) => !t.localOnly)
            .map((turn) =>
              turn.role === "user" ? (
                <div key={turn.id} className={turn.author === WEBSITE_CUSTOMER ? "flex justify-start" : "flex justify-end"}>
                  <div className={`wa-bubble ${turn.author === WEBSITE_CUSTOMER ? "wa-bubble-in" : "wa-bubble-out"} max-w-[85%] sm:max-w-[70%]`}>
                    <p className="text-xs font-semibold text-[#027eb5]">{turn.author === WEBSITE_CUSTOMER ? `🌐 ${c.website?.name || "网站客人"}` : staffName(turn.author)}</p>
                    <Files turn={turn} />
                    {turn.text && <p className="whitespace-pre-wrap">{turn.text}</p>}
                    <Meta at={turn.at} />
                  </div>
                </div>
              ) : (
                <div key={turn.id} className="space-y-2">
                  {turn.text && (
                    <div className="wa-bubble wa-bubble-out wa-bubble-ai ml-auto max-w-[92%] sm:max-w-[75%]">
                      <p className="text-xs font-semibold text-[#027eb5]">🤖 {turn.source === "website" ? "网站 AI 客服" : turn.author === ASSISTANT ? "AI 助手" : "AI"}</p>
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                      <Meta at={turn.at} />
                    </div>
                  )}
                  {turn.estimates?.map((card) => (
                    <div key={card.id} className="ml-auto w-full max-w-xl">
                      <WebsiteEstimateCard card={card} />
                    </div>
                  ))}
                  {distinctJobs(turn.quotes) > 1 && <QuoteSheetSummary quotes={turn.quotes} tier={tier} custom={c.pricing} />}
                  {turn.quotes.map((quote) => (
                    <StaffQuoteCard key={quote.id} quote={quote} tier={tier} custom={c.pricing} />
                  ))}
                  {turn.drafts?.map((draft) => (
                    <p key={draft.id} className="ml-auto w-fit rounded-lg bg-white px-3 py-2 text-xs text-ink-600 shadow-sm">
                      ALLDATA 估价单草稿{draft.created ? `（已建单 #${draft.created.estimateNumber ?? ""}）` : ""}
                    </p>
                  ))}
                </div>
              ),
            )}
        </main>
        <footer className="border-t border-[color:var(--wb-border)] px-4 py-3 text-xs text-[color:var(--wb-muted)]">
          这是店里分享的只读记录，链接 {when(shared.expiresAt)} 自动失效。价格为税前参考价，以到店检查为准。
        </footer>
      </div>
    </div>
  );
}
