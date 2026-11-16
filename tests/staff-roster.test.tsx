import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffPanel } from "@/components/workbench/StaffPanel";
import { memoryKv } from "@/lib/workbench/kv";
import { handleStaff, type StaffDeps } from "@/lib/workbench/staff-http";
import { forgetStaffCache, ownerEmails, signedInStaff, StaffRoster } from "@/lib/workbench/staff-roster";

// Kevin, 2026-11-16: owners add, disable and remove staff accounts in the workbench; the roster decides who may use it
// once Cloudflare Access has said who they are.

const env = (owners?: string): NodeJS.ProcessEnv => ({ NODE_ENV: "production", ...(owners ? { WORKBENCH_OWNER_EMAILS: owners } : {}) }) as NodeJS.ProcessEnv;
const as = (email: string | null) => async () => (email ? { email } : null);
const NOW = Date.UTC(2026, 10, 16);

beforeEach(() => forgetStaffCache());

describe("who may use the workbench", () => {
  it("lets every Access-approved email in as an owner until the owners are configured", async () => {
    expect(await signedInStaff(new Headers(), { env: env(), verify: as("a@x.ca") })).toEqual({ email: "a@x.ca", role: "owner" });
    expect(await signedInStaff(new Headers(), { env: env(), verify: as(null) })).toBeNull();
  });

  it("owners always get in, staff only while active, everyone else is refused", async () => {
    const roster = new StaffRoster(memoryKv(), () => new Date(NOW));
    await roster.add("Lee@X.ca", "Lee", "kevin@x.ca");
    await roster.add("off@x.ca", "", "kevin@x.ca");
    await roster.update("off@x.ca", { active: false });
    const access = (email: string) => ({ env: env("kevin@x.ca"), roster: () => roster, verify: as(email), now: () => NOW });
    expect(await signedInStaff(new Headers(), access("KEVIN@x.ca"))).toMatchObject({ role: "owner" });
    expect(await signedInStaff(new Headers(), access("lee@x.ca"))).toMatchObject({ role: "staff", name: "Lee" });
    expect(await signedInStaff(new Headers(), access("off@x.ca"))).toBeNull();
    expect(await signedInStaff(new Headers(), access("stranger@x.ca"))).toBeNull();
  });

  it("refuses staff but not owners when the roster can't be read", async () => {
    const broken = new StaffRoster({ ...memoryKv(), get: async () => { throw new Error("down"); } });
    const access = (email: string) => ({ env: env("kevin@x.ca"), roster: () => broken, verify: as(email), now: () => NOW });
    expect(await signedInStaff(new Headers(), access("kevin@x.ca"))).toMatchObject({ role: "owner" });
    expect(await signedInStaff(new Headers(), access("lee@x.ca"))).toBeNull();
  });

  it("reads the owners from a comma-separated list", () => {
    expect(ownerEmails(env(" Kevin@x.ca , b@x.ca ,"))).toEqual(["kevin@x.ca", "b@x.ca"]);
    expect(ownerEmails(env())).toBeNull();
  });
});

