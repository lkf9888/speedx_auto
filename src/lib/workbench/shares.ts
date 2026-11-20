/**
 * Share links for workbench conversations (Kevin, 2026-11-14): anyone with the
 * link can read a snapshot of the conversation without signing in, for three
 * days. The snapshot is the full staff view (Kevin chose it, costs included),
 * so the link is long and random, not indexed, and can be cancelled early.
 */
import { randomBytes } from "node:crypto";
import type { Conversation, ShareLink } from "./conversation-types";
import { cloudflareKv, type KvClient } from "./kv";

export const SHARE_DAYS = 3;
export const SHARE_MS = SHARE_DAYS * 24 * 60 * 60 * 1000;
/** Active links one conversation can have at once. */
export const MAX_SHARES = 10;
const PREFIX = "workbench-share-v1:";
/** Where a link's snapshot is stored, so deleting a conversation can drop its links too. */
export const shareKey = (token: string) => PREFIX + token;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export interface SharedConversation {
  token: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  conversation: Conversation;
}

export class ShareError extends Error {
  constructor(
    message: string,
    readonly kind: "full" | "upstream",
  ) {
    super(message);
    this.name = "ShareError";
  }
}

export const isShareToken = (token: unknown): token is string => typeof token === "string" && TOKEN.test(token);

/**
 * The conversation as the link shows it: what's on screen now. Error turns,
 * memory suggestions and ALLDATA draft details (customer, VIN, shop notes)
 * aren't shown, so they aren't sent either.
 */
export function snapshot(conversation: Conversation): Conversation {
  const copy = structuredClone(conversation);
  delete copy.shares;
  // Where the customer stands with the shop is for staff only; a link goes to people outside the team.
  delete copy.followStatus;
  delete copy.followLog;
  copy.turns = copy.turns
    // Log lines about what the customer saw are kept; error turns aren't.
    .filter((t) => !t.localOnly || t.event)
    .map((t) => {
      const turn = { ...t };
      delete turn.memories;
      // A proposed change to a real ALLDATA document (ids, what was altered) is for staff only.
      delete turn.changes;
      if (turn.drafts) turn.drafts = turn.drafts.map((d) => ({ id: d.id, created: d.created }) as typeof d);
      return turn;
    });
  return copy;
}

export class ShareStore {
  /** Cancelled here: Cloudflare KV can serve a deleted value for up to a minute, so this server refuses them at once. */
  private readonly revoked = new Set<string>();

  constructor(
    private readonly kv: KvClient,
    private readonly now: () => number = Date.now,
  ) {}

  /** A new link to a snapshot of the conversation, good for three days. */
  async create(conversation: Conversation, by: string): Promise<ShareLink> {
    const live = (conversation.shares ?? []).filter((s) => s.expiresAt > this.now());
    if (live.length >= MAX_SHARES) throw new ShareError(`这个会话已经有 ${MAX_SHARES} 个有效的分享链接，请先取消几个`, "full");
    const createdAt = this.now();
    const record: SharedConversation = {
      token: randomBytes(16).toString("base64url"),
      createdBy: by,
      createdAt,
      expiresAt: createdAt + SHARE_MS,
      conversation: snapshot(conversation),
    };
    try {
      // Cloudflare drops it by itself after three days; reads check the date too.
      await this.kv.put(PREFIX + record.token, JSON.stringify(record), { ttlSeconds: SHARE_MS / 1000 });
    } catch (error) {
      throw new ShareError((error as Error).message, "upstream");
    }
    return { token: record.token, createdBy: by, createdAt, expiresAt: record.expiresAt };
  }

  /** The shared snapshot, or null when the link is unknown, cancelled or past its date. */
  async get(token: string): Promise<SharedConversation | null> {
    if (!isShareToken(token) || this.revoked.has(token)) return null;
    let raw: string | null;
    try {
      raw = await this.kv.get(PREFIX + token);
    } catch (error) {
      throw new ShareError((error as Error).message, "upstream");
    }
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as SharedConversation;
      if (record.token !== token || !(record.expiresAt > this.now())) return null;
      return record;
    } catch {
      return null;
    }
  }

  /** Stops the link working now. */
  async revoke(token: string): Promise<void> {
    if (!isShareToken(token)) return;
    this.revoked.add(token);
    try {
      await this.kv.delete(PREFIX + token);
    } catch (error) {
      throw new ShareError((error as Error).message, "upstream");
    }
  }
}

let shared: ShareStore | null | undefined;

export function getShareStore(): ShareStore | null {
  if (shared === undefined) {
    const kv = cloudflareKv();
    shared = kv ? new ShareStore(kv) : null;
  }
  return shared;
}
