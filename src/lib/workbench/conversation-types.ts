/**
 * Shared workbench conversations, as the server stores them and the page
 * shows them: every staff member sees every conversation, and each message
 * says who sent it (like a WhatsApp group). Types only, safe for the browser.
 */
import type { AlldataDraft } from "./alldata-draft";
import type { MemoryProposal } from "./assistant";
import type { StaffQuote } from "./quote";

export interface SentFile {
  name: string;
  mediaType: string;
  /** Thumbnail, in the sender's browser for this visit only; never stored. */
  preview?: string;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Staff email for user turns; who the reply was for, for assistant turns. */
  author: string;
  at: number;
  quotes: StaffQuote[];
  drafts?: AlldataDraft[];
  memories?: Array<MemoryProposal & { saved?: boolean }>;
  attachments?: SentFile[];
  /** Shown but not sent back to the assistant (errors). */
  localOnly?: boolean;
}

export type Vehicle = { key: string; label: string } | null;

export interface Conversation {
  id: string;
  title: string;
  vehicle: Vehicle;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
  turns: Turn[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  vehicle: string;
  updatedAt: number;
  /** Last message, shortened, and who sent it. */
  last: string;
  lastAuthor: string;
  turns: number;
}

/** Someone's question still being answered, so others see "查询中". */
export interface PendingQuery {
  by: string;
  status: string;
  since: number;
}

/** "kevin" from "kevin@speedx.ca": what the chat shows as the sender. */
export function staffName(email: string): string {
  if (!email) return "";
  if (email === ASSISTANT) return "AI 助手";
  return email.split("@")[0];
}

export const ASSISTANT = "assistant";
