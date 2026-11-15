/**
 * POST /api/followup/unsubscribe?token= — stops follow-up emails to the address
 * behind the token. Used by mail apps' one-click unsubscribe (RFC 8058) and by
 * the unsubscribe page's button. No sign-in: the token is the permission.
 */
import { getFollowUpStore, isUnsubscribeToken, type FollowUpStore } from "./followup-store";

export async function handleUnsubscribe(request: Request, store: () => FollowUpStore | null = getFollowUpStore): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  const token = new URL(request.url).searchParams.get("token");
  if (!isUnsubscribeToken(token)) return Response.json({ error: "invalid" }, { status: 400, headers });
  const s = store();
  if (!s) return Response.json({ error: "unavailable" }, { status: 503, headers });
  try {
    const done = await s.unsubscribe(token);
    return Response.json(done ? { ok: true } : { error: "not_found" }, { status: done ? 200 : 404, headers });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 502, headers });
  }
}
