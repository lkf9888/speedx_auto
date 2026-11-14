/**
 * GET /api/workbench/status — the connection panel's report. Signed-in staff
 * only; `?fresh=1` re-checks now instead of using the five-minute cache.
 */
import { staffUser, type StaffUser } from "./access";
import { getStatusMonitor, type StatusMonitor } from "./status";

export interface StatusDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  monitor: () => StatusMonitor;
}

const defaultDeps: StatusDeps = {
  user: (request) => staffUser(request.headers),
  monitor: getStatusMonitor,
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function handleStatus(request: Request, deps: StatusDeps = defaultDeps): Promise<Response> {
  if (!(await deps.user(request))) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  return Response.json(await deps.monitor().report(fresh), { headers: NO_STORE });
}