describe("the staff accounts API", () => {
  const setup = (me: { email: string; role?: "owner" | "staff" } | null = { email: "kevin@x.ca", role: "owner" }, owners: string[] | null = ["kevin@x.ca"]) => {
    const roster = new StaffRoster(memoryKv(), () => new Date(NOW));
    const logs: Array<Record<string, unknown>> = [];
    const deps: StaffDeps = { user: async () => me, roster: () => roster, owners: () => owners, log: (e) => logs.push(e) };
    const call = (method: string, body?: unknown) => handleStaff(new Request("https://repair.speedxrental.com/api/workbench/staff", { method, ...(body ? { body: JSON.stringify(body) } : {}) }), deps);
    return { call, logs, roster };
  };

  it("is for owners only", async () => {
    expect((await setup(null).call("GET")).status).toBe(401);
    expect((await setup({ email: "lee@x.ca", role: "staff" }).call("GET")).status).toBe(403);
    expect((await setup({ email: "kevin@x.ca", role: "owner" }, null).call("GET")).status).toBe(403);
  });

  it("adds, disables, enables, renames and removes an account, logging who did it", async () => {
    const { call, logs } = setup();
    const added = await call("POST", { email: " Lee@X.ca ", name: "Lee" });
    expect(added.status).toBe(201);
    expect((await added.json()).staff).toEqual([{ email: "lee@x.ca", name: "Lee", active: true, addedBy: "kevin@x.ca", addedAt: new Date(NOW).toISOString() }]);
    expect((await (await call("PATCH", { email: "lee@x.ca", active: false })).json()).staff[0].active).toBe(false);
    expect((await (await call("PATCH", { email: "lee@x.ca", active: true, name: "Lee W" })).json()).staff[0]).toMatchObject({ active: true, name: "Lee W" });
    expect((await (await call("DELETE", { email: "lee@x.ca" })).json()).staff).toEqual([]);
    expect(logs.map((l) => l.action)).toEqual(["add", "disable", "enable", "remove"]);
    expect(logs.every((l) => l.by === "kevin@x.ca")).toBe(true);
  });

  it("refuses a bad email, a duplicate, an owner and an unknown account", async () => {
    const { call } = setup();
    expect((await call("POST", { email: "nope" })).status).toBe(400);
    expect((await call("POST", { email: "kevin@x.ca" })).status).toBe(409);
    await call("POST", { email: "lee@x.ca" });
    expect((await call("POST", { email: "lee@x.ca" })).status).toBe(409);
    expect((await call("PATCH", { email: "ghost@x.ca", active: false })).status).toBe(404);
    expect((await call("DELETE", { email: "ghost@x.ca" })).status).toBe(404);
  });

  it("a disabled account loses access at once, a new one gets it at once", async () => {
    const { call, roster } = setup();
    const access = (email: string) => ({ env: env("kevin@x.ca"), roster: () => roster, verify: as(email) });
    await call("POST", { email: "lee@x.ca" });
    expect(await signedInStaff(new Headers(), access("lee@x.ca"))).toMatchObject({ role: "staff" });
    await call("PATCH", { email: "lee@x.ca", active: false });
    expect(await signedInStaff(new Headers(), access("lee@x.ca"))).toBeNull();
  });
});

describe("the staff panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the owners and the staff, adds an account, disables one and asks before removing", async () => {
    let staff = [{ email: "lee@x.ca", name: "Lee", active: true, addedBy: "kevin@x.ca", addedAt: "" }];
    const calls: Array<{ method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method: init?.method ?? "GET", body });
      if (init?.method === "POST") staff = [...staff, { email: body.email, name: body.name, active: true, addedBy: "kevin@x.ca", addedAt: "" }];
      if (init?.method === "PATCH") staff = staff.map((m) => (m.email === body.email ? { ...m, active: body.active } : m));
      if (init?.method === "DELETE") staff = staff.filter((m) => m.email !== body.email);
      return Response.json({ staff, owners: ["kevin@x.ca"] });
    }));
    render(<StaffPanel onClose={() => {}} />);
    expect(await screen.findByText("kevin@x.ca")).toBeInTheDocument();
    expect(screen.getByText("老板")).toBeInTheDocument();
    expect(await screen.findAllByTestId("staff-row")).toHaveLength(1);

    await userEvent.type(screen.getByLabelText("员工的邮箱"), "sam@x.ca");
    await userEvent.type(screen.getByLabelText("员工名字"), "Sam");
    await userEvent.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => expect(screen.getAllByTestId("staff-row")).toHaveLength(2));
    expect(calls.at(-1)).toEqual({ method: "POST", body: { email: "sam@x.ca", name: "Sam" } });

    await userEvent.click(screen.getAllByRole("button", { name: "停用" })[0]);
    await waitFor(() => expect(screen.getByText("已停用")).toBeInTheDocument());
    expect(calls.at(-1)).toEqual({ method: "PATCH", body: { email: "lee@x.ca", active: false } });

    // Removing needs a second click.
    await userEvent.click(screen.getAllByRole("button", { name: "删除" })[0]);
    expect(calls.at(-1)?.method).toBe("PATCH");
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(screen.getAllByTestId("staff-row")).toHaveLength(1));
    expect(calls.at(-1)).toEqual({ method: "DELETE", body: { email: "lee@x.ca" } });
  });

  it("shows the server's message when something fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "只有老板账号能管理员工账号" }, { status: 403 })));
    render(<StaffPanel onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("只有老板账号能管理员工账号");
  });
});
