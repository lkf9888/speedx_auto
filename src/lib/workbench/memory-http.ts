/**
 * /api/workbench/memory — list, add, edit and delete the shared notes. Any
 * signed-in staff member may change them; every change is logged with the
 * staff member's email.
 */
import { staffUser, type StaffUser } from "./access";
import { getMemoryStore, MemoryError, type MemoryStore } from "./memory";

export interface MemoryDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  store: () => MemoryStore | null;
  log: (entry: Record<string, unknown>) => void;
}

const defaultDeps: MemoryDeps = {
  user: (request) => staffUser(request.headers),
  store: () => getMemoryStore(),
  log: (entry) => console.info("workbench memory", JSON.stringify(entry)),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const STATUS: Record<MemoryError["kind"], number> = { config: 503, invalid: 400, not_found: 404, full: 409, upstream: 502 };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function handleMemory(request: Request, deps: MemoryDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const store = deps.store();
  if (!store) return json({ error: "not_configured" }, 503);
  try {
    if (request.method === "GET") return json({ notes: await store.list() });
    let body: Record<string, unknown> = {};
    try {
      body = ((await request.json()) ?? {}) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid" }, 400);
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (request.method === "POST") {
      const note = await store.add(body.text, user.email);
      deps.log({ action: "add", email: user.email, id: note.id, text: note.text });
      return json({ note, notes: await store.list() }, 201);
    }
    if (request.method === "PATCH") {
      const note = await store.update(id, body.text, user.email);
      deps.log({ action: "edit", email: user.email, id, text: note.text });
      return json({ note, notes: await store.list() });
    }
    if (request.method === "DELETE") {
      const note = await store.remove(id);
      deps.log({ action: "delete", email: user.email, id, text: note.text });
      return json({ notes: await store.list() });
    }
    return json({ error: "method" }, 405);
  } catch (error) {
    if (error instanceof MemoryError) {
      if (error.kind === "upstream") console.error("workbench memory failed", error.message);
      return json({ error: error.kind, message: error.message }, STATUS[error.kind]);
    }
    console.error("workbench memory failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return json({ error: "upstream" }, 502);
  }
}
