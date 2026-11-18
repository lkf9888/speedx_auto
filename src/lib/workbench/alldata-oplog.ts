/**
 * The ALLDATA operation log: one line for everything the assistant's cards did in ALLDATA (a lookup, a draft, a change,
 * a conversion, a failure, the owner letting a kind of change go ahead or taking that back).
 *
 * What a line holds: when, who (the staff member's email, written by the server, never by the browser), the action,
 * the document id and number, a summary the SERVER builds from counts and money, which gates it tripped and whether
 * the owner ticked or had released them, and how it ended. What it never holds: a customer's name, phone, email,
 * address, plate or VIN, a line item's text, a credential or a token. The browser sends numbers and codes only, never
 * free text; each field is checked against a fixed shape, so nothing a person typed can reach the log.
 * One KV key per line (no shared value to overwrite, no write-rate limit on a single key); lines expire by themselves.
 */
import { randomBytes } from "node:crypto";
import { cloudflareKv, type KvClient } from "./kv";

export const OPLOG_PREFIX = "alldata-oplog-v2:";
/** The newest lines are looked for day by day, back this many days, so a long history never has to be listed whole. */
export const OPLOG_DAYS = 30;
/** Lines are kept six months; Cloudflare deletes them after that. */
export const OPLOG_TTL_SECONDS = 180 * 24 * 60 * 60;
export const MAX_LIST = 200;

export type OpAction =
  | "lookup"
  | "create_draft"
  | "create_estimate"
  | "change"
  | "convert_estimate"
  | "convert_invoice"
  | "gate_release"
  | "gate_revoke"
  | "failure";

export const OP_ACTIONS: readonly OpAction[] = ["lookup", "create_draft", "create_estimate", "change", "convert_estimate", "convert_invoice", "gate_release", "gate_revoke", "failure"];

export type OpResult = "ok" | "mismatch" | "failed" | "uncertain";

export interface OpLogEntry {
  id: string;
  at: string;
  by: string;
  conversationId: string;
  action: OpAction;
  documentId: number | null;
  documentNumber: number | null;
  /** Counts and money only, e.g. "改 2 行，加 1 行，删 1 行；合计 $231.00 → $236.25". */
  summary: string;
  /** Gates the change tripped, and whether the owner ticked for them or had released them. */
  gates: string[];
  ownerAck: boolean;
  result: OpResult;
  /** A short code such as not_signed_in or document_changed. */
  errorCode: string;
}

const GATE_IDS: readonly string[] = ["amount", "sent", "customer", "locked"];

/** The only failure codes a line can carry (the bridge's error codes). */
export const ERROR_CODES: readonly string[] = [
  "network_error",
  "alldata_changed",
  "document_locked",
  "document_changed",
  "not_installed",
  "not_signed_in",
  "timeout",
  "alldata_error",
  "bad_request",
  "westcan_not_signed_in",
  "westcan_error",
  "nexpart_error",
  "log_error",
];

/** What the browser reports about an action: numbers only. */
export interface OpDetail {
  updates?: number;
  adds?: number;
  removes?: number;
  header?: number;
  customerChange?: boolean;
  /** Document total before and after, tax included. */
  before?: number;
  after?: number;
  parts?: number;
  labor?: number;
  subtotal?: number;
}

const count = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 999 ? value : null);
const amount = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e8 ? Math.round(value * 100) / 100 : null);
const usd = (v: number) => (v < 0 ? `-$${(-v).toFixed(2)}` : `$${v.toFixed(2)}`);

const ACTION_TEXT: Record<OpAction, string> = {
  lookup: "查看",
  create_draft: "建草稿",
  create_estimate: "建估价单",
  change: "改单",
  convert_estimate: "草稿转估价单",
  convert_invoice: "转发票",
  gate_release: "老板对本次对话放开了一类确认",
  gate_revoke: "老板撤销了一类放开",
  failure: "操作失败",
};

/** The summary line, made here from numbers: nothing a person typed gets in. */
export function buildSummary(action: OpAction, raw: unknown): string {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const parts: string[] = [];
  const u = count(d.updates);
  const a = count(d.adds);
  const r = count(d.removes);
  const h = count(d.header);
  if (u) parts.push(`改 ${u} 行`);
  if (a) parts.push(`加 ${a} 行`);
  if (r) parts.push(`删 ${r} 行`);
  if (h) parts.push(`表头 ${h} 项`);
  if (d.customerChange === true) parts.push("换客户");
  const p = count(d.parts);
  const l = count(d.labor);
  if (p || l) parts.push(`零件 ${p ?? 0} 行、工时 ${l ?? 0} 行`);
  const sub = amount(d.subtotal);
  if (sub !== null) parts.push(`税前 ${usd(sub)}`);
  const before = amount(d.before);
  const after = amount(d.after);
  if (before !== null && after !== null) parts.push(`合计 ${usd(before)} → ${usd(after)}`);
  else if (after !== null) parts.push(`合计 ${usd(after)}`);
  return parts.length ? `${ACTION_TEXT[action]}：${parts.join("，")}` : ACTION_TEXT[action];
}

