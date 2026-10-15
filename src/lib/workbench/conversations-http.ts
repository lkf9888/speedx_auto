/**
 * /api/workbench/conversations — the shared conversations every signed-in
 * staff member sees. Changes are logged with the staff member's email.
 */
import { staffUser, type StaffUser } from "./access";
import { ConversationError, getConversationStore, type ConversationStore } from "./conversations";

export interface ConversationDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  store: () => ConversationStore | null;
  log: (entry: Record<string, unknown>) => void;
}

const defaultDeps: ConversationDeps = {
  user: (request) => staffUser(request.headers),
  store: () => getConversationStore(),
  log: (entry) => console.info("workbench conversation", JSON.stringify(entry)),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function guard(request: Request, deps: ConversationDeps): Promise<{ user: StaffUser; store: ConversationStore } | Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const store = deps.store();
  if (!store) return json({ error: "not_configured" }, 503);
  return { user, store };
}

function failure(error: unknown): Response {
  if (error instanceof ConversationError) return json({ error: error.kind }, error.kind === "not_found" ? 404 : 400);
  console.error("workbench conversations failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  return json({ error: "upstream" }, 502);
}

/** GET: every conversation (newest first) and who is waiting on an answer. POST: import local ones. */
export async function handleConversationList(request: Request, deps: ConversationDeps = defaultDeps): Promise<Response> {
  const ok = await guard(request, deps);
  if (ok instanceof Response) return ok;
  const { user, store } = ok;
  try {
    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { conversations?: unknown[] } | null;
      if (!body || !Array.isArray(body.conversations)) return json({ error: "invalid" }, 400);
      const imported = await store.importLocal(user.email, body.conversations);
      deps.log({ action: "import", email: user.email, imported });
      return json({ imported });
    }
    return json({ conversations: await store.list(), pending: Object.fromEntries(store.pending) });
  } catch (error) {
    return failure(error);
  }
}

/** GET one conversation; PATCH its title, archived flag or a card's state; DELETE it. */
export async function handleConversation(request: Request, id: string, deps: ConversationDeps = defaultDeps): Promise<Response> {
  const ok = await guard(request, deps);
  if (ok instanceof Response) return ok;
  const { user, store } = ok;
  if (!/^c[a-z0-9]{6,40}$/.test(id)) return json({ error: "invalid" }, 400);
  try {
    if (request.method === "GET") {
      const conversation = await store.get(id);
      return conversation ? json({ conversation, pending: store.pending.get(id) ?? null }) : json({ error: "not_found" }, 404);
    }
    if (request.method === "DELETE") {
      await store.remove(id);
      deps.log({ action: "delete", email: user.email, id });
      return json({ ok: true });
    }
    if (request.method === "PATCH") {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return json({ error: "invalid" }, 400);
      if (typeof body.title === "string") {
        const conversation = await store.rename(id, user.email, body.title);
        deps.log({ action: "rename", email: user.email, id, title: conversation.title });
        return json({ conversation });
      }
      if (typeof body.archived === "boolean") {
        const conversation = await store.setArchived(id, user.email, body.archived);
        deps.log({ action: body.archived ? "archive" : "unarchive", email: user.email, id });
        return json({ conversation });
      }
      const card = body.card as { kind?: string; itemId?: string; created?: unknown } | undefined;
      if (card && typeof card.itemId === "string" && (card.kind === "draft" || card.kind === "memory")) {
        const conversation =
          card.kind === "draft"
            ? await store.markCard(id, user.email, { kind: "draft", itemId: card.itemId, created: card.created })
            : await store.markCard(id, user.email, { kind: "memory", itemId: card.itemId });
        return json({ conversation });
      }
      return json({ error: "invalid" }, 400);
    }
    return json({ error: "method" }, 405);
  } catch (error) {
    return failure(error);
  }
}
