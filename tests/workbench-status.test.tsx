import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ installed: true, status: { version: "1.4.0", signedIn: true } as { version: string; signedIn: boolean } }));
vi.mock("@/lib/workbench/alldata-bridge", async (original) => ({
  ...(await original<typeof import("@/lib/workbench/alldata-bridge")>()),
  bridgeInstalled: async () => bridge.installed,
  callAlldata: async () => bridge.status,
}));

import { ConnectionButton, ConnectionStatus, useConnectionSummary } from "@/components/workbench/ConnectionStatus";
import { defaultChecks, errorText, StatusMonitor, type StatusCheck, type StatusReport } from "@/lib/workbench/status";
import { handleStatus } from "@/lib/workbench/status-http";

// Kevin, 2026-11-14: a page in the workbench showing which sites the assistant is
// connected to (ALLDATA, WorldPac…) and whether each one is working.

const check = (id: string, run: StatusCheck["run"]): StatusCheck => ({ id, name: id, purpose: "测试", run });

describe("the status monitor", () => {
  it("checks every source at once and reports what each found", async () => {
    const clock = 1_000_000;
    const monitor = new StatusMonitor(
      () => [
        check("a", async () => ({ state: "ok", detail: "已登录" })),
        check("b", async () => ({ state: "not_configured", detail: "没有账号" })),
        check("c", async () => {
          throw new Error("login rejected (401)");
        }),
        check("d", () => new Promise(() => {})),
      ],
      () => clock,
      50,
    );
    const report = await monitor.report();
    expect(report.checkedAt).toBe(clock);
    expect(report.sources.map((s) => [s.id, s.state, s.detail])).toEqual([
      ["a", "ok", "已登录"],
      ["b", "not_configured", "没有账号"],
      ["c", "down", "login rejected (401)"],
      ["d", "down", "0 秒没有回应"],
    ]);
    expect(report.sources[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(report.sources[1].latencyMs).toBeUndefined();
  });

  it("keeps results (suppliers 30 minutes, the rest 5) and re-checks on request at most every 15 seconds", async () => {
    let clock = 0;
    const runs = { api: 0, shop: 0 };
    const monitor = new StatusMonitor(
      () => [check("api", async () => ((runs.api += 1), { state: "ok", detail: "" })), { ...check("shop", async () => ((runs.shop += 1), { state: "ok", detail: "" })), supplier: true }],
      () => clock,
    );
    await Promise.all([monitor.report(), monitor.report()]);
    expect(runs).toEqual({ api: 1, shop: 1 });
    clock = 10_000;
    await monitor.report(true);
    expect(runs).toEqual({ api: 1, shop: 1 });
    clock = 16_000;
    await monitor.report(true);
    expect(runs).toEqual({ api: 2, shop: 2 });
    clock = 16_000 + 5 * 60_000;
    await monitor.report();
    expect(runs).toEqual({ api: 3, shop: 2 });
    clock = 16_000 + 30 * 60_000;
    await monitor.report();
    expect(runs).toEqual({ api: 4, shop: 3 });
  });

  it("doesn't log in to a supplier again for 30 minutes after the login is rejected, even when asked", async () => {
    let clock = 0;
    let logins = 0;
    const rejected = Object.assign(new Error("speedDIAL session rejected (401)"), { kind: "auth" });
    const monitor = new StatusMonitor(
      () => [{ ...check("worldpac", async () => ((logins += 1), Promise.reject(rejected))), supplier: true }],
      () => clock,
    );
    const first = await monitor.report();
    expect(first.sources[0]).toMatchObject({ state: "down" });
    expect(first.sources[0].detail).toContain("30 分钟内不再自动重试");
    clock = 60_000;
    await monitor.report(true);
    clock = 29 * 60_000;
    await monitor.report(true);
    expect(logins).toBe(1);
    clock = 31 * 60_000;
    await monitor.report(true);
    expect(logins).toBe(2);
  });

  it("doesn't call a source again while its last call is still running", async () => {
    let clock = 0;
    let calls = 0;
    let finish: (r: { state: "ok"; detail: string }) => void = () => {};
    const monitor = new StatusMonitor(
      () => [check("slow", () => ((calls += 1), new Promise((resolve) => (finish = resolve))))],
      () => clock,
      20,
    );
    expect((await monitor.report()).sources[0].state).toBe("down");
    clock = 60_000;
    await monitor.report(true);
    expect(calls).toBe(1);
    finish({ state: "ok", detail: "" });
    await new Promise((r) => setTimeout(r, 0));
    await monitor.report(true);
    expect(calls).toBe(2);
  });

  it("lets the header dot peek without checking anything", async () => {
    let calls = 0;
    const monitor = new StatusMonitor(() => [check("a", async () => ((calls += 1), { state: "ok", detail: "" }))], () => 5_000);
    expect(monitor.peek()).toEqual({ checkedAt: 0, sources: [] });
    await monitor.report();
    expect(monitor.peek().sources.map((s) => s.id)).toEqual(["a"]);
    expect(calls).toBe(1);
  });

  it("never shows anything that looks like a credential", () => {
    expect(errorText(new Error("bad request token=abc123 rejected"))).toBe("bad request token=… rejected");
    expect(errorText(new Error("password: hunter2"))).toBe("password=…");
    expect(errorText(new Error("Authorization: Bearer abc.def.ghi failed"))).not.toContain("abc.def");
    expect(errorText(new Error("GET https://user:pw@example.com/a?key=s3cret failed"))).toBe("GET https://example.com/a failed");
    expect(errorText(new Error("using sk-ant-api03-AbCdEf123456789 now"))).not.toContain("AbCdEf");
  });

  it("says which accounts aren't set up on the server, without calling anyone", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const wanted = ["worldpac", "dttire", "wheelmart", "tato", "kv", "anthropic", "email", "ebay"];
    const checks = defaultChecks({ NODE_ENV: "test" } as NodeJS.ProcessEnv).filter((c) => wanted.includes(c.id));
    expect(checks.map((c) => c.id)).toEqual(wanted);
    expect(checks.filter((c) => c.supplier).map((c) => c.id)).toEqual(["worldpac", "dttire", "wheelmart", "tato"]);
    const results = await Promise.all(checks.map((c) => c.run()));
    expect(results.map((r) => r.state)).toEqual(["not_configured", "not_configured", "not_configured", "not_configured", "not_configured", "not_configured", "not_configured", "not_connected"]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("asks vPIC itself instead of the 30-day VIN cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("down", { status: 503 }));
    const vpic = defaultChecks({} as NodeJS.ProcessEnv).find((c) => c.id === "vpic")!;
    await expect(vpic.run()).rejects.toThrow("vPIC 返回 503");
    fetchSpy.mockResolvedValue(Response.json({ Results: [{ Make: "HONDA" }] }));
    await expect(vpic.run()).resolves.toMatchObject({ state: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });
});

describe("GET /api/workbench/status", () => {
  const report: StatusReport = { checkedAt: 5, sources: [] };
  it("is for signed-in staff only, and re-checks when asked", async () => {
    const calls: boolean[] = [];
    const monitor = { report: async (fresh = false) => (calls.push(fresh), report), peek: () => (calls.push("peek" as never), report) } as unknown as StatusMonitor;
    const denied = await handleStatus(new Request("https://repair.speedxrental.com/api/workbench/status"), { user: async () => null, monitor: () => monitor });
    expect(denied.status).toBe(401);
    expect(calls).toEqual([]);

    const deps = { user: async () => ({ email: "kevin@speedx.ca" }), monitor: () => monitor };
    expect(await (await handleStatus(new Request("https://repair.speedxrental.com/api/workbench/status"), deps)).json()).toEqual(report);
    await handleStatus(new Request("https://repair.speedxrental.com/api/workbench/status?fresh=1"), deps);
    await handleStatus(new Request("https://repair.speedxrental.com/api/workbench/status?peek=1"), deps);
    expect(calls).toEqual([false, true, "peek"]);
  });
});

const REPORT: StatusReport = {
  checkedAt: Date.UTC(2026, 10, 14, 18, 30),
  sources: [
    { id: "worldpac", name: "WorldPac speedDIAL", purpose: "零件价格和库存、工时手册", state: "ok", detail: "已登录，车型目录正常", latencyMs: 420, checkedAt: Date.UTC(2026, 10, 14, 18, 30) },
    { id: "dttire", name: "DT Tire Hub", purpose: "轮胎库存和建议零售价", state: "down", detail: "DT Tire Hub keeps asking to sign in", latencyMs: 900, checkedAt: Date.UTC(2026, 10, 14, 18, 30) },
    { id: "ebay", name: "eBay", purpose: "二手和副厂零件", state: "not_connected", detail: "还没接入", checkedAt: Date.UTC(2026, 10, 14, 18, 30) },
  ],
};

describe("the connection panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    bridge.installed = true;
    bridge.status = { version: "1.4.0", signedIn: true };
  });

  it("lists each site with its state, ALLDATA first, and re-checks on request", async () => {
    const fetchMock = vi.fn(async () => Response.json(REPORT));
    vi.stubGlobal("fetch", fetchMock);
    render(<ConnectionStatus onClose={() => {}} />);
    expect(await screen.findByTestId("connection-summary")).toHaveTextContent("1 个连不上");
    expect(within(screen.getByTestId("source-worldpac")).getByText("正常")).toBeInTheDocument();
    expect(screen.getByTestId("source-worldpac")).toHaveTextContent("420 ms");
    expect(within(screen.getByTestId("source-dttire")).getByText("连不上")).toBeInTheDocument();
    expect(screen.getByTestId("source-dttire")).toHaveTextContent("keeps asking to sign in");
    expect(within(screen.getByTestId("source-ebay")).getByText("未接入")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("source-alldata")).toHaveTextContent("已登录（扩展 1.4.0）"));
    expect(screen.getAllByRole("listitem")[0]).toBe(screen.getByTestId("source-alldata"));
    expect(fetchMock).toHaveBeenCalledWith("/api/workbench/status", expect.anything());

    await userEvent.click(screen.getByRole("button", { name: "立即检查" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/workbench/status?fresh=1", expect.anything()));
  });

  it("says when this computer's Chrome isn't set up for ALLDATA", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...REPORT, sources: [] })));
    bridge.status = { version: "1.4.0", signedIn: false };
    const { unmount } = render(<ConnectionStatus onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("source-alldata")).toHaveTextContent("没登录 ALLDATA"));
    expect(within(screen.getByTestId("source-alldata")).getByText("连不上")).toBeInTheDocument();
    unmount();

    bridge.installed = false;
    render(<ConnectionStatus onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("source-alldata")).toHaveTextContent("没装 SPEEDX ALLDATA 扩展"));
  });

  it("puts a red dot on the header button from the last report, and updates it when the panel re-checks", async () => {
    const fetchMock = vi.fn(async (url: string) => Response.json(url.includes("peek") ? { checkedAt: REPORT.checkedAt - 60_000, sources: [REPORT.sources[0]] } : REPORT));
    vi.stubGlobal("fetch", fetchMock);
    function Harness() {
      const connection = useConnectionSummary();
      return (
        <>
          <ConnectionButton open={false} onToggle={() => {}} down={connection.down} />
          <ConnectionStatus onClose={() => {}} onChange={connection.update} />
        </>
      );
    }
    render(<Harness />);
    // The panel's check finds DT down; the dot follows without waiting for the next peek.
    await waitFor(() => expect(screen.getByRole("button", { name: "连接状态（1 个连不上）" })).toBeInTheDocument());
    expect(screen.getByTestId("connection-dot").className).toContain("bg-red-600");
    expect(fetchMock).toHaveBeenCalledWith("/api/workbench/status?peek=1", expect.anything());
  });

  it("shows a grey dot before anything was checked, and only the dot on a phone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ checkedAt: 0, sources: [] })));
    function Harness() {
      const connection = useConnectionSummary();
      return <ConnectionButton open={false} onToggle={() => {}} down={connection.down} />;
    }
    render(<Harness />);
    const button = screen.getByRole("button", { name: "连接状态" });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId("connection-dot").className).toContain("bg-slate-300");
    expect(within(button).getByText("连接状态").className).toContain("hidden sm:inline");
  });
});
