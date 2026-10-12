/**
 * Server-side session against speedDIAL 2.0 (speeddial.worldpac.com).
 *
 * speedDIAL has no public API. This client replays the same JSON calls the
 * speedDIAL web app makes, authenticated the same way the web app logs in:
 * the Salesforce community login widget on auth.worldpac.com issues an OAuth
 * code, speedDIAL's /v3/sfAuthCallback exchanges it for an HttpOnly session
 * cookie, and /v3/authCheck returns the CSRF token required on POST requests.
 *
 * Credentials come only from WORLDPAC_USERNAME / WORLDPAC_PASSWORD. Nothing
 * here logs them, and errors never echo request bodies.
 */

const SPEEDDIAL_ORIGIN = "https://speeddial.worldpac.com";
const MAX_REDIRECTS = 15;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_CONCURRENT_REQUESTS = 4;

export class WorldpacError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "http" | "upstream",
  ) {
    super(message);
    this.name = "WorldpacError";
  }
}

interface ClientInfo {
  clientVersion: string;
  sdproEnv: string;
  sfCommunity: string;
  sfClientId: string;
  sfRedirectUri: string;
  sfLoginIdSuffix: string;
  sfMaskRedirects: string;
}

export interface WorldpacCredentials {
  username: string;
  password: string;
}

type FetchLike = typeof fetch;

/** Minimal cookie jar: cookies are scoped by domain suffix; path is ignored. */
export class CookieJar {
  private readonly cookies = new Map<string, Map<string, string>>();

  store(url: string, setCookieHeaders: string[]): void {
    const host = new URL(url).hostname;
    for (const header of setCookieHeaders) {
      const [pair, ...attributes] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const domainAttr = attributes
        .map((a) => a.trim())
        .find((a) => a.toLowerCase().startsWith("domain="));
      const domain = (domainAttr?.slice(7) ?? host).replace(/^\./, "").toLowerCase();
      const expired = attributes.some((a) => {
        const t = a.trim().toLowerCase();
        return t === "max-age=0" || (t.startsWith("expires=") && Date.parse(a.trim().slice(8)) < Date.now());
      });
      const bucket = this.cookies.get(domain) ?? new Map<string, string>();
      if (expired || value === "") bucket.delete(name);
      else bucket.set(name, value);
      this.cookies.set(domain, bucket);
    }
  }

  header(url: string): string {
    const host = new URL(url).hostname.toLowerCase();
    const parts: string[] = [];
    for (const [domain, bucket] of this.cookies) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        for (const [name, value] of bucket) parts.push(`${name}=${value}`);
      }
    }
    return parts.join("; ");
  }

  clear(): void {
    this.cookies.clear();
  }
}

