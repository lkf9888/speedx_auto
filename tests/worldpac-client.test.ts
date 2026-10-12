import { describe, expect, it } from "vitest";
import { CookieJar, extractClientRedirect, WorldpacClient, WorldpacError } from "@/lib/worldpac/client";

const CLIENT_INFO = {
  clientVersion: "v1.test",
  sdproEnv: "PROD",
  sfCommunity: "https://auth.worldpac.com",
  sfClientId: "client-id",
  sfRedirectUri: "https://speeddial.worldpac.com/v3/sfAuthCallback",
  sfLoginIdSuffix: ".prod",
  sfMaskRedirects: "true",
};

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
}

/** speedDIAL + Salesforce login, with one session expiry after the first API call. */
function fakeWorldpac(options: { badPassword?: boolean } = {}) {
  const seen: Seen[] = [];
  let sessions = 0;
  let apiCalls = 0;
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const headers = (init.headers ?? {}) as Record<string, string>;
    seen.push({ url, method: init.method ?? "GET", headers, body: init.body as string | undefined });
    const path = new URL(url).pathname;
    if (path === "/v3/clientinfo") return json(CLIENT_INFO);
    if (path === "/servlet/servlet.loginwidgetcontroller") {
      return json({ result: options.badPassword ? "invalid" : "https://auth.worldpac.com/secur/frontdoor.jsp?sid=1" });
    }
    if (path === "/secur/frontdoor.jsp") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/services/oauth2/authorize?x=1", "Set-Cookie": "sid=sf-session; Domain=auth.worldpac.com; Path=/" },
      });
    }
    if (path === "/services/oauth2/authorize") {
      return new Response(
        `<script>window.location.href='https://speeddial.worldpac.com/v3/sfAuthCallback?code=abc'</script>`,
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }
    if (path === "/v3/sfAuthCallback") {
      sessions += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: "https://speeddial.worldpac.com/#/", "Set-Cookie": `SESSION=s${sessions}; Path=/; HttpOnly` },
      });
    }
    if (path === "/") return new Response("<html></html>", { status: 200 });
    if (path === "/v3/authCheck") return json({ csrfToken: `csrf-${sessions}` });
    if (path === "/v3/pna360_cat") {
      apiCalls += 1;
      if (apiCalls === 2) return new Response(null, { status: 401 });
      return json({ quotes: [], status: { code: 200 } });
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { fetchImpl, seen };
}

describe("CookieJar", () => {
  it("scopes cookies by domain and honours deletion", () => {
    const jar = new CookieJar();
    jar.store("https://auth.worldpac.com/x", ["sid=1; Path=/"]);
    jar.store("https://speeddial.worldpac.com/x", ["SESSION=2; HttpOnly", "gone=1"]);
    jar.store("https://speeddial.worldpac.com/x", ["gone=; Max-Age=0"]);
    expect(jar.header("https://speeddial.worldpac.com/v3/a")).toBe("SESSION=2");
    expect(jar.header("https://auth.worldpac.com/")).toBe("sid=1");
  });
});

describe("extractClientRedirect", () => {
  it("reads script and meta-refresh redirects", () => {
    expect(extractClientRedirect(`<script>window.location.replace("/next?a=1&amp;b=2")</script>`, "https://a.com/x")).toBe(
      "https://a.com/next?a=1&b=2",
    );
    expect(extractClientRedirect(`<meta http-equiv="refresh" content="0;url=https://b.com/y">`, "https://a.com")).toBe(
      "https://b.com/y",
    );
    expect(extractClientRedirect("<p>done</p>", "https://a.com")).toBeNull();
  });
});

describe("WorldpacClient", () => {
  it("logs in through Salesforce and sends the session cookie and CSRF token", async () => {
    const { fetchImpl, seen } = fakeWorldpac();
    const client = new WorldpacClient({ username: "kevin", password: "secret" }, fetchImpl);
    await client.post("pna360_cat", { partTypes: [] });

    const widget = seen.find((s) => s.url.includes("loginwidgetcontroller"))!;
    const form = new URLSearchParams(widget.body);
    expect(form.get("username")).toBe("kevin.prod");
    expect(form.get("password")).toBe("secret");
    expect(form.get("startURL")).toContain("client_id=client-id");
    expect(form.get("startURL")).toContain(encodeURIComponent(CLIENT_INFO.sfRedirectUri));

    const authorize = seen.find((s) => s.url.includes("/services/oauth2/authorize"))!;
    expect(authorize.headers.Cookie).toBe("sid=sf-session");

    const api = seen.find((s) => s.url.endsWith("/v3/pna360_cat"))!;
    expect(api.headers["X-CSRF-Token"]).toBe("csrf-1");
    expect(api.headers.Cookie).toBe("SESSION=s1");
    expect(JSON.parse(api.body!)).toEqual({
      header: { clientVersion: "v1.test", clientInfo: "WEB", referrerID: "sDPro" },
      data: { partTypes: [] },
    });
  });

  it("logs in again once when the session expires", async () => {
    const { fetchImpl, seen } = fakeWorldpac();
    const client = new WorldpacClient({ username: "kevin", password: "secret" }, fetchImpl);
    await client.post("pna360_cat", {});
    await client.post("pna360_cat", {});
    const apiCalls = seen.filter((s) => s.url.endsWith("/v3/pna360_cat"));
    expect(apiCalls).toHaveLength(3);
    expect(apiCalls[2].headers["X-CSRF-Token"]).toBe("csrf-2");
    expect(apiCalls[2].headers.Cookie).toBe("SESSION=s2");
  });

  it("reports bad credentials and missing configuration as auth/config errors", async () => {
    const { fetchImpl } = fakeWorldpac({ badPassword: true });
    await expect(new WorldpacClient({ username: "kevin", password: "nope" }, fetchImpl).login()).rejects.toMatchObject({
      kind: "auth",
    });
    await expect(new WorldpacClient({ username: "", password: "" }, fetchImpl).login()).rejects.toBeInstanceOf(
      WorldpacError,
    );
  });
});
