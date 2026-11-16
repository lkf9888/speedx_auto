/**
 * /api/workbench/staff — the staff accounts (owners only): list, add, rename, disable or enable, remove. Every change
 * is logged with the owner's email. The owners themselves (WORKBENCH_OWNER_EMAILS) aren't in the roster and can't be
 * edited here.
 */
import type { StaffUser } from "./access";
import { cleanEmail, forgetStaffCache, getStaffRoster, ownerEmails, signedInStaff, StaffRosterError, type StaffMember, type StaffRoster } from "./staff-roster";

export interface StaffDeps {
  user: (request: Request) => Promise<StaffUser | null>;
  roster: () => StaffRoster | null;
  owners: () => string[] | null;
  log: (entry: Record<string, unknown>) => void;
}

const defaultDeps: StaffDeps = {
  user: (request) => signedInStaff(request.headers),
  roster: () => getStaffRoster(),
  owners: () => ownerEmails(),
  log: (entry) => console.info("workbench staff", JSON.stringify(entry)),
};

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const STATUS: Record<StaffRosterError["kind"], number> = { config: 503, invalid: 400, not_found: 404, full: 409, exists: 409, forbidden: 403, upstream: 502 };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// An account that later became an owner is shown once, as an owner.
const view = (staff: StaffMember[], owners: string[] | null) => ({ staff: staff.filter((m) => !owners?.includes(m.email)), owners: owners ?? [] });

export async function handleStaff(request: Request, deps: StaffDeps = defaultDeps): Promise<Response> {
  const user = await deps.user(request);
  if (!user) return json({ error: "unauthorized" }, 401);
  // Only an owner manages accounts; until the owners are configured nobody can, so a roster can't be set up by accident.
  const owners = deps.owners();
  if (!owners || user.role !== "owner") return json({ error: "forbidden", message: owners ? "只有老板账号能管理员工账号" : "还没有设置老板账号（WORKBENCH_OWNER_EMAILS）" }, 403);
  const roster = deps.roster();
  if (!roster) return json({ error: "config", message: "员工名单需要先配置 Cloudflare KV" }, 503);
  try {
    if (request.method === "GET") return json(view(await roster.list(), owners));
    const body = await readBody(request);
    if (!body) return json({ error: "invalid" }, 400);
    const email = cleanEmail(body.email);
    if (request.method === "POST") {
      if (owners.includes(email)) return json({ error: "exists", message: "这是老板账号，不用加进名单" }, 409);
      const staff = await roster.add(email, body.name, user.email);
      forgetStaffCache();
      deps.log({ action: "add", by: user.email, email });
      return json(view(staff, owners), 201);
    }
    if ((request.method === "PATCH" || request.method === "DELETE") && owners.includes(email)) return json({ error: "forbidden", message: "老板账号不能在这里修改" }, 403);
    if (request.method === "PATCH") {
      const staff = await roster.update(email, { active: body.active, name: body.name });
      forgetStaffCache();
      deps.log({ action: typeof body.active === "boolean" ? (body.active ? "enable" : "disable") : "rename", by: user.email, email });
      return json(view(staff, owners));
    }
    if (request.method === "DELETE") {
      const staff = await roster.remove(email);
      forgetStaffCache();
      deps.log({ action: "remove", by: user.email, email });
      return json(view(staff, owners));
    }
    return json({ error: "method" }, 405);
  } catch (error) {
    if (error instanceof StaffRosterError) {
      if (error.kind === "upstream") console.error("workbench staff failed", error.message);
      return json({ error: error.kind, message: error.message }, STATUS[error.kind]);
    }
    console.error("workbench staff failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "upstream", message: "员工名单暂时用不了" }, 502);
  }
}
