import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workbench } from "@/components/workbench/Workbench";
import { ASSISTANT, type Turn } from "@/lib/workbench/conversation-types";
import { ConversationStore, newTurnId } from "@/lib/workbench/conversations";
import { handleConversation, handleConversationList } from "@/lib/workbench/conversations-http";
import { historyFromTurns } from "@/lib/workbench/http";
import { memoryKv } from "@/lib/workbench/kv";

function ndjson(events: unknown[]) {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

interface CloudOptions {
  /** Extra events before the reply text (cards). */
  events?: (message: string) => unknown[];
  /** Hold a reply until the promise settles. */
  delay?: (message: string) => Promise<void> | undefined;
  /** Other endpoints (e.g. memory). */
  other?: (url: string, init?: RequestInit) => Promise<Response> | undefined;
}

/**
 * The workbench's cloud, for the page under test: the real conversation store
 * and endpoints over an in-memory KV, plus a chat endpoint that saves turns the
 * way the real one does and answers "答复：<question>（车辆 <key>）".
 */
function cloud(options: CloudOptions = {}) {
  const store = new ConversationStore(memoryKv());
  const chats: Array<{ conversationId: string; message: string; history: Array<{ role: string; text: string }>; attachments?: unknown[] }> = [];
  let who = "staff@example.com";
  const deps = { user: async () => ({ email: who }), store: () => store, log: () => {} };
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const request = new Request(`https://repair.speedxrental.com${url}`, init);
    if (url === "/api/workbench/conversations") return handleConversationList(request, deps);
    const one = url.match(/^\/api\/workbench\/conversations\/([^/]+)$/);
    if (one) return handleConversation(request, one[1], deps);
    if (url === "/api/workbench/chat") {
      const body = JSON.parse(String(init?.body)) as { conversationId: string; message: string; attachments?: Array<{ name: string; mediaType: string }> };
      const stored = await store.get(body.conversationId);
      chats.push({ conversationId: body.conversationId, message: body.message, history: historyFromTurns(stored?.turns ?? []), attachments: body.attachments });
      const asker = who;
      const question: Turn = {
        id: newTurnId(),
        role: "user",
        text: body.message,
        author: asker,
        at: Date.now(),
        quotes: [],
        ...(body.attachments ? { attachments: body.attachments.map(({ name, mediaType }) => ({ name, mediaType })) } : {}),
      };
      await store.append(body.conversationId, asker, [question], undefined, body.message || body.attachments?.[0]?.name);
      store.pending.set(body.conversationId, { by: asker, status: "thinking", since: Date.now() });
      await options.delay?.(body.message);
      const vehicle = body.message.includes("Camry") ? { key: "k-camry", label: "2019 Toyota Camry LE" } : (stored?.vehicle ?? null);
      const extra = options.events?.(body.message) ?? [];
      const text = `答复：${body.message}（车辆 ${vehicle?.key ?? "无"}）`;
      const answer: Turn = {
        id: newTurnId(),
        role: "assistant",
        author: ASSISTANT,
        at: Date.now(),
        text,
        quotes: [],
        ...(extra.some((e) => (e as { type: string }).type === "alldata_draft") ? { drafts: extra.filter((e) => (e as { type: string }).type === "alldata_draft").map((e) => (e as { draft: never }).draft) } : {}),
        ...(extra.some((e) => (e as { type: string }).type === "memory_proposal") ? { memories: extra.filter((e) => (e as { type: string }).type === "memory_proposal").map((e) => (e as { proposal: never }).proposal) } : {}),
      };
      await store.append(body.conversationId, asker, [answer], vehicle);
      store.pending.delete(body.conversationId);
      return ndjson([...(vehicle ? [{ type: "vehicle", vehicle }] : []), ...extra, { type: "message", text }, { type: "saved", turns: [question, answer] }, { type: "done" }]);
    }
    const handled = options.other?.(url, init);
    if (handled) return handled;
    throw new Error(`unexpected ${url}`);
  });
  return {
    store,
    chats,
    fetchImpl,
    /** Who the next requests come from. */
    as(email: string) {
      who = email;
    },
  };
}

async function ask(text: string) {
  await userEvent.type(screen.getByLabelText("问一个报价"), `${text}{Enter}`);
}