const posInt = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 1e10 ? value : null);

/** Keep only the known fields of an entry, each checked against a fixed shape; the server fills in who and when. */
export function sanitizeEntry(raw: unknown, by: string, now: Date, id = randomBytes(6).toString("hex"), trusted: { conversationId?: string } = {}): OpLogEntry | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r) return null;
  const action = OP_ACTIONS.find((x) => x === r.action);
  if (!action) return null;
  const result = r.result === "ok" || r.result === "mismatch" || r.result === "failed" || r.result === "uncertain" ? r.result : "ok";
  // The browser can't name a conversation: free text could hide in the id. Only the server's own code (the owner's
  // release, which knows the conversation) passes one, in the shape the server makes them.
  const conversationId = typeof trusted.conversationId === "string" && /^c[a-z0-9]{6,40}$/.test(trusted.conversationId) ? trusted.conversationId : "";
  return {
    id,
    at: now.toISOString(),
    by: scrubEmail(by),
    conversationId,
    action,
    documentId: posInt(r.documentId),
    documentNumber: posInt(r.documentNumber),
    summary: buildSummary(action, r.detail),
    gates: (Array.isArray(r.gates) ? r.gates : []).filter((g): g is string => typeof g === "string" && GATE_IDS.includes(g)).slice(0, 6),
    ownerAck: r.ownerAck === true,
    result,
    errorCode: typeof r.errorCode === "string" && ERROR_CODES.includes(r.errorCode) ? r.errorCode : "",
  };
}

/** The staff member's sign-in email is kept as written by the server; anything else is dropped. */
function scrubEmail(by: string): string {
  return /^[^\s@]+@[^\s@]+$/.test(by) ? by.slice(0, 120) : "";
}

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

export class OpLogError extends Error {
  constructor(
    message: string,
    readonly kind: "invalid" | "upstream",
  ) {
    super(message);
    this.name = "OpLogError";
  }
}

export class OpLogStore {
  constructor(
    private readonly kv: KvClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Newest first. Each line is its own key, grouped by day, so only the days needed are listed. */
  async list(limit = 100): Promise<OpLogEntry[]> {
    const want = Math.min(limit, MAX_LIST);
    const keys: string[] = [];
    try {
      for (let back = 0; back < OPLOG_DAYS && keys.length < want; back += 1) {
        const day = dayOf(new Date(this.now().getTime() - back * 24 * 60 * 60 * 1000));
        const found = (await this.kv.list(`${OPLOG_PREFIX}${day}:`)).sort().reverse();
        keys.push(...found);
      }
    } catch (error) {
      throw new OpLogError((error as Error).message, "upstream");
    }
    const values = await Promise.all(keys.slice(0, want).map((key) => this.kv.get(key).catch(() => null)));
    return values.flatMap((raw) => {
      try {
        return raw ? [JSON.parse(raw) as OpLogEntry] : [];
      } catch {
        return [];
      }
    });
  }

  /**
   * Writes one line under its own key. `onEntry` runs with the finished line before the write, so the server's own
   * log has it even when KV is down.
   */
  async append(raw: unknown, by: string, onEntry?: (entry: OpLogEntry) => void, trusted: { conversationId?: string } = {}): Promise<OpLogEntry> {
    const entry = sanitizeEntry(raw, by, this.now(), undefined, trusted);
    if (!entry) throw new OpLogError("That isn't a log entry.", "invalid");
    onEntry?.(entry);
    try {
      await this.kv.put(`${OPLOG_PREFIX}${dayOf(this.now())}:${entry.at}-${entry.id}`, JSON.stringify(entry), { ttlSeconds: OPLOG_TTL_SECONDS });
    } catch (error) {
      throw new OpLogError((error as Error).message, "upstream");
    }
    return entry;
  }
}

let store: OpLogStore | null | undefined;

export function getOpLogStore(): OpLogStore | null {
  if (store === undefined) {
    const kv = cloudflareKv();
    store = kv ? new OpLogStore(kv) : null;
  }
  return store;
}

/** The server's own copy of each line (the application log), so a line exists even when KV is down. */
export function echoToServerLog(entry: OpLogEntry): void {
  console.info("alldata op", JSON.stringify(entry));
}