/** Pull a follow-up URL out of an HTML/JS redirect page (masked redirects). */
export function extractClientRedirect(html: string, baseUrl: string): string | null {
  const patterns = [
    /window\.location\.(?:href|replace)\s*(?:=|\()\s*['"]([^'"]+)['"]/i,
    /location\.(?:href|replace)\s*(?:=|\()\s*['"]([^'"]+)['"]/i,
    /http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>]+)["']/i,
    /handleRedirect\(\s*['"]([^'"]+)['"]/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const raw = match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&");
      try {
        return new URL(raw, baseUrl).toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function semaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

export class WorldpacClient {
  private readonly jar = new CookieJar();
  private info: ClientInfo | null = null;
  private csrfToken: string | null = null;
  private loginInFlight: Promise<void> | null = null;
  private readonly limit = semaphore(MAX_CONCURRENT_REQUESTS);

  constructor(
    private readonly credentials: WorldpacCredentials,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** GET a speedDIAL /v3 path; logs in on first use and once more on expiry. */
  async get<T>(path: string): Promise<T> {
    return this.withSession(() => this.call<T>("GET", path));
  }

  /** POST to a speedDIAL /v3 path with the standard {header, data} envelope. */
  async post<T>(path: string, data: unknown): Promise<T> {
    return this.withSession(() => this.call<T>("POST", path, data));
  }

  /** Force a fresh login. Used by the connection check script. */
  async login(): Promise<void> {
    if (!this.loginInFlight) {
      this.loginInFlight = this.performLogin().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  private async withSession<T>(request: () => Promise<T>): Promise<T> {
    if (!this.csrfToken) await this.login();
    try {
      return await this.limit(request);
    } catch (error) {
      if (error instanceof WorldpacError && error.kind === "auth") {
        this.csrfToken = null;
        await this.login();
        return this.limit(request);
      }
      throw error;
    }
  }

  private async call<T>(method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
    const info = await this.clientInfo();
    const url = `${SPEEDDIAL_ORIGIN}/v3/${path.replace(/^\/+/, "")}`;
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      Cookie: this.jar.header(url),
    };
    let body: string | undefined;
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = this.csrfToken ?? "";
      body = JSON.stringify({
        header: { clientVersion: info.clientVersion, clientInfo: "WEB", referrerID: "sDPro" },
        data,
      });
    }
    const response = await this.timedFetch(url, { method, headers, body, redirect: "manual" });
    this.jar.store(url, response.headers.getSetCookie());
    if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
      throw new WorldpacError(`speedDIAL session rejected (${response.status})`, "auth");
    }
    if (!response.ok) {
      throw new WorldpacError(`speedDIAL ${path} failed with ${response.status}`, "http");
    }
    const json = (await response.json()) as T & { status?: { code?: number; message?: { ID?: string } } };
    const code = json?.status?.code;
    if (code === 401 || code === 403) {
      throw new WorldpacError("speedDIAL session expired", "auth");
    }
    return json;
  }

  private async clientInfo(): Promise<ClientInfo> {
    if (this.info) return this.info;
    const response = await this.timedFetch(`${SPEEDDIAL_ORIGIN}/v3/clientinfo`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new WorldpacError(`speedDIAL clientinfo failed with ${response.status}`, "upstream");
    }
    const json = (await response.json()) as Partial<ClientInfo>;
    const required: Array<keyof ClientInfo> = [
      "clientVersion",
      "sfCommunity",
      "sfClientId",
      "sfRedirectUri",
    ];
    for (const key of required) {
      if (!json[key]) throw new WorldpacError(`speedDIAL clientinfo missing ${key}`, "upstream");
    }
    this.info = {
      clientVersion: json.clientVersion!,
      sdproEnv: json.sdproEnv ?? "PROD",
      sfCommunity: json.sfCommunity!,
      sfClientId: json.sfClientId!,
      sfRedirectUri: json.sfRedirectUri!,
      sfLoginIdSuffix: json.sfLoginIdSuffix ?? "",
      sfMaskRedirects: json.sfMaskRedirects ?? "true",
    };
    return this.info;
  }

  private async performLogin(): Promise<void> {
    const { username, password } = this.credentials;
    if (!username || !password) {
      throw new WorldpacError("WORLDPAC_USERNAME / WORLDPAC_PASSWORD are not set", "config");
    }
    this.jar.clear();
    this.csrfToken = null;
    const info = await this.clientInfo();

    const startUrl =
      `/services/oauth2/authorize?response_type=code&client_id=${info.sfClientId}` +
      `&redirect_uri=${encodeURIComponent(info.sfRedirectUri)}` +
      `&state=${encodeURIComponent(JSON.stringify({ sdproEnv: info.sdproEnv }))}`;
    const form = new URLSearchParams({
      username: `${username}${info.sfLoginIdSuffix}`,
      password,
      startURL: startUrl,
      mode: "inline",
      maskRedirects: info.sfMaskRedirects,
    });
    const widget = await this.timedFetch(
      `${info.sfCommunity}/servlet/servlet.loginwidgetcontroller?type=login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString(),
      },
    );
    if (!widget.ok) {
      throw new WorldpacError(`WorldPac login widget returned ${widget.status}`, "auth");
    }
    const { result } = (await widget.json()) as { result?: string };
    if (!result || result === "invalid") {
      throw new WorldpacError("WorldPac rejected the username or password", "auth");
    }
    const communityOrigin = new URL(info.sfCommunity).origin;
    if (new URL(result, communityOrigin).origin !== communityOrigin) {
      throw new WorldpacError("WorldPac login returned an unexpected redirect origin", "auth");
    }

    await this.followRedirects(new URL(result, communityOrigin).toString());

    const check = await this.timedFetch(`${SPEEDDIAL_ORIGIN}/v3/authCheck`, {
      headers: { Accept: "application/json", Cookie: this.jar.header(SPEEDDIAL_ORIGIN) },
      redirect: "manual",
    });
    this.jar.store(SPEEDDIAL_ORIGIN, check.headers.getSetCookie());
    const auth = check.ok ? ((await check.json()) as { csrfToken?: string }) : {};
    if (!auth.csrfToken) {
      throw new WorldpacError(
        "WorldPac login did not produce a speedDIAL session (identity verification may be required)",
        "auth",
      );
    }
    this.csrfToken = auth.csrfToken;
  }

  private async followRedirects(startUrl: string): Promise<void> {
    let url = startUrl;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      const response = await this.timedFetch(url, {
        headers: { Accept: "text/html,application/json", Cookie: this.jar.header(url) },
        redirect: "manual",
      });
      this.jar.store(url, response.headers.getSetCookie());
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url).toString();
        continue;
      }
      if (new URL(url).origin === SPEEDDIAL_ORIGIN) return;
      const html = await response.text();
      const next = extractClientRedirect(html, url);
      if (!next) return;
      url = next;
    }
    throw new WorldpacError("WorldPac login redirected too many times", "auth");
  }

  private async timedFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof WorldpacError) throw error;
      throw new WorldpacError(`WorldPac request failed: ${(error as Error).name}`, "upstream");
    } finally {
      clearTimeout(timer);
    }
  }
}

let shared: WorldpacClient | null = null;

/** Process-wide client built from env vars; one session shared by all chats. */
export function getWorldpacClient(): WorldpacClient {
  if (!shared) {
    shared = new WorldpacClient({
      username: process.env.WORLDPAC_USERNAME ?? "",
      password: process.env.WORLDPAC_PASSWORD ?? "",
    });
  }
  return shared;
}