/** The open conversation only: the conversation list repeats the last reply as a preview. */
const chat = () => within(screen.getByRole("main"));

const titles = () => screen.getAllByTestId("conversation").map((b) => within(b).getByTestId("conversation-title").textContent);

/** A fresh browser: nothing kept locally. */
function newBrowser() {
  window.localStorage.clear();
}

describe("shared workbench conversations", () => {
  let server: ReturnType<typeof cloud>;
  beforeEach(() => {
    newBrowser();
    server = cloud();
    vi.stubGlobal("fetch", server.fetchImpl);
    vi.stubGlobal("confirm", () => true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps each conversation's messages and vehicle apart", async () => {
    render(<Workbench email="staff@example.com" />);
    await ask("2019 Camry 前刹车片");
    expect(await chat().findByText(/答复：2019 Camry 前刹车片/)).toBeInTheDocument();
    expect(screen.getByText("当前车辆：2019 Toyota Camry LE")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ 新会话" }));
    expect(chat().queryByText(/答复：2019 Camry/)).not.toBeInTheDocument();
    await ask("225/65R17 四季胎");
    // The second conversation doesn't carry the first one's vehicle.
    expect(await chat().findByText("答复：225/65R17 四季胎（车辆 无）")).toBeInTheDocument();

    await userEvent.click(screen.getAllByTestId("conversation").find((b) => b.textContent?.includes("2019 Camry"))!);
    expect(await chat().findByText(/答复：2019 Camry 前刹车片/)).toBeInTheDocument();
    await ask("后刹车片呢");
    expect(await chat().findByText("答复：后刹车片呢（车辆 k-camry）")).toBeInTheDocument();
    // The server, not the page, supplies the history.
    expect(server.chats.at(-1)!.history.map((t) => t.text)).toEqual(["2019 Camry 前刹车片", "答复：2019 Camry 前刹车片（车辆 k-camry）"]);
  });

  it("keeps conversations in the cloud: another browser sees them, and staff can delete one", async () => {
    const first = render(<Workbench email="staff@example.com" />);
    await ask("2019 Camry 前刹车片");
    await chat().findByText(/答复：2019 Camry/);
    await userEvent.click(screen.getByRole("button", { name: "+ 新会话" }));
    await ask("2018 Civic LX 换机油");
    await chat().findByText(/答复：2018 Civic/);
    first.unmount();

    newBrowser();
    render(<Workbench email="staff@example.com" />);
    await waitFor(() => expect(titles()).toEqual(["2018 Civic LX 换机油", "2019 Camry 前刹车片"]));
    expect(await chat().findByText(/答复：2018 Civic/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "删除会话 2018 Civic LX 换机油" }));
    await waitFor(() => expect(titles()).toEqual(["2019 Camry 前刹车片"]));
    expect(await server.store.list()).toHaveLength(1);
  });

  it("shows everyone's messages with who sent them, like a group chat", async () => {
    server.as("kevin@speedx.ca");
    const kevin = render(<Workbench email="kevin@speedx.ca" />);
    await ask("2019 Camry 前刹车片");
    await chat().findByText(/答复：2019 Camry/);
    kevin.unmount();

    newBrowser();
    server.as("amy@speedx.ca");
    render(<Workbench email="amy@speedx.ca" />);
    const fromKevin = await screen.findByTestId("colleague-message");
    expect(fromKevin).toHaveTextContent("kevin");
    expect(fromKevin).toHaveTextContent("2019 Camry 前刹车片");
    expect(within(screen.getAllByTestId("conversation")[0]).getByText(/答复：2019 Camry/)).toBeInTheDocument();

    // Amy carries on in the same conversation; her own message is hers, Kevin's stays his.
    await ask("后刹车片也报一下");
    await chat().findByText(/答复：后刹车片也报一下/);
    expect(screen.getAllByTestId("colleague-message")).toHaveLength(1);
    const stored = await server.store.get(server.chats[0].conversationId);
    expect(stored!.turns.filter((t) => t.role === "user").map((t) => t.author)).toEqual(["kevin@speedx.ca", "amy@speedx.ca"]);
  });

  it("lets staff rename a conversation for everyone, and Escape cancels", async () => {
    const { unmount } = render(<Workbench email="a@speedx.test" />);
    await ask("2019 Camry 前刹车片");
    await chat().findByText(/答复：2019 Camry/);

    await userEvent.click(screen.getByRole("button", { name: "重命名会话 2019 Camry 前刹车片" }));
    await userEvent.keyboard("{Escape}");
    expect(titles()).toEqual(["2019 Camry 前刹车片"]);

    await userEvent.click(screen.getByRole("button", { name: "重命名会话 2019 Camry 前刹车片" }));
    const box = screen.getByLabelText("会话标题");
    await userEvent.clear(box);
    await userEvent.type(box, "张先生 Camry{enter}");
    await waitFor(() => expect(titles()).toEqual(["张先生 Camry"]));

    unmount();
    newBrowser();
    render(<Workbench email="b@speedx.test" />);
    await waitFor(() => expect(titles()).toEqual(["张先生 Camry"]));
  });

  it("right-click on a conversation offers rename, archive and delete; archived ones move to their own list for everyone", async () => {
    const { unmount } = render(<Workbench email="a@speedx.test" />);
    await ask("2019 Camry 前刹车片");
    await chat().findByText(/答复：2019 Camry/);
    await userEvent.click(screen.getByRole("button", { name: "+ 新会话" }));
    await ask("2018 Civic LX 换机油");
    await chat().findByText(/答复：2018 Civic/);

    // Archive the Camry one from the right-click menu.
    const camry = screen.getAllByTestId("conversation").find((b) => b.textContent?.includes("2019 Camry"))!;
    await userEvent.pointer({ keys: "[MouseRight]", target: camry });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["重命名", "存档", "删除"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "存档" }));
    await waitFor(() => expect(titles()).toEqual(["2018 Civic LX 换机油"]));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Others see it archived too, and can bring it back.
    unmount();
    newBrowser();
    render(<Workbench email="b@speedx.test" />);
    await waitFor(() => expect(titles()).toEqual(["2018 Civic LX 换机油"]));
    await userEvent.click(screen.getByRole("button", { name: "已存档（1）" }));
    expect(titles()).toEqual(["2019 Camry 前刹车片"]);
    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByTestId("conversation") });
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "取消存档" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /已存档/ })).not.toBeInTheDocument());
    await waitFor(() => expect(titles()).toEqual(["2019 Camry 前刹车片", "2018 Civic LX 换机油"]));
  });

  it("renames and deletes from the menu, and the ⋯ button opens the same menu; a new message un-archives", async () => {
    render(<Workbench email="a@speedx.test" />);
    await ask("2019 Camry 前刹车片");
    await chat().findByText(/答复：2019 Camry/);

    await userEvent.click(screen.getByRole("button", { name: "会话菜单 2019 Camry 前刹车片" }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "重命名" }));
    const box = screen.getByLabelText("会话标题");
    await userEvent.clear(box);
    await userEvent.type(box, "李小姐{enter}");
    await waitFor(() => expect(titles()).toEqual(["李小姐"]));

    await userEvent.click(screen.getByRole("button", { name: "会话菜单 李小姐" }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "存档" }));
    await waitFor(() => expect(screen.queryAllByTestId("conversation")).toHaveLength(0));
    // Opening it from the archive and writing in it brings it back.
    await userEvent.click(screen.getByRole("button", { name: "已存档（1）" }));
    await userEvent.click(screen.getByTestId("conversation"));
    await ask("再问一句");
    await waitFor(() => expect(screen.queryByRole("button", { name: /已存档/ })).not.toBeInTheDocument());
    await waitFor(() => expect(titles()).toEqual(["李小姐"]));

    await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByTestId("conversation") });
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "删除" }));
    await waitFor(() => expect(screen.queryAllByTestId("conversation")).toHaveLength(0));
  });

  it("opens memory and ALLDATA as pop-up windows, closed by × , Escape or a click outside", async () => {
    render(<Workbench email="a@speedx.test" />);
    await userEvent.click(screen.getByRole("button", { name: "ALLDATA 单据" }));
    const dialog = await screen.findByRole("dialog", { name: "ALLDATA 单据" });
    // Not inside the scrolling chat, where it used to hide above the messages.
    expect(screen.getByRole("main")).not.toContainElement(dialog);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ALLDATA 单据" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "关闭 ALLDATA 单据" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ALLDATA 单据" }));
    await userEvent.pointer({ keys: "[MouseLeft]", target: screen.getByRole("dialog") });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("switches between day and night mode and remembers the choice", async () => {
    window.localStorage.setItem("speedx.workbench.theme.v1", "light");
    const { container, unmount } = render(<Workbench email="a@speedx.test" />);
    const root = () => container.querySelector(".wb-root")!;
    expect(root()).toHaveAttribute("data-theme", "light");
    await userEvent.click(screen.getByRole("button", { name: "切换到夜间模式" }));
    expect(root()).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("speedx.workbench.theme.v1")).toBe("dark");

    unmount();
    const again = render(<Workbench email="a@speedx.test" />);
    expect(again.container.querySelector(".wb-root")).toHaveAttribute("data-theme", "dark");
    await userEvent.click(screen.getByRole("button", { name: "切换到白天模式" }));
    expect(again.container.querySelector(".wb-root")).toHaveAttribute("data-theme", "light");
  });

  it("sends attached photos and files, and stores only their names in the cloud", async () => {
    const { unmount } = render(<Workbench email="staff@example.com" />);
    const photo = new File([new Uint8Array([1, 2, 3])], "vin.jpg", { type: "image/jpeg" });
    const sheet = new File(["part,qty\nACT2076,1"], "list.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByTestId("file-input"), [photo, sheet]);
    expect(await screen.findByText("vin.jpg")).toBeInTheDocument();
    expect(screen.getByText("list.csv")).toBeInTheDocument();

    // Files alone are enough to send.
    await userEvent.click(screen.getByRole("button", { name: "查询" }));
    await chat().findByText(/答复：/);
    const sent = JSON.parse(String(server.fetchImpl.mock.calls.find(([url]) => url === "/api/workbench/chat")![1]?.body));
    expect(sent.message).toBe("");
    expect(sent.attachments).toEqual([
      { name: "vin.jpg", mediaType: "image/jpeg", data: "AQID" },
      { name: "list.csv", mediaType: "text/csv", data: "part,qty\nACT2076,1" },
    ]);
    expect(within(screen.getByTestId("sent-files")).getByText("list.csv")).toBeInTheDocument();

    // The next question's history names the earlier files instead of sending them again.
    await ask("这个 VIN 的车？");
    await chat().findByText(/答复：这个 VIN/);
    expect(server.chats[1].attachments).toBeUndefined();
    expect(server.chats[1].history[0].text).toContain("[附件：vin.jpg、list.csv]");

    unmount();
    newBrowser();
    render(<Workbench email="staff@example.com" />);
    expect(within(await screen.findByTestId("sent-files")).getByText("list.csv")).toBeInTheDocument();
    expect(JSON.stringify(await server.store.get(server.chats[0].conversationId))).not.toContain("AQID");
  });

  it("refuses unsupported files with a note and lets staff remove a picked file", async () => {
    render(<Workbench email="staff@example.com" />);
    await userEvent.upload(screen.getByTestId("file-input"), new File(["x"], "setup.exe", { type: "application/x-msdownload" }), { applyAccept: false });
    expect(await screen.findByRole("alert")).toHaveTextContent("不支持这种文件");

    await userEvent.upload(screen.getByTestId("file-input"), new File(["hello"], "note.txt", { type: "text/plain" }));
    await userEvent.click(await screen.findByRole("button", { name: "移除 note.txt" }));
    expect(screen.queryByText("note.txt")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查询" })).toBeDisabled();
  });

  it("uploads the conversations a browser kept before the move to the cloud, once", async () => {
    window.localStorage.setItem(
      "speedx.workbench.conversations.v1:staff@example.com",
      JSON.stringify([
        {
          id: "cold0001",
          title: "老会话 Sienna",
          vehicle: null,
          updatedAt: 1,
          turns: [
            { role: "user", text: "2016 Sienna 前刹车片", quotes: [], at: 1 },
            { role: "assistant", text: "旧的答复", quotes: [], at: 2 },
          ],
        },
      ]),
    );
    render(<Workbench email="staff@example.com" />);
    await waitFor(() => expect(titles()).toContain("老会话 Sienna"));
    expect((await server.store.get("cold0001"))!.turns[0]).toMatchObject({ author: "staff@example.com", text: "2016 Sienna 前刹车片" });
    expect(window.localStorage.getItem("speedx.workbench.migrated.v1:staff@example.com")).toBeTruthy();
  });

  it("lets one conversation work while another is still waiting", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    server = cloud({ delay: (message) => (message === "慢的问题" ? slow : undefined) });
    vi.stubGlobal("fetch", server.fetchImpl);
    render(<Workbench email="staff@example.com" />);
    await ask("慢的问题");
    expect(await screen.findByRole("status")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ 新会话" }));
    await ask("快的问题");
    expect(await chat().findByText("答复：快的问题（车辆 无）")).toBeInTheDocument();
    release();
    await userEvent.click(screen.getAllByTestId("conversation").find((b) => b.textContent?.includes("慢的问题"))!);
    expect(await chat().findByText("答复：慢的问题（车辆 无）")).toBeInTheDocument();
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
    vi.stubGlobal("fetch", cloud({ events: () => [draftEvent] }).fetchImpl);
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

    // The created estimate is saved with the conversation: no second create button anywhere.
    view.unmount();
    window.localStorage.clear();
    render(<Workbench email="staff@example.com" />);
    expect(await screen.findByText(/已在 ALLDATA 建好 Estimate #954/)).toBeInTheDocument();
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

describe("workbench memory", () => {
  let saved: Array<{ id: string; text: string }> = [];
  const memoryCalls: Array<{ method: string; body: Record<string, unknown> | null }> = [];

  beforeEach(() => {
    window.localStorage.clear();
    saved = [{ id: "m1", text: "Toyota 先查 VIN" }];
    memoryCalls.length = 0;
    const note = (n: { id: string; text: string }) => ({ ...n, createdBy: "a@x", createdAt: "2026-10-14T20:00:00Z", updatedBy: "a@x", updatedAt: "2026-10-14T20:00:00Z" });
    vi.stubGlobal(
      "fetch",
      cloud({
        events: () => [{ type: "memory_proposal", proposal: { id: "M-1", text: "米其林冬季胎先问客人能不能接受带钉胎", replacesId: null } }],
        other: (url, init) => {
          if (url !== "/api/workbench/memory") return undefined;
          const method = init?.method ?? "GET";
          const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
          memoryCalls.push({ method, body });
          if (method === "POST") saved.push({ id: `m${saved.length + 1}`, text: String(body!.text) });
          if (method === "DELETE") saved = saved.filter((n) => n.id !== body!.id);
          return Promise.resolve(Response.json({ notes: saved.map(note) }, { status: method === "POST" ? 201 : 200 }));
        },
      }).fetchImpl,
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves a suggested note only when staff press save, and remembers that it was saved", async () => {
    const view = render(<Workbench email="staff@example.com" />);
    await ask("记住：米其林冬季胎先问客人能不能接受带钉胎");
    const card = await screen.findByTestId("memory-proposal");
    expect(memoryCalls).toEqual([]);
    await userEvent.click(within(card).getByRole("button", { name: "保存到记忆" }));
    expect(await within(card).findByText(/已保存/)).toBeInTheDocument();
    expect(memoryCalls).toEqual([{ method: "POST", body: { text: "米其林冬季胎先问客人能不能接受带钉胎" } }]);
    view.unmount();
    window.localStorage.clear();
    render(<Workbench email="staff@example.com" />);
    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存到记忆" })).not.toBeInTheDocument();
  });

  it("lists, adds and deletes notes in the memory panel", async () => {
    render(<Workbench email="staff@example.com" />);
    await userEvent.click(screen.getByRole("button", { name: "工作台记忆" }));
    expect(await screen.findByText("Toyota 先查 VIN")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("新增记忆"), "BMW 机油用 LL-01{Enter}");
    expect(await screen.findByText("BMW 机油用 LL-01")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "删除记忆 1" }));
    await waitFor(() => expect(screen.queryByText("Toyota 先查 VIN")).not.toBeInTheDocument());
    expect(screen.getAllByTestId("memory-note")).toHaveLength(1);
  });
});
