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

/** The conversation as the link shows it: as it is now, minus the list of links. */
function snapshot(conversation: Conversation): Conversation {
  const copy = structuredClone(conversation);
  delete copy.shares;
  return copy;
}

export class ShareStore {
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
    if (!isShareToken(token)) return null;
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
