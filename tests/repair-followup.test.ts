import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessagesClient } from "@/lib/repair-chat/agent";
import {
  composeFollowUpEmail,
  createFollowUpHandler,
  createMailer,
  type OutgoingEmail,
} from "@/lib/repair-chat/followup";
import type { EstimateCard } from "@/lib/repair-chat/pricing";
import { SessionStore, type ChatSession, type FinishReason } from "@/lib/repair-chat/session";

const lead = { name: "王先生", phone: "604-555-0182" };

const card = {
  id: "E-1A2B3C4D",
  vehicle: "2019 Toyota Camry LE 2.5 L4",
  service: "Brake Pads R&R",
  position: "Front",
  laborHours: 1.1,
  totalLow: 291.05,
  totalHigh: 317.84,
} as EstimateCard;

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "a".repeat(32),
    lead,
    locale: "zh-CN",
    startedAt: "2026-10-12T18:00:00.000Z",
    lastActivityAt: "2026-10-12T18:05:00.000Z",
    transcript: [
      { role: "user", text: "2019 凯美瑞 LE 刹车有响声", at: "2026-10-12T18:01:00.000Z" },
      { role: "assistant", text: "前刹车片参考价约 $291–$318。", at: "2026-10-12T18:02:00.000Z" },
    ],
    estimates: [card],
    opensToday: 1,
    capped: false,
    ...overrides,
  };
}

describe("SessionStore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends one follow-up after the visitor goes quiet, measured from the last activity", async () => {
    const finished: Array<[ChatSession, FinishReason]> = [];
    const store = new SessionStore(async (s, r) => void finished.push([s, r]), 10_000);
    const s = store.create(lead, "en");
    await vi.advanceTimersByTimeAsync(8_000);
    store.record(s.id, { role: "user", text: "brakes squeal" });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(finished).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(finished).toHaveLength(1);
    expect(finished[0][1]).toBe("idle");
    expect(finished[0][0].transcript.map((l) => l.text)).toEqual(["brakes squeal"]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(finished).toHaveLength(1);
    expect(store.size).toBe(0);
  });

  it("finishes immediately when the visitor leaves and never twice", async () => {
    const finished: FinishReason[] = [];
    const store = new SessionStore(async (_s, r) => void finished.push(r), 10_000);
    const s = store.create(lead, "en");
    store.recordEstimate(s.id, card);
    expect(await store.finish(s.id, "left_page")).toBe(true);
    expect(await store.finish(s.id, "left_page")).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(finished).toEqual(["left_page"]);
  });
});

describe("composeFollowUpEmail", () => {
  it("puts contact details, estimates, summary, and the transcript in the email", () => {
    const email = composeFollowUpEmail(session(), "left_page", "车辆：2019 凯美瑞 LE\n建议跟进：今天致电预约");
    expect(email.subject).toBe("【网站估价线索】王先生 604-555-0182 · 2019 Toyota Camry LE 2.5 L4");
    expect(email.text).toContain("客户电话：604-555-0182");
    expect(email.text).toContain("结束原因：客户离开了页面");
    expect(email.text).toContain("E-1A2B3C4D · 2019 Toyota Camry LE 2.5 L4 · Brake Pads R&R（Front） · 工时 1.1h · 合计 $291.05–$317.84");
    expect(email.text).toContain("建议跟进：今天致电预约");
    expect(email.text).toContain("2019 凯美瑞 LE 刹车有响声");
  });

  it("still alerts the shop when the visitor left details but asked nothing", () => {
    const email = composeFollowUpEmail(session({ transcript: [], estimates: [] }), "idle", null);
    expect(email.text).toContain("客户留下了联系方式，但没有提问");
    expect(email.text).toContain("结束原因：客户 10 分钟无回应");
    expect(email.subject).toBe("【网站估价线索】王先生 604-555-0182");
  });
});

describe("createFollowUpHandler", () => {
  function summarizer(text: string | Error) {
    const prompts: string[] = [];
    const client: MessagesClient = {
      beta: {
        messages: {
          create: async (params) => {
            prompts.push(JSON.stringify(params));
            if (text instanceof Error) throw text;
            return { stop_reason: "end_turn", content: [{ type: "text", text }] } as never;
          },
        },
      },
    };
    return { client, prompts };
  }

  it("summarizes without sending the name or phone to the model, then emails", async () => {
    const { client, prompts } = summarizer("车辆：2019 凯美瑞\n问题：刹车异响");
    const sent: OutgoingEmail[] = [];
    await createFollowUpHandler(() => client, async (e) => void sent.push(e))(session(), "idle");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("刹车有响声");
    expect(prompts[0]).not.toContain("王先生");
    expect(prompts[0]).not.toContain("555-0182");
    expect(sent[0].text).toContain("问题：刹车异响");
  });

  it("emails without a summary if the model fails, and skips the model when nothing was asked", async () => {
    const failing = summarizer(new Error("down"));
    const sent: OutgoingEmail[] = [];
    await createFollowUpHandler(() => failing.client, async (e) => void sent.push(e))(session(), "idle");
    expect(sent[0].text).toContain("摘要生成失败");

    const quiet = summarizer("unused");
    await createFollowUpHandler(() => quiet.client, async (e) => void sent.push(e))(session({ transcript: [] }), "idle");
    expect(quiet.prompts).toHaveLength(0);
    expect(sent).toHaveLength(2);
  });

  it("keeps the email in the log when sending fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await createFollowUpHandler(() => null, async () => {
      throw new Error("smtp down");
    })(session(), "idle");
    expect(errors.mock.calls.flat().join(" ")).toContain("604-555-0182");
    errors.mockRestore();
  });

  it("logs instead of sending when SMTP is not configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await createMailer({} as NodeJS.ProcessEnv)({ subject: "s", text: "t" });
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});
