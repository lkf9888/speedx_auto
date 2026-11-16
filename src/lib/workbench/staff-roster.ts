/**
 * Who may use the workbench (Kevin, 2026-11-16): the owners (WORKBENCH_OWNER_EMAILS) and the staff accounts the owners
 * add or disable in the workbench itself. Cloudflare Access still proves who someone is (their email); this roster
 * decides whether that email may use the workbench. Without WORKBENCH_OWNER_EMAILS nothing is enforced here and every
 * Access-approved email is an owner, as before.
 *
 * The roster lives in Cloudflare KV under one key. If it can't be read, only the owners get in (fail closed).
 */
import { staffUser, type StaffUser } from "./access";
import { cloudflareKv, type KvClient } from "./kv";

export interface StaffMember {
  email: string;
  name: string;
  active: boolean;
  addedBy: string;
  addedAt: string;
}

export class StaffRosterError extends Error {
  constructor(
    readonly kind: "config" | "invalid" | "not_found" | "full" | "exists" | "forbidden" | "upstream",
    message: string,
  ) {
    super(message);
    this.name = "StaffRosterError";
  }
}

const KEY = "workbench-staff-v1";
export const MAX_STAFF = 60;
const EMAIL = /^[a-z0-9._%+'-]{1,64}@[a-z0-9.-]{1,120}\.[a-z]{2,}$/;

export const cleanEmail = (value: unknown): string => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** The owners' emails; null when WORKBENCH_OWNER_EMAILS isn't set (then the roster isn't enforced). */
export function ownerEmails(env: NodeJS.ProcessEnv = process.env): string[] | null {
  const list = (env.WORKBENCH_OWNER_EMAILS ?? "")
    .split(",")
    .map(cleanEmail)
    .filter(Boolean);
  return list.length ? list : null;
}

export class StaffRoster {
  constructor(
    private readonly kv: KvClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<StaffMember[]> {
    let raw: string | null;
    try {
      raw = await this.kv.get(KEY);
    } catch {
      throw new StaffRosterError("upstream", "员工名单暂时读不出来");
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as { staff?: StaffMember[] };
      return (parsed.staff ?? []).filter((m) => m && typeof m.email === "string");
    } catch {
      throw new StaffRosterError("upstream", "员工名单数据损坏");
    }
  }

  private async save(staff: StaffMember[]): Promise<StaffMember[]> {
    try {
      await this.kv.put(KEY, JSON.stringify({ staff }));
    } catch {
      throw new StaffRosterError("upstream", "员工名单暂时存不进去");
    }
    return staff;
  }

  async add(emailInput: unknown, nameInput: unknown, by: string): Promise<StaffMember[]> {
    const email = cleanEmail(emailInput);
    if (!EMAIL.test(email)) throw new StaffRosterError("invalid", "邮箱格式不对");
    const name = typeof nameInput === "string" ? nameInput.trim().slice(0, 40) : "";
    const staff = await this.list();
    if (staff.some((m) => m.email === email)) throw new StaffRosterError("exists", "这个邮箱已经在名单里");
    if (staff.length >= MAX_STAFF) throw new StaffRosterError("full", `最多 ${MAX_STAFF} 个员工账号`);
    return this.save([...staff, { email, name, active: true, addedBy: by, addedAt: this.now().toISOString() }]);
  }

  async update(emailInput: unknown, changes: { active?: unknown; name?: unknown }): Promise<StaffMember[]> {
    const email = cleanEmail(emailInput);
    const staff = await this.list();
    const member = staff.find((m) => m.email === email);
    if (!member) throw new StaffRosterError("not_found", "名单里没有这个邮箱");
    if (typeof changes.active === "boolean") member.active = changes.active;
    if (typeof changes.name === "string") member.name = changes.name.trim().slice(0, 40);
    return this.save(staff);
  }

  async remove(emailInput: unknown): Promise<StaffMember[]> {
    const email = cleanEmail(emailInput);
    const staff = await this.list();
    if (!staff.some((m) => m.email === email)) throw new StaffRosterError("not_found", "名单里没有这个邮箱");
    return this.save(staff.filter((m) => m.email !== email));
  }
}

let shared: StaffRoster | null | undefined;

/** The process-wide roster, or null when KV isn't configured. */
export function getStaffRoster(): StaffRoster | null {
  if (shared === undefined) {
    const kv = cloudflareKv();
    shared = kv ? new StaffRoster(kv) : null;
  }
  return shared;
}

export interface RosterAccess {
  env?: NodeJS.ProcessEnv;
  roster?: () => StaffRoster | null;
  /** The verified Access user; replaced in tests. */
  verify?: (headers: Headers) => Promise<StaffUser | null>;
  now?: () => number;
}

// The active emails are cached briefly so that a request doesn't wait on KV; a change through this server shows at once.
const CACHE_MS = 30_000;
let cache: { at: number; staff: StaffMember[] } | null = null;
export const forgetStaffCache = () => {
  cache = null;
};

async function activeStaff(access: RosterAccess): Promise<StaffMember[]> {
  const at = access.now?.() ?? Date.now();
  if (cache && at - cache.at < CACHE_MS) return cache.staff;
  const roster = (access.roster ?? getStaffRoster)();
  if (!roster) return [];
  const staff = await roster.list();
  cache = { at, staff };
  return staff;
}

/**
 * The signed-in staff member who may use the workbench, or null. Owners always may; others only while their account
 * is active. Staff whose roster can't be read are refused, owners are not.
 */
export async function signedInStaff(headers: Headers, access: RosterAccess = {}): Promise<StaffUser | null> {
  const env = access.env ?? process.env;
  const user = await (access.verify ?? ((h) => staffUser(h, env)))(headers);
  if (!user) return null;
  const owners = ownerEmails(env);
  // Not set up yet: every email Cloudflare Access lets in is an owner, as it was before the roster existed.
  if (!owners) return { ...user, role: "owner" };
  const email = cleanEmail(user.email);
  if (owners.includes(email) || (env.NODE_ENV !== "production" && env.WORKBENCH_DEV_EMAIL && cleanEmail(env.WORKBENCH_DEV_EMAIL) === email)) return { ...user, role: "owner" };
  try {
    const member = (await activeStaff(access)).find((m) => m.email === email && m.active);
    return member ? { ...user, role: "staff", name: member.name || undefined } : null;
  } catch {
    return null;
  }
}
