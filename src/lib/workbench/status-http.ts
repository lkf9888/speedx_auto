/**
 * GET /api/workbench/status — the connection panel's report. Signed-in staff
 * only. `?fresh=1` re-checks sources not checked in the last 15 seconds;
 * `?peek=1` returns the last results without checking anything (the header dot).
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
  const params = new URL(request.url).searchParams;
  const monitor = deps.monitor();
  const report = params.get("peek") === "1" ? monitor.peek() : await monitor.report(params.get("fresh") === "1");
  return Response.json(report, { headers: NO_STORE });
}
