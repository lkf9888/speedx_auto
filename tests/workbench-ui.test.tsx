import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "@/components/workbench/Workbench";

function ndjson(events: unknown[]) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

/** Replies "答复：<question>" and reports a vehicle for questions mentioning Camry. */
function fakeServer() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { message: string; vehicleKey: string | null };
    const events: unknown[] = [];
    if (body.message.includes("Camry")) events.push({ type: "vehicle", vehicle: { key: "k-camry", label: "2019 Toyota Camry LE" } });
    events.push({ type: "message", text: `答复：${body.message}（车辆 ${body.vehicleKey ?? "无"}）` }, { type: "done" });
    return ndjson(events);
  });
}

async function ask(text: string) {
  await userEvent.type(screen.getByLabelText("问一个报价"), `${text}{Enter}`);
}

const titles = () => screen.getAllByTestId("conversation").map((b) => within(b).getAllByText(/./)[0].textContent);

describe("workbench conversations", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", fakeServer());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps each conversation's messages and vehicle apart", async () => {
    render(<Workbench email="staff@example.com" />);
    await ask("2019 Camry 前刹车片");
    expect(await screen.findByText(/答复：2019 Camry 前刹车片/)).toBeInTheDocument();
    expect(screen.getByText("当前车辆：2019 Toyota Camry LE")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ 新会话" }));
    expect(screen.queryByText(/答复：2019 Camry/)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前车辆/)).not.toBeInTheDocument();
    await ask("225/65R17 四季胎");
    // The second conversation doesn't carry the first one's vehicle.
    expect(await screen.findByText("答复：225/65R17 四季胎（车辆 无）")).toBeInTheDocument();

    await userEvent.click(screen.getAllByTestId("conversation").find((b) => b.textContent?.includes("2019 Camry"))!);
    expect(screen.getByText(/答复：2019 Camry 前刹车片/)).toBeInTheDocument();
    await ask("后刹车片呢");
    expect(await screen.findByText("答复：后刹车片呢（车辆 k-camry）")).toBeInTheDocument();
  });

  it("restores conversations after a reload and lets staff delete one", async () => {
    const first = render(<Workbench email="staff@example.com" />);
    await ask("2019 Camry 前刹车片");
    await screen.findByText(/答复：2019 Camry/);
    await userEvent.click(screen.getByRole("button", { name: "+ 新会话" }));
    await ask("2018 Civic LX 换机油");
    await screen.findByText(/答复：2018 Civic/);
    first.unmount();

    render(<Workbench email="staff@example.com" />);
    expect(titles()).toEqual(["2018 Civic LX 换机油", "2019 Camry 前刹车片"]);
    await userEvent.click(screen.getByRole("button", { name: "删除会话 2018 Civic LX 换机油" }));
    expect(titles()).toEqual(["2019 Camry 前刹车片"]);
  });

  it("keeps one staff member's conversations separate from another's on the same browser", async () => {
    const first = render(<Workbench email="a@example.com" />);
    await ask("2019 Camry 前刹车片");
    await screen.findByText(/答复：2019 Camry/);
    first.unmount();
    render(<Workbench email="b@example.com" />);
    expect(titles()).toEqual(["新会话"]);
  });

  it("lets one conversation work while another is still waiting", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const { message } = JSON.parse(String(init?.body)) as { message: string };
        if (message === "慢的问题") await slow;
        return ndjson([{ type: "message", text: `答复：${message}` }, { type: "done" }]);
      }),
    );
    render(<Workbench email="staff@example.com" />);
    await ask("慢的问题");
    expect(await screen.findByRole("status")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ 新会话" }));
    await ask("快的问题");
    expect(await screen.findByText("答复：快的问题")).toBeInTheDocument();
    release();
    await userEvent.click(screen.getAllByTestId("conversation").find((b) => b.textContent?.includes("慢的问题"))!);
    expect(await screen.findByText("答复：慢的问题")).toBeInTheDocument();
  });
});
