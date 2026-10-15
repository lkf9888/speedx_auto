/**
 * The workbench's shared conversations, kept in Cloudflare KV (one key per
 * conversation). The site runs as one instance, so this process loads every
 * conversation once and then serves and updates its own copy; KV only has to
 * be read at start-up, and each change is a single write.
 */
import { randomBytes } from "node:crypto";
import { cloudflareKv, type KvClient } from "./kv";
import type { Conversation, ConversationSummary, PendingQuery, Turn, Vehicle } from "./conversation-types";

const PREFIX = "workbench-conv-v1:";
export const MAX_CONVERSATIONS = 300;
export const MAX_TURNS = 200;
const TITLE_LENGTH = 60;

export class ConversationError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "invalid" | "upstream",
  ) {
    super(message);
    this.name = "ConversationError";
  }
}

export function newConversationId(): string {
  return `c${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export function newTurnId(): string {
  return `t${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

function isConversation(value: unknown): value is Conversation {
  const c = value as Conversation;
  return Boolean(c) && typeof c.id === "string" && Array.isArray(c.turns);
}

export function summarize(c: Conversation): ConversationSummary {
  const last = c.turns[c.turns.length - 1];
  const lastText = last ? last.text.trim() || (last.attachments?.length ? `📎 ${last.attachments[0].name}` : "") : "";
  return {
    id: c.id,
    title: c.title,
    vehicle: c.vehicle?.label ?? "",
    updatedAt: c.updatedAt,
    last: lastText.replace(/\s+/g, " ").slice(0, 120),
    lastAuthor: last?.author ?? "",
    turns: c.turns.length,
    ...(c.archived ? { archived: true } : {}),
  };
}

export class ConversationStore {
  private cache: Map<string, Conversation> | null = null;
  private loading: Promise<Map<string, Conversation>> | null = null;
  private locks = new Map<string, Promise<unknown>>();
  /** Questions being answered right now, by conversation. */
  readonly pending = new Map<string, PendingQuery>();

  constructor(
    private readonly kv: KvClient,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async all(): Promise<Map<string, Conversation>> {
    if (this.cache) return this.cache;
    this.loading ??= (async () => {
      const keys = await this.kv.list(PREFIX);
      const map = new Map<string, Conversation>();
      // A few at a time: start-up reads, not a burst.
      for (let i = 0; i < keys.length; i += 10) {
        const values = await Promise.all(keys.slice(i, i + 10).map((k) => this.kv.get(k)));
        for (const raw of values) {
          try {
            const c = raw ? (JSON.parse(raw) as unknown) : null;
            if (isConversation(c)) map.set(c.id, c);
          } catch {
            // A damaged entry is skipped, not fatal.
          }
        }
      }
      this.cache = map;
      return map;
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  async list(): Promise<ConversationSummary[]> {
    const map = await this.all();
    return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(summarize);
  }

  async get(id: string): Promise<Conversation | null> {
    return (await this.all()).get(id) ?? null;
  }

  /** Change one conversation at a time, then write it once. Creates it when `create` is given. */
  async change(id: string, by: string, edit: (c: Conversation) => Conversation | void, create = false): Promise<Conversation> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const run = previous.then(async () => {
      const map = await this.all();
      let current = map.get(id);
      if (!current) {
        if (!create) throw new ConversationError("That conversation no longer exists.", "not_found");
        const at = this.now();
        current = { id, title: "", vehicle: null, createdBy: by, createdAt: at, updatedBy: by, updatedAt: at, turns: [] };
      }
      const draft: Conversation = structuredClone(current);
      const edited = edit(draft) ?? draft;
      edited.turns = edited.turns.slice(-MAX_TURNS);
      edited.updatedBy = by;
      edited.updatedAt = this.now();
      await this.kv.put(PREFIX + id, JSON.stringify(edited));
      map.set(id, edited);
      await this.trim(map);
      return edited;
    });
    this.locks.set(
      id,
      run.catch(() => undefined),
    );
    return run;
  }

  /** Keep the newest conversations; the oldest go once there are too many. */
  private async trim(map: Map<string, Conversation>) {
    if (map.size <= MAX_CONVERSATIONS) return;
    const oldest = [...map.values()].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, map.size - MAX_CONVERSATIONS);
    for (const c of oldest) {
      map.delete(c.id);
      await this.kv.delete(PREFIX + c.id).catch(() => undefined);
    }
  }

  async append(id: string, by: string, turns: Turn[], vehicle?: Vehicle, title?: string): Promise<Conversation> {
    return this.change(
      id,
      by,
      (c) => {
        c.turns.push(...turns);
        // A new message brings an archived conversation back, like WhatsApp.
        delete c.archived;
        if (vehicle !== undefined) c.vehicle = vehicle;
        if (!c.title && title) c.title = title.slice(0, TITLE_LENGTH);
      },
      true,
    );
  }

  async rename(id: string, by: string, title: string): Promise<Conversation> {
    return this.change(id, by, (c) => {
      const clean = title.replace(/\s+/g, " ").trim().slice(0, TITLE_LENGTH);
      c.title = clean || c.turns.find((t) => t.role === "user")?.text.slice(0, 30) || "";
    });
  }

  async setArchived(id: string, by: string, archived: boolean): Promise<Conversation> {
    return this.change(id, by, (c) => {
      if (archived) c.archived = true;
      else delete c.archived;
    });
  }

  async remove(id: string): Promise<void> {
    const map = await this.all();
    if (!map.has(id)) throw new ConversationError("That conversation no longer exists.", "not_found");
    await this.kv.delete(PREFIX + id);
    map.delete(id);
    this.pending.delete(id);
  }

  /** Record that a card was acted on (ALLDATA estimate created, memory note saved). */
  async markCard(id: string, by: string, card: { kind: "draft"; itemId: string; created: unknown } | { kind: "memory"; itemId: string }): Promise<Conversation> {
    return this.change(id, by, (c) => {
      for (const turn of c.turns) {
        if (card.kind === "draft" && turn.drafts?.some((d) => d.id === card.itemId)) {
          turn.drafts = turn.drafts.map((d) => (d.id === card.itemId ? { ...d, created: card.created as never } : d));
        }
        if (card.kind === "memory" && turn.memories?.some((m) => m.id === card.itemId)) {
          turn.memories = turn.memories.map((m) => (m.id === card.itemId ? { ...m, saved: true } : m));
        }
      }
    });
  }

  /** One-time upload of conversations a browser kept locally before they moved to the cloud. */
  async importLocal(by: string, conversations: unknown[]): Promise<number> {
    let imported = 0;
    for (const raw of conversations.slice(0, 50)) {
      const c = raw as Partial<Conversation> & { turns?: Array<Partial<Turn>> };
      if (!c || typeof c.id !== "string" || !Array.isArray(c.turns) || c.turns.length === 0) continue;
      if (await this.get(c.id)) continue;
      const turns: Turn[] = c.turns.slice(-MAX_TURNS).map((t) => ({
        id: newTurnId(),
        role: t.role === "assistant" ? "assistant" : "user",
        text: typeof t.text === "string" ? t.text : "",
        author: t.role === "assistant" ? "assistant" : by,
        at: typeof t.at === "number" ? t.at : (c.updatedAt as number) || this.now(),
        quotes: Array.isArray(t.quotes) ? t.quotes : [],
        ...(t.drafts ? { drafts: t.drafts } : {}),
        ...(t.memories ? { memories: t.memories } : {}),
        ...(t.attachments ? { attachments: t.attachments.map(({ name, mediaType }) => ({ name, mediaType })) } : {}),
        ...(t.localOnly ? { localOnly: true } : {}),
      }));
      await this.change(
        c.id,
        by,
        (conv) => {
          conv.title = typeof c.title === "string" ? c.title.slice(0, TITLE_LENGTH) : "";
          conv.vehicle = (c.vehicle as Vehicle) ?? null;
          conv.turns = turns;
          conv.createdAt = turns[0]?.at ?? conv.createdAt;
        },
        true,
      );
      imported += 1;
    }
    return imported;
  }
}

let shared: ConversationStore | null | undefined;

/** The process-wide store, or null when KV isn't configured. */
export function getConversationStore(): ConversationStore | null {
  if (shared === undefined) {
    const kv = cloudflareKv();
    shared = kv ? new ConversationStore(kv) : null;
  }
  return shared;
}
