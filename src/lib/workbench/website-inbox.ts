/**
 * Website customers' chats with the public assistant, copied into the shared
 * workbench conversations so staff can follow up: each visit is one "网站咨询"
 * conversation with the customer's questions, the replies and the estimate
 * cards they were shown (customer prices only).
 *
 * One KV write per question-and-reply, plus one when the customer leaves name
 * and phone or books a time. Name and phone are stored for staff on the
 * conversation, never in a turn, so they never reach the workbench AI.
 */
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { ConversationError, getConversationStore, newTurnId, type ConversationStore } from "./conversations";
import { ASSISTANT, WEBSITE_CUSTOMER, type Turn, type Vehicle, type WebsiteVisitor } from "./conversation-types";

const TITLE_LENGTH = 60;

/** One website visit, across server restarts (the browser keeps its first session id). */
export function websiteConversationId(thread: string): string {
  return `cw${thread.replace(/[^a-f0-9]/g, "").slice(0, 32)}`;
}

export interface WebsiteContact {
  name: string;
  phone: string;
  locale: string;
  booking?: { date: string; time: string };
}

export interface WebsiteExchange {
  thread: string;
  contact: WebsiteContact;
  question: string;
  photos: Array<{ mediaType: string }>;
  /** The public assistant's reply; empty when it failed. */
  reply: string;
  estimates: EstimateCard[];
  /** The reply waits for name and phone. */
  held: boolean;
  /** The car the public assistant settled on, when it found one this turn. */
  vehicle?: Vehicle;
  failed?: boolean;
}

function visitor(contact: WebsiteContact, previous?: WebsiteVisitor): WebsiteVisitor {
  const booking = contact.booking ?? previous?.booking;
  return {
    name: contact.name || previous?.name || "",
    phone: contact.phone || previous?.phone || "",
    locale: contact.locale,
    ...(booking ? { booking } : {}),
  };
}

const log = (error: unknown) =>
  console.error("website inbox save failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");

export class WebsiteInbox {
  constructor(
    private readonly store: ConversationStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Staff see "网站客人 正在提问…" while the public assistant answers. */
  asking(thread: string): void {
    this.store.pending.set(websiteConversationId(thread), { by: WEBSITE_CUSTOMER, status: "thinking", since: this.now() });
  }

  /** The question and its reply, saved together. Never throws. */
  async exchange(entry: WebsiteExchange): Promise<void> {
    const id = websiteConversationId(entry.thread);
    this.store.pending.delete(id);
    const at = this.now();
    const question: Turn = {
      id: newTurnId(),
      role: "user",
      text: entry.question,
      author: WEBSITE_CUSTOMER,
      at,
      quotes: [],
      source: "website",
      ...(entry.photos.length ? { attachments: entry.photos.map((p, i) => ({ name: `客人照片 ${i + 1}`, mediaType: p.mediaType })) } : {}),
    };
    const answer: Turn = {
      id: newTurnId(),
      role: "assistant",
      text: entry.failed ? "（网站 AI 出错，客人没有收到回复）" : entry.reply,
      author: ASSISTANT,
      at: at + 1,
      quotes: [],
      source: "website",
      ...(entry.estimates.length ? { estimates: entry.estimates } : {}),
      ...(entry.held ? { held: true } : {}),
    };
    await this.store
      .change(
        id,
        WEBSITE_CUSTOMER,
        (c) => {
          c.turns.push(question, answer);
          c.website = visitor(entry.contact, c.website);
          if (entry.vehicle) c.vehicle = entry.vehicle;
          if (!c.title) c.title = entry.question.replace(/\s+/g, " ").trim().slice(0, TITLE_LENGTH);
          delete c.archived;
        },
        true,
      )
      .catch(log);
  }

  /** The customer left name and phone, or booked a time: held replies are now seen. Never throws. */
  async contact(thread: string, contact: WebsiteContact): Promise<void> {
    await this.store
      .change(websiteConversationId(thread), WEBSITE_CUSTOMER, (c) => {
        c.website = visitor(contact, c.website);
        for (const turn of c.turns) delete turn.held;
        delete c.archived;
      })
      .catch((error) => {
        // A visit with no saved question yet has nothing to update.
        if (!(error instanceof ConversationError && error.kind === "not_found")) log(error);
      });
  }
}

/** The inbox over the shared store, or null when KV isn't configured. */
export function getWebsiteInbox(): WebsiteInbox | null {
  const store = getConversationStore();
  return store ? new WebsiteInbox(store) : null;
}
