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
  wechat?: string;
  email?: string;
  locale: string;
  booking?: { date: string; time: string };
  /** The customer asked to be called back. */
  callback?: boolean;
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
  /** The page opened its contact form under the reply (no price to show, so the team follows up). */
  contactOffered?: boolean;
  /** The car the public assistant settled on, when it found one this turn. */
  vehicle?: Vehicle;
  failed?: boolean;
}

function visitor(contact: WebsiteContact, previous?: WebsiteVisitor, now = Date.now()): WebsiteVisitor {
  const booking = contact.booking ?? previous?.booking;
  const wechat = contact.wechat || previous?.wechat;
  const email = contact.email || previous?.email;
  const callbackAt = contact.callback ? now : previous?.callbackAt;
  return {
    name: contact.name || previous?.name || "",
    phone: contact.phone || previous?.phone || "",
    ...(wechat ? { wechat } : {}),
    ...(email ? { email } : {}),
    locale: contact.locale,
    ...(booking ? { booking } : {}),
    ...(callbackAt ? { callbackAt } : {}),
    // The form's consent line (WhatsApp / SMS replies) is shown with the number; remember when it was given.
    ...(previous?.consentAt ? { consentAt: previous.consentAt } : contact.phone ? { consentAt: now } : {}),
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
    // What the customer was shown besides the reply, for the staff reading the log (Kevin, 2026-11-17).
    const notes: Turn[] = entry.contactOffered
      ? [{ id: newTurnId(), role: "assistant", text: "已向客人弹出留联系方式的表单（这单暂时没有价格，要店里报价）", author: ASSISTANT, at: at + 2, quotes: [], source: "website", event: true, localOnly: true }]
      : [];
    await this.store
      .change(
        id,
        WEBSITE_CUSTOMER,
        (c) => {
          c.turns.push(question, answer, ...notes);
          c.website = visitor(entry.contact, c.website, this.now());
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
        c.website = visitor(contact, c.website, this.now());
        const released = c.turns.some((turn) => turn.held);
        for (const turn of c.turns) delete turn.held;
        if (released) c.turns.push({ id: newTurnId(), role: "assistant", text: "客人留了联系方式，上面被扣住的回复和报价客人现在已经看到", author: ASSISTANT, at: this.now(), quotes: [], source: "website", event: true, localOnly: true });
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
