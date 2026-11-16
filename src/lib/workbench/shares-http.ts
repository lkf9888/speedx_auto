/**
 * /api/workbench/conversations/[id]/share — signed-in staff make a no-login
 * link to a conversation (POST) or cancel one (DELETE ?token=). Every link
 * made or cancelled is logged with the staff member's email.
 */
import { BASE_URL } from "@/lib/site-routes";
import type { StaffUser } from "./access";
import { signedInStaff } from "./staff-roster";
import { ConversationError, getConversationStore, type ConversationStore } from "./conversations";
import { getShareStore, isShareToken, ShareError, type ShareStore } from "./shares";

export interface ShareDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  conversations: () => ConversationStore | null;
  shares: () => ShareStore | null;
  log: (entry: Record<string, unknown>) => void;
}

const defaultDeps: ShareDeps = {
  user: (request) => signedInStaff(request.headers),
  conversations: () => getConversationStore(),
  shares: () => getShareStore(),
  log: (entry) => console.info("workbench share", JSON.stringify(entry)),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** The public address of a share page: the main site (the workbench subdomain is behind sign-in). */
export function shareUrl(token: string, requestUrl: string): string {
  const origin = new URL(requestUrl).origin;
  return `${LOCAL.test(origin) ? origin : BASE_URL}/share/${token}`;
}

export async function handleShare(request: Request, id: string, deps: ShareDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const conversations = deps.conversations();
  const shares = deps.shares();
  if (!conversations || !shares) return json({ error: "not_configured", message: "服务器没有设置 Cloudflare KV" }, 503);
  try {
    if (request.method === "POST") {
      const conversation = await conversations.get(id);
      if (!conversation) return json({ error: "not_found", message: "这个会话已经不在了" }, 404);
      const link = await shares.create(conversation, user.email);
      const now = Date.now();
      const saved = await conversations.setShares(id, user.email, (list) => [...list.filter((s) => s.expiresAt > now), link]);
      deps.log({ action: "share", email: user.email, id, token: link.token.slice(0, 6), expiresAt: link.expiresAt });
      return json({ link, url: shareUrl(link.token, request.url), conversation: saved }, 201);
    }
    if (request.method === "DELETE") {
      const token = new URL(request.url).searchParams.get("token");
      if (!isShareToken(token)) return json({ error: "invalid" }, 400);
      await shares.revoke(token);
      const saved = await conversations.setShares(id, user.email, (list) => list.filter((s) => s.token !== token));
      deps.log({ action: "unshare", email: user.email, id, token: token.slice(0, 6) });
      return json({ conversation: saved });
    }
    return json({ error: "method" }, 405);
  } catch (error) {
    if (error instanceof ShareError) return json({ error: error.kind, message: error.kind === "full" ? error.message : "分享暂时用不了，请稍后再试" }, error.kind === "full" ? 409 : 502);
    if (error instanceof ConversationError) return json({ error: error.kind }, error.kind === "not_found" ? 404 : 400);
    console.error("workbench share failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return json({ error: "upstream" }, 502);
  }
}
