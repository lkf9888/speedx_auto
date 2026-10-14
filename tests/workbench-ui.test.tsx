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

  it("lets staff rename a conversation, keeps the name after a reload, and Escape cancels", async () => {
    const { unmount } = render(<Workbench email="a@speedx.test" />);
    await ask("2019 Camry 前刹车片");
    await screen.findByText(/答复：2019 Camry/);

    await userEvent.click(screen.getByRole("button", { name: "重命名会话 2019 Camry 前刹车片" }));
    await userEvent.keyboard("{Escape}");
    expect(titles()).toEqual(["2019 Camry 前刹车片"]);

    await userEvent.click(screen.getByRole("button", { name: "重命名会话 2019 Camry 前刹车片" }));
    const box = screen.getByLabelText("会话标题");
    await userEvent.clear(box);
    await userEvent.type(box, "张先生 Camry{enter}");
    expect(titles()).toEqual(["张先生 Camry"]);

    unmount();
    render(<Workbench email="a@speedx.test" />);
    expect(titles()).toEqual(["张先生 Camry"]);
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

describe("ALLDATA in the workbench", () => {
  const requests: Array<{ op: string; args: Record<string, unknown> }> = [];
  let fakeExtension: ((event: MessageEvent) => void) | null = null;

  function installFakeExtension(answers: Record<string, unknown>) {
    fakeExtension = (event: MessageEvent) => {
      const data = event.data as { channel?: string; direction?: string; id?: string; op?: string; args?: Record<string, unknown> };
      if (data?.channel !== "speedx-alldata") return;
      // jsdom's postMessage leaves origin and source empty, so answer the way a browser would deliver it.
      const answer = (message: Record<string, unknown>) =>
        setTimeout(() =>
          window.dispatchEvent(new MessageEvent("message", { data: { channel: "speedx-alldata", id: data.id, ...message }, origin: window.location.origin, source: window })),
        );
      if (data.direction === "ping") answer({ direction: "pong", version: "1.0.0" });
      if (data.direction === "request") {
        requests.push({ op: data.op!, args: data.args! });
        answer({ direction: "response", ok: true, result: answers[data.op!] });
      }
    };
    window.addEventListener("message", fakeExtension);
  }

  const draftEvent = {
    type: "alldata_draft",
    draft: {
      id: "D-1",
      title: "前刹车片",
      customer: { name: "Test Person", phone: "604-555-0100", email: "" },
      vehicle: "2019 Toyota Camry LE",
      vin: "",
      mileage: 82000,
      lines: [
        { kind: "part", description: "Front brake pads", partNumber: "ACT2076", quantity: 1, unitPrice: 129.99, unitCost: 78.86, taxable: true },
        { kind: "labor", description: "Replace front pads", partNumber: "", quantity: 1.3, unitPrice: 120, unitCost: null, taxable: true },
      ],
      note: "",
      createdAt: "2026-10-14T18:00:00Z",
    },
  };

  beforeEach(async () => {
    window.localStorage.clear();
    requests.length = 0;
    const { resetBridge } = await import("@/lib/workbench/alldata-bridge");
    resetBridge();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ndjson([draftEvent, { type: "message", text: "草稿好了，请核对后创建。" }, { type: "done" }])),
    );
  });
  afterEach(() => {
    if (fakeExtension) window.removeEventListener("message", fakeExtension);
    fakeExtension = null;
    vi.unstubAllGlobals();
  });

  it("creates the drafted estimate through the extension and keeps the result", async () => {
    installFakeExtension({
      searchCustomers: { customers: [{ customerId: 55, name: "Test Person", phone: "604-555-0100", vehicles: [{ customerVehicleId: 901, description: "2019 Toyota Camry 2.5L", vin: "" }] }] },
      createEstimate: { documentId: 444, estimateNumber: 954, customerAttached: true },
      openPdf: { opened: true },
    });
    const view = render(<Workbench email="staff@example.com" />);
    await ask("开 ALLDATA 估价单");
    const card = await screen.findByTestId("alldata-draft");
    expect(within(card).getByText("$285.99")).toBeInTheDocument();
    expect(within(card).getByLabelText("ALLDATA 客户")).toHaveValue("604-555-0100");

    await userEvent.click(within(card).getByRole("button", { name: "查找" }));
    await userEvent.click(await within(card).findByRole("radio", { name: /Test Person 604-555-0100 · 2019 Toyota Camry/ }));
    await userEvent.click(within(card).getByRole("button", { name: "在 ALLDATA 创建估价单" }));
    expect(await within(card).findByText(/已在 ALLDATA 建好 Estimate #954/)).toBeInTheDocument();

    const create = requests.find((r) => r.op === "createEstimate")!;
    expect(create.args).toMatchObject({ customerId: 55, customerVehicleId: 901, mileageIn: 82000 });
    expect((create.args.datalines as unknown[]).length).toBe(2);

    await userEvent.click(within(card).getByRole("button", { name: "打开 PDF（打印 / 下载）" }));
    expect(requests.at(-1)).toEqual({ op: "openPdf", args: { documentId: 444, documentType: "Estimate" } });

    // The created estimate survives a reload: no second create button.
    view.unmount();
    render(<Workbench email="staff@example.com" />);
    expect(screen.getByText(/已在 ALLDATA 建好 Estimate #954/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "在 ALLDATA 创建估价单" })).not.toBeInTheDocument();
  });

  it("tells staff to install the extension when it is missing", async () => {
    render(<Workbench email="staff@example.com" />);
    await ask("开 ALLDATA 估价单");
    const card = await screen.findByTestId("alldata-draft");
    await userEvent.click(within(card).getByRole("button", { name: "查找" }));
    expect(await within(card).findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("还没装 SPEEDX ALLDATA 扩展");
  });

  it("finds past documents and opens the invoice PDF", async () => {
    installFakeExtension({
      searchDocuments: {
        documents: [{ documentId: 444, number: 954, state: "Invoice", voided: false, customerName: "Test Person", vehicle: "2019 Toyota Camry", updatedOn: 0, printable: ["Estimate", "Invoice"] }],
      },
      openPdf: { opened: true },
    });
    render(<Workbench email="staff@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: "ALLDATA 单据" }));
    await userEvent.type(screen.getByLabelText("查找单据"), "Test{Enter}");
    const row = await screen.findByTestId("alldata-document");
    expect(row).toHaveTextContent("#954 · 发票");
    await userEvent.click(within(row).getByRole("button", { name: "发票 / 收据 PDF" }));
    expect(requests.at(-1)).toEqual({ op: "openPdf", args: { documentId: 444, documentType: "Invoice" } });
  });
});
