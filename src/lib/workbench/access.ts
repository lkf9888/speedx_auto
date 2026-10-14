/**
 * Who is using the repair workbench.
 *
 * The workbench lives at repair.speedxrental.com behind Cloudflare Access (the
 * same staff sign-in as the car-wash and GPS apps). Access adds a signed token
 * to every request it lets through; we verify that token here too, because the
 * Render origin can also be reached directly, around Cloudflare. Without the
 * configuration, or without a valid token, the workbench refuses: it shows
 * account prices and must fail closed.
 *
 * Configuration (Render environment):
 *   CF_ACCESS_TEAM_DOMAIN  speedxrental.cloudflareaccess.com
 *   CF_ACCESS_AUD          the Access application's "Application Audience (AUD) Tag"
 *   WORKBENCH_DEV_EMAIL    local development only: pretend to be this staff member
 */
import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

export interface StaffUser {
  email: string;
}

interface AccessConfig {
  teamDomain: string;
  audience: string;
}

export function accessConfig(env: NodeJS.ProcessEnv = process.env): AccessConfig | null {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const audience = env.CF_ACCESS_AUD?.trim();
  return teamDomain && audience ? { teamDomain, audience } : null;
}

type CertsLoader = (teamDomain: string) => Promise<JsonWebKey[]>;

let certCache: { teamDomain: string; keys: JsonWebKey[]; at: number } | null = null;
const CERT_TTL_MS = 60 * 60 * 1000;

const fetchCerts: CertsLoader = async (teamDomain) => {
  if (certCache?.teamDomain === teamDomain && Date.now() - certCache.at < CERT_TTL_MS) return certCache.keys;
  const response = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`access certs ${response.status}`);
  const body = (await response.json()) as { keys?: JsonWebKey[] };
  const keys = body.keys ?? [];
  certCache = { teamDomain, keys, at: Date.now() };
  return keys;
};

function base64url(part: string): Buffer {
  return Buffer.from(part, "base64url");
}

function readToken(headers: Headers): string | null {
  const header = headers.get("cf-access-jwt-assertion");
  if (header) return header;
  const cookie = headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * The signed-in staff member, or null. Verifies the RS256 signature against
 * the team's published keys, the audience, the issuer and the expiry.
 */
export async function staffUser(
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env,
  loadCerts: CertsLoader = fetchCerts,
  now: number = Date.now(),
): Promise<StaffUser | null> {
  if (env.NODE_ENV !== "production" && env.WORKBENCH_DEV_EMAIL) {
    return { email: env.WORKBENCH_DEV_EMAIL };
  }
  const config = accessConfig(env);
  if (!config) return null;
  const token = readToken(headers);
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64url(parts[0]).toString("utf8")) as { alg?: string; kid?: string };
    const claims = JSON.parse(base64url(parts[1]).toString("utf8")) as {
      aud?: string | string[];
      iss?: string;
      exp?: number;
      nbf?: number;
      email?: string;
    };
    if (header.alg !== "RS256") return null;
    const keys = await loadCerts(config.teamDomain);
    const jwk = keys.find((k) => (k as { kid?: string }).kid === header.kid) ?? (keys.length === 1 ? keys[0] : undefined);
    if (!jwk) return null;
    const signed = verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      base64url(parts[2]),
    );
    if (!signed) return null;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(config.audience)) return null;
    if (claims.iss !== `https://${config.teamDomain}`) return null;
    const seconds = now / 1000;
    if (typeof claims.exp !== "number" || claims.exp < seconds) return null;
    if (typeof claims.nbf === "number" && claims.nbf > seconds + 60) return null;
    if (!claims.email) return null;
    return { email: claims.email.toLowerCase() };
  } catch (error) {
    console.error("workbench access check failed", (error as Error).message);
    return null;
  }
}
