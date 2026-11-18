/**
 * /api/workbench/alldata-log — the ALLDATA operation log. Every signed-in staff member can read it and add lines
 * for what their own cards did; the server writes who and when. See alldata-oplog.ts for what is (and isn't) kept.
 */
import type { StaffUser } from "./access";
import { echoToServerLog, getOpLogStore, OpLogError, type OpLogStore } from "./alldata-oplog";
import { signedInStaff } from "./staff-roster";

export interface OpLogDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  store: () => OpLogStore | null;
  echo: (entry: Parameters<typeof echoToServerLog>[0]) => void;
}

const defaultDeps: OpLogDeps = { user: (request) => signedInStaff(request.headers), store: () => getOpLogStore(), echo: echoToServerLog };

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

export async function handleOpLog(request: Request, deps: OpLogDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  const store = deps.store();
  if (!store) return json({ error: "not_configured" }, 503);
  try {
    if (request.method === "GET") return json({ entries: await store.list(100) });
    if (request.method === "POST") {
      const body = (await request.json().catch(() => null)) as { entry?: unknown } | null;
      if (!body?.entry) return json({ error: "invalid" }, 400);
      // The server's own log gets the line first, so it exists even if KV can't take it.
      const entry = await store.append(body.entry, user.email, deps.echo);
      return json({ entry }, 201);
    }
    return json({ error: "method" }, 405);
  } catch (error) {
    if (error instanceof OpLogError && error.kind === "invalid") return json({ error: "invalid" }, 400);
    console.error("alldata log failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return json({ error: "upstream" }, 502);
  }
}
