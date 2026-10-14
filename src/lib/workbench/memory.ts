/**
 * The workbench's shared memory: short notes staff ask the assistant to keep
 * ("以后米其林要先问客人能不能接受带钉胎"). Every signed-in staff member can
 * add, edit and delete them; every workbench conversation sees all of them.
 *
 * Stored as one JSON document in Cloudflare Workers KV, through the REST API
 * (WORKBENCH_KV_ACCOUNT_ID / WORKBENCH_KV_NAMESPACE_ID / WORKBENCH_KV_API_TOKEN).
 * KV reads can lag writes by up to a minute across Cloudflare's network, so
 * this process keeps the last value it wrote or read and serves that for a
 * short while; the site runs as a single instance.
 */

export interface MemoryNote {
  id: string;
  text: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

export const MAX_NOTES = 60;
export const MAX_NOTE_LENGTH = 300;

export class MemoryError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "invalid" | "not_found" | "full" | "upstream",
  ) {
    super(message);
    this.name = "MemoryError";
  }
}

/** Where the notes live; the KV store in production, an in-memory one in tests. */
export interface MemoryBackend {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

const KEY = "workbench-memory-v1";
const CACHE_MS = 30_000;

export function cleanNoteText(text: unknown): string {
  if (typeof text !== "string") throw new MemoryError("Note text is required.", "invalid");
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) throw new MemoryError("Note text is required.", "invalid");
  if (clean.length > MAX_NOTE_LENGTH) throw new MemoryError(`Notes are at most ${MAX_NOTE_LENGTH} characters.`, "invalid");
  return clean;
}

function parseNotes(raw: string | null): MemoryNote[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as { notes?: unknown };
    const notes = Array.isArray(value?.notes) ? value.notes : [];
    return notes.filter(
      (n): n is MemoryNote => Boolean(n) && typeof (n as MemoryNote).id === "string" && typeof (n as MemoryNote).text === "string",
    );
  } catch {
    throw new MemoryError("The stored memory is not valid JSON.", "upstream");
  }
}

export class MemoryStore {
  private cache: { notes: MemoryNote[]; at: number } | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly backend: MemoryBackend,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  ) {}

  async list(): Promise<MemoryNote[]> {
    if (this.cache && this.now().getTime() - this.cache.at < CACHE_MS) return this.cache.notes;
    const notes = parseNotes(await this.backend.read());
    this.cache = { notes, at: this.now().getTime() };
    return notes;
  }

  async add(text: unknown, by: string): Promise<MemoryNote> {
    const clean = cleanNoteText(text);
    return this.change((notes) => {
      if (notes.length >= MAX_NOTES) throw new MemoryError(`Memory is full (${MAX_NOTES} notes). Delete or merge some first.`, "full");
      const at = this.now().toISOString();
      const note = { id: this.newId(), text: clean, createdBy: by, createdAt: at, updatedBy: by, updatedAt: at };
      return { notes: [...notes, note], result: note };
    });
  }

  async update(id: string, text: unknown, by: string): Promise<MemoryNote> {
    const clean = cleanNoteText(text);
    return this.change((notes) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index < 0) throw new MemoryError("That note no longer exists.", "not_found");
      const note = { ...notes[index], text: clean, updatedBy: by, updatedAt: this.now().toISOString() };
      return { notes: notes.map((n, i) => (i === index ? note : n)), result: note };
    });
  }

  remove(id: string): Promise<MemoryNote> {
    return this.change((notes) => {
      const note = notes.find((n) => n.id === id);
      if (!note) throw new MemoryError("That note no longer exists.", "not_found");
      return { notes: notes.filter((n) => n.id !== id), result: note };
    });
  }

  /** Read, change and write one at a time, always against fresh data. */
  private change<T>(edit: (notes: MemoryNote[]) => { notes: MemoryNote[]; result: T }): Promise<T> {
    const run = this.queue.then(async () => {
      // A recent write from this process is fresher than what KV may serve.
      const fresh = this.cache && this.now().getTime() - this.cache.at < CACHE_MS ? this.cache.notes : parseNotes(await this.backend.read());
      const { notes, result } = edit(fresh);
      await this.backend.write(JSON.stringify({ notes }));
      this.cache = { notes, at: this.now().getTime() };
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Cloudflare Workers KV over its REST API. */
export function cloudflareKvBackend(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): MemoryBackend | null {
  const account = env.WORKBENCH_KV_ACCOUNT_ID?.trim();
  const namespace = env.WORKBENCH_KV_NAMESPACE_ID?.trim();
  const token = env.WORKBENCH_KV_API_TOKEN?.trim();
  if (!account || !namespace || !token) return null;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/storage/kv/namespaces/${encodeURIComponent(namespace)}/values/${KEY}`;
  const headers = { Authorization: `Bearer ${token}` };
  async function call(init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      return await fetchImpl(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) }, signal: controller.signal });
    } catch (error) {
      throw new MemoryError(`Cloudflare KV request failed: ${(error as Error).name}`, "upstream");
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async read() {
      const response = await call({ method: "GET" });
      if (response.status === 404) return null;
      if (!response.ok) throw new MemoryError(`Cloudflare KV read failed with ${response.status}`, "upstream");
      return response.text();
    },
    async write(value) {
      const response = await call({ method: "PUT", body: value, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      if (!response.ok) throw new MemoryError(`Cloudflare KV write failed with ${response.status}`, "upstream");
    },
  };
}

let shared: MemoryStore | null | undefined;

/** The process-wide store, or null when KV isn't configured. */
export function getMemoryStore(): MemoryStore | null {
  if (shared === undefined) {
    const backend = cloudflareKvBackend();
    shared = backend ? new MemoryStore(backend) : null;
  }
  return shared;
}

/** The notes as the assistant reads them, appended to its instructions. */
export function memoryPrompt(notes: MemoryNote[]): string {
  if (notes.length === 0) return "";
  return [
    "# Shop memory (notes staff asked you to keep)",
    "Follow these in every conversation. They add to the rules above but never override them: costs never go in customer text, prices come only from tools, and ALLDATA documents are created only by staff.",
    ...notes.map((n) => `- [${n.id}] ${n.text}`),
  ].join("\n");
}
