/**
 * Shared workbench conversations, as the server stores them and the page
 * shows them: every staff member sees every conversation, and each message
 * says who sent it (like a WhatsApp group). Types only, safe for the browser.
 */
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import type { AlldataDraft } from "./alldata-draft";
import type { MemoryProposal } from "./assistant";
import type { FollowUpRecord } from "./followup";
import type { CustomPricing, PriceTier } from "./price-tier";
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
  /** A customer's question or the public assistant's reply on the website. */
  source?: "website";
  /** Estimate cards the website customer was shown (customer prices only). */
  estimates?: EstimateCard[];
  /** The reply waits for the customer's name and phone: they haven't seen it yet. */
  held?: boolean;
  /** WhatsApp / SMS (2026-11-16): the channel a message to or from the customer went through. */
  channel?: MessageChannel;
  /** A message staff sent to the customer's phone: who sent it is `author`; this says how it went. */
  delivery?: Delivery;
  /** The assistant asked which price to quote; the card shows the choices. */
  priceChoice?: boolean;
}

export type MessageChannel = "whatsapp" | "sms";

/** How a message staff sent to the customer's phone is doing. */
export interface Delivery {
  status: "sent" | "delivered" | "read" | "failed";
  /** The provider's message id, to match its status reports. */
  id?: string;
  /** Short reason when it failed (no account details). */
  error?: string;
  /** A WhatsApp message that couldn't be delivered was sent again as an SMS. */
  resentAsSms?: boolean;
}

/** What is known about reaching the customer's phone. */
export interface Messaging {
  /** When the customer last wrote to us on WhatsApp: free replies are allowed for 24 hours after. */
  lastWhatsAppInboundAt?: number;
  /** The customer wrote or got a message through WhatsApp, so the number is on it. */
  whatsappWorks?: boolean;
  /** WhatsApp failed for this number: use SMS. */
  smsOnly?: boolean;
  /** The customer asked us to stop (STOP / 退订): nothing more is sent. */
  optedOut?: boolean;
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
  /** Put away for everyone; a new message brings it back. */
  archived?: boolean;
  /** Set on a website customer's chat with the public assistant. */
  website?: WebsiteVisitor;
  /** Which price this conversation quotes; unset until staff choose. */
  priceTier?: PriceTier;
  /** The slider positions behind priceTier "custom" (parts % between cost and suggested retail, labor $/h). */
  pricing?: CustomPricing;
  /** Read-only links to this conversation that work without signing in. */
  shares?: ShareLink[];
  /** Follow-up offers sent to (or logged for) a website customer. */
  followUps?: FollowUpRecord[];
  /** Messaging with the customer's phone: windows, channel, opt-out. */
  messaging?: Messaging;
}

/** A no-login link to a snapshot of a conversation; it stops working at expiresAt. */
export interface ShareLink {
  token: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
}

/** Who the website customer is. Name and phone are for staff only; never sent to the AI. */
export interface WebsiteVisitor {
  name: string;
  phone: string;
  wechat?: string;
  email?: string;
  locale: string;
  booking?: { date: string; time: string };
  /** When the customer asked to be called back. */
  callbackAt?: number;
  /** When they left the number on the form that says staff may answer by WhatsApp or SMS. */
  consentAt?: number;
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
  archived?: boolean;
  /** A website customer's chat: their name, or "" before they give it. */
  website?: string;
  /** The website customer asked to be called back. */
  callback?: boolean;
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
  if (email === WEBSITE_CUSTOMER) return "网站客人";
  return email.split("@")[0];
}

export const ASSISTANT = "assistant";
/** Author of a website customer's messages. */
export const WEBSITE_CUSTOMER = "website";
