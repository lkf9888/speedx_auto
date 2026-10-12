/**
 * Server-side record of one estimate-assistant visit, kept so the shop can be
 * emailed a follow-up when the visitor leaves or stops replying.
 *
 * Sessions live in process memory (single Render instance). A deploy or
 * restart drops open sessions without an email; finished sessions are
 * removed right after their follow-up is handed off.
 */
import { randomBytes } from "node:crypto";
import type { Lead } from "./lead";
import type { EstimateCard } from "./pricing";

export const IDLE_FOLLOW_UP_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 1000;
const MAX_TRANSCRIPT = 80;

export type FinishReason = "left_page" | "idle";

export interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface ChatSession {
  id: string;
  lead: Lead;
  locale: string;
  startedAt: string;
  lastActivityAt: string;
  transcript: TranscriptLine[];
  estimates: EstimateCard[];
}

export type FollowUpHandler = (session: ChatSession, reason: FinishReason) => Promise<void>;

interface Entry {
  session: ChatSession;
  timer: ReturnType<typeof setTimeout> | null;
}

export class SessionStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly onFinish: FollowUpHandler,
    private readonly idleMs = IDLE_FOLLOW_UP_MS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(lead: Lead, locale: string): ChatSession {
    if (this.entries.size >= MAX_SESSIONS) {
      const oldest = this.entries.keys().next().value;
      if (oldest) void this.finish(oldest, "idle");
    }
    const at = this.now().toISOString();
    const session: ChatSession = {
      id: randomBytes(16).toString("hex"),
      lead,
      locale,
      startedAt: at,
      lastActivityAt: at,
      transcript: [],
      estimates: [],
    };
    this.entries.set(session.id, { session, timer: null });
    this.touch(session.id);
    return session;
  }

  get(id: string | null | undefined): ChatSession | undefined {
    return id ? this.entries.get(id)?.session : undefined;
  }

  record(id: string, line: Omit<TranscriptLine, "at">): void {
    const entry = this.entries.get(id);
    if (!entry || !line.text.trim()) return;
    if (entry.session.transcript.length < MAX_TRANSCRIPT) {
      entry.session.transcript.push({ ...line, text: line.text.slice(0, 4000), at: this.now().toISOString() });
    }
    this.touch(id);
  }

  recordEstimate(id: string, card: EstimateCard): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.session.estimates.push(card);
    this.touch(id);
  }

  /** Hand the session to the follow-up handler exactly once. */
  async finish(id: string, reason: FinishReason): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries.delete(id);
    try {
      await this.onFinish(entry.session, reason);
    } catch (error) {
      console.error("repair-followup failed", (error as Error).message);
    }
    return true;
  }

  get size(): number {
    return this.entries.size;
  }

  private touch(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.session.lastActivityAt = this.now().toISOString();
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void this.finish(id, "idle"), this.idleMs);
    entry.timer.unref?.();
  }
}
