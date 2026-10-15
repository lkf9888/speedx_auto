/**
 * Server-side session against Wheel Mart Canada (wheelmartcanada.ca), a local
 * wholesaler of value tire brands. Its own API is switched off for our
 * account, so this client signs in through the site's login form (Yii, with a
 * CSRF token) and reads the tire inventory search, the same page staff see.
 *
 * Credentials come only from WHEELMART_EMAIL / WHEELMART_PASSWORD. Nothing
 * here logs them, and errors never echo request bodies.
 */
import { TtlCache } from "@/lib/worldpac/cache";
import { CookieJar } from "@/lib/worldpac/client";
import { isWheelmartLoginPage, parseWheelmartPage, searchDigits, type WheelmartPage } from "./parse";

const ORIGIN = "https://wheelmartcanada.ca";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 8;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export class WheelmartError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "http" | "upstream",
  ) {
    super(message);
    this.name = "WheelmartError";
  }
}

type FetchLike = typeof fetch;

export class WheelmartClient {
  private readonly jar = new CookieJar();
  private signedIn = false;
  private loginInFlight: Promise<void> | null = null;

  constructor(
    private readonly credentials: { email: string; password: string },
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /** Every tire listed for one size (the site matches the digits anywhere in its size code). */
  async searchBySize(size: string): Promise<WheelmartPage> {
    const digits = searchDigits(size);
    if (!digits) return { total: 0, tires: [] };
    if (!this.signedIn) await this.login();
    const html = await this.searchPage(digits);
    if (html !== null) return parseWheelmartPage(html);
    // Session expired: sign in again once.
    this.signedIn = false;
    await this.login();
    const retry = await this.searchPage(digits);
    if (retry === null) throw new WheelmartError("Wheel Mart keeps asking to sign in", "auth");
    return parseWheelmartPage(retry);
  }

  async login(): Promise<void> {
    if (!this.loginInFlight) {
      this.loginInFlight = this.performLogin().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  /** The inventory page's HTML, or null when the site sends us to the sign-in page. */
  private async searchPage(digits: string): Promise<string | null> {
    const url = `${ORIGIN}/product/tires?${new URLSearchParams({ "ProductSearch[size]": digits })}`;
    const response = await this.request(url, { headers: { Accept: "text/html" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "";
      await response.body?.cancel();
      if (/\/auth\/login/.test(location)) return null;
      throw new WheelmartError(`Wheel Mart search redirected unexpectedly (${response.status})`, "upstream");
    }
    if (!response.ok) throw new WheelmartError(`Wheel Mart search failed with ${response.status}`, "http");
    const html = await response.text();
    return isWheelmartLoginPage(html) ? null : html;
  }

  private async performLogin(): Promise<void> {
    const { email, password } = this.credentials;
    if (!email || !password) throw new WheelmartError("WHEELMART_EMAIL / WHEELMART_PASSWORD are not set", "config");
    this.jar.clear();
    this.signedIn = false;

    const loginUrl = `${ORIGIN}/auth/login`;
    const page = await this.request(loginUrl, { headers: { Accept: "text/html" } });
    if (!page.ok) throw new WheelmartError(`Wheel Mart login page returned ${page.status}`, "upstream");
    const html = await page.text();
    const csrf = html.match(/<form id="login-form"[\s\S]*?name="_csrf" value="([^"]+)"/)?.[1];
    if (!csrf) throw new WheelmartError("Wheel Mart login page has no CSRF token", "upstream");

    const form = new URLSearchParams({ _csrf: csrf, "LoginForm[email]": email, "LoginForm[password]": password, "LoginForm[rememberMe]": "1" });
    const post = await this.request(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html", Origin: ORIGIN, Referer: loginUrl },
      body: form.toString(),
    });
    // A wrong email or password shows the form again (200); success redirects.
    if (post.status < 300 || post.status >= 400) {
      await post.body?.cancel();
      throw new WheelmartError("Wheel Mart rejected the email or password", "auth");
    }
    const location = post.headers.get("location") ?? "";
    await post.body?.cancel();
    if (/\/auth\/login/.test(location)) throw new WheelmartError("Wheel Mart rejected the email or password", "auth");
    await this.follow(new URL(location || "/", ORIGIN).toString());
    this.signedIn = true;
  }

  /** Follow the post-login redirects on the site's own origin so the session cookies settle. */
  private async follow(start: string): Promise<void> {
    let url = start;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
      if (new URL(url).origin !== ORIGIN) throw new WheelmartError("Wheel Mart login redirected off-site", "auth");
      const response = await this.request(url, { headers: { Accept: "text/html" } });
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400 && location) {
        if (/\/auth\/login/.test(location)) throw new WheelmartError("Wheel Mart did not keep the session", "auth");
        url = new URL(location, url).toString();
        continue;
      }
      return;
    }
    throw new WheelmartError("Wheel Mart login redirected too many times", "auth");
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...(init.headers as Record<string, string>), Cookie: this.jar.header(url) },
        redirect: "manual",
        signal: controller.signal,
      });
      this.jar.store(url, response.headers.getSetCookie());
      return response;
    } catch (error) {
      if (error instanceof WheelmartError) throw error;
      throw new WheelmartError(`Wheel Mart request failed: ${(error as Error).name}`, "upstream");
    } finally {
      clearTimeout(timer);
    }
  }
}

export function wheelmartConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.WHEELMART_EMAIL && env.WHEELMART_PASSWORD);
}

let shared: WheelmartClient | null = null;

/** Process-wide client built from env vars; one session shared by the workbench and the public assistant. */
export function getWheelmartClient(): WheelmartClient | null {
  if (!wheelmartConfigured()) return null;
  shared ??= new WheelmartClient({ email: process.env.WHEELMART_EMAIL ?? "", password: process.env.WHEELMART_PASSWORD ?? "" });
  return shared;
}

const caches = new WeakMap<WheelmartClient, TtlCache<WheelmartPage>>();

/** Results are reused for 10 minutes, so busy hours don't hammer the wholesaler. */
export function cachedWheelmartSearch(client: WheelmartClient, size: string): Promise<WheelmartPage> {
  let cache = caches.get(client);
  if (!cache) {
    cache = new TtlCache<WheelmartPage>(10 * 60_000, 500);
    caches.set(client, cache);
  }
  return cache.getOrLoad(searchDigits(size) ?? size, () => client.searchBySize(size));
}
