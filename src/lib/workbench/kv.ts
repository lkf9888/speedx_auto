/**
 * Cloudflare Workers KV over its REST API, for the workbench's shared data
 * (memory notes, conversations). Credentials: WORKBENCH_KV_ACCOUNT_ID /
 * WORKBENCH_KV_NAMESPACE_ID / WORKBENCH_KV_API_TOKEN.
 */

export class KvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KvError";
  }
}

export interface KvClient {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every key with the prefix (all pages). */
  list(prefix: string): Promise<string[]>;
}

export function cloudflareKv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): KvClient | null {
  const account = env.WORKBENCH_KV_ACCOUNT_ID?.trim();
  const namespace = env.WORKBENCH_KV_NAMESPACE_ID?.trim();
  const token = env.WORKBENCH_KV_API_TOKEN?.trim();
  if (!account || !namespace || !token) return null;
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/storage/kv/namespaces/${encodeURIComponent(namespace)}`;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetchImpl(`${base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (error) {
      throw new KvError(`Cloudflare KV request failed: ${(error as Error).name}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const valuePath = (key: string) => `/values/${encodeURIComponent(key)}`;

  return {
    async get(key) {
      const response = await call(valuePath(key));
      if (response.status === 404) return null;
      if (!response.ok) throw new KvError(`Cloudflare KV read failed with ${response.status}`);
      return response.text();
    },
    async put(key, value) {
      const response = await call(valuePath(key), { method: "PUT", body: value, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      if (!response.ok) throw new KvError(`Cloudflare KV write failed with ${response.status}`);
    },
    async delete(key) {
      const response = await call(valuePath(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new KvError(`Cloudflare KV delete failed with ${response.status}`);
    },
    async list(prefix) {
      const keys: string[] = [];
      let cursor = "";
      for (let page = 0; page < 50; page += 1) {
        const params = new URLSearchParams({ prefix, limit: "1000", ...(cursor ? { cursor } : {}) });
        const response = await call(`/keys?${params}`);
        if (!response.ok) throw new KvError(`Cloudflare KV list failed with ${response.status}`);
        const json = (await response.json()) as { result?: Array<{ name: string }>; result_info?: { cursor?: string } };
        keys.push(...(json.result ?? []).map((k) => k.name));
        cursor = json.result_info?.cursor ?? "";
        if (!cursor) break;
      }
      return keys;
    },
  };
}

/** In-memory KV for tests and local development. */
export function memoryKv(initial: Record<string, string> = {}): KvClient & { data: Map<string, string>; writes: number } {
  const data = new Map(Object.entries(initial));
  const kv = {
    data,
    writes: 0,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      kv.writes += 1;
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list(prefix: string) {
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
  };
  return kv;
}
