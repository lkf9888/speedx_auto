/**
 * repair.speedxrental.com — forwards the staff repair workbench to the main
 * site's Render service (Render's plan allows no more custom domains).
 *
 * Cloudflare Access protects this hostname; the Access token travels on in
 * the Cf-Access-Jwt-Assertion header and the CF_Authorization cookie, and the
 * site verifies it on every request. Only workbench paths are forwarded.
 *
 * Deployed by hand in the Cloudflare dashboard (Workers & Pages →
 * speedx-repair-workbench), with repair.speedxrental.com as its custom domain.
 */
const ORIGIN = "https://speedx-rental.onrender.com";

function allowed(path) {
  return (
    path === "/workbench" ||
    path.startsWith("/workbench/") ||
    path.startsWith("/api/workbench/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico"
  );
}

const worker = {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/workbench" : url.pathname;
    if (!allowed(path)) return new Response("Not found", { status: 404 });

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("x-speedx-workbench", "1");
    headers.set("x-forwarded-host", url.host);

    return fetch(new URL(path + url.search, ORIGIN), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  },
};

export default worker;
