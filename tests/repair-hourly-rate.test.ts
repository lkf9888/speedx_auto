import { describe, expect, it } from "vitest";
import { handleChat, type RouteDeps } from "@/lib/repair-chat/http";
import { hideHourlyRate, hourlyRateAnswer, statesHourlyRate } from "@/lib/repair-chat/hourly-rate";
import { SYSTEM_PROMPT } from "@/lib/repair-chat/prompt";
import { buildEstimate, summarizeEstimateForModel, WALK_IN_LABOR_RATE } from "@/lib/repair-chat/pricing";
import { RateLimiter } from "@/lib/repair-chat/rate-limit";
import { SessionStore } from "@/lib/repair-chat/session";

// Kevin, 2026-11-14: the public assistant doesn't tell customers the hourly labor rate.

const RATE = `$${WALK_IN_LABOR_RATE}`;
/** The rate as a figure, not "CAD $120,000" (the luxury-vehicle cut-off in the tool descriptions). */
const RATE_FIGURE = new RegExp(`\\$${WALK_IN_LABOR_RATE}(?![,\\d])`);

describe("the public assistant is never given the hourly rate", () => {
  it("leaves the rate, and any amount that gives it away, out of the system prompt", () => {
    expect(SYSTEM_PROMPT).not.toContain(RATE);
    expect(SYSTEM_PROMPT).not.toContain(`$${WALK_IN_LABOR_RATE * 0.5}`);
    expect(SYSTEM_PROMPT).not.toMatch(/per hour|\/h\b|\d h = \$/i);
    expect(SYSTEM_PROMPT).toMatch(/does not tell customers an hourly labor rate/);
  });
});

describe("estimate summaries give the labor amount without the hours", () => {
  const card = (laborHours: number, laborNote: string) =>
    buildEstimate(
      "2019 Toyota Camry",
      { status: "ok", serviceName: "Brake Rotor R&R", position: "Front", laborHours, laborNote, primaryPartName: "", partOptions: [], otherPartNames: [], partsNote: "" },
      "E-1",
    );

  it("keeps hour figures out of the labor note, so labor ÷ hours can't be worked out", () => {
    const rotors = summarizeEstimateForModel(card(0.5, "No labor-guide time for rotors on this vehicle: the shop charges 0.5 h per axle, on top of the brake pad job."));
    expect(rotors).toContain("Labor on the card: $60");
    expect(rotors).not.toMatch(/0\.5 h/);
    expect(rotors).toContain("the shop charges a set time per axle");
    const halved = summarizeEstimateForModel(card(0.45, "Done together with Brake Rotor R&R: labor charged at half (0.9 h → 0.45 h). Includes resurfacing."));
    expect(halved).not.toMatch(/0\.9 h|0\.45 h/);
    expect(halved).toContain("labor charged at half. Includes resurfacing.");
  });
});

describe("statesHourlyRate", () => {
  it.each([
    "Our hourly rate is $120.",
    "Labor is $120/h.",
    "We charge $120 per hour",
    "It's 120 dollars an hour",
    "The shop rate: $120",
    "我们的时薪是 $120。",
    "每小时 120 元",
    "工时费率 $120/小时",
    "我們的時薪是 120 元",
  ])("catches case %#", (sentence) => {
    expect(statesHourlyRate(sentence)).toBe(true);
  });

  it.each([
    "A premium 0W-30 oil change is $120, oil and filter included.",
    "Labor on the card is $132 and the total is about $262–$350.",
    "Labor is charged by labor-guide time and is already included in the estimate.",
    "The job takes about 1.1 h at the shop.",
    "Vehicles that sold new above $120,000 are quoted by the team.",
    "高级机油 0W-30 换机油 $120，含机油和机滤。",
    "大约需要 45 分钟到一小时。",
  ])("leaves case %# alone", (sentence) => {
    expect(statesHourlyRate(sentence)).toBe(false);
  });
});

describe("hideHourlyRate", () => {
  it("drops the rate sentence, keeps the rest, and puts the shop's answer first", () => {
    const reply = hideHourlyRate("Our hourly rate is $120. Front pads on your 2019 Camry come to about $262–$350.", "English");
    expect(reply).not.toContain(RATE);
    expect(reply.startsWith(hourlyRateAnswer("English"))).toBe(true);
    expect(reply).toContain("about $262–$350.");
  });

  it("answers in Chinese when the customer writes Chinese", () => {
    const reply = hideHourlyRate("我们的工时是每小时 $120。需要帮您报个价吗？", "Simplified Chinese");
    expect(reply).not.toContain(RATE);
    expect(reply).toContain("不单独报每小时的价钱");
    expect(reply).toContain("需要帮您报个价吗？");
  });

  it("returns a reply with no rate in it unchanged", () => {
    const text = "Labor is charged by the standard labor-guide time and is already in each estimate.\nWhich car is it?";
    expect(hideHourlyRate(text, "English")).toBe(text);
  });
});

describe("a customer asking for the hourly rate", () => {
  function chat(modelReply: string, message: string) {
    const prompts: string[] = [];
    const deps: RouteDeps = {
      configured: () => true,
      limiter: new RateLimiter(),
      notify: async () => {},
      sessions: new SessionStore(async () => {}),
      catalog: () => ({ get: async () => ({}) as never, post: async () => ({}) as never }),
      client: () => ({
        beta: {
          messages: {
            create: async (params: unknown) => {
              prompts.push(JSON.stringify(params));
              return { stop_reason: "end_turn", content: [{ type: "text", text: modelReply }] } as never;
            },
          },
        },
      }),
    };
    const request = new Request("https://speedxrental.com/api/repair-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://speedxrental.com" },
      body: JSON.stringify({ locale: "en", history: [], message, vehicleKey: null, lead: { name: "Test", phone: "604-555-0100" }, sessionId: null }),
    });
    return handleChat(request, deps).then(async (response) => ({
      lines: (await response.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { type: string; text?: string }),
      prompts,
    }));
  }

  it("never sees $120 in the reply, even if the model says it", async () => {
    const { lines, prompts } = await chat("Our hourly rate is $120. Want me to price a job for your car?", "What's your hourly labor rate?");
    const reply = lines.find((line) => line.type === "message")?.text ?? "";
    expect(reply).not.toContain(RATE);
    expect(reply).toContain("we don't quote a separate hourly rate");
    expect(reply).toContain("Want me to price a job for your car?");
    // The model wasn't told the rate either.
    expect(prompts.join("")).not.toMatch(RATE_FIGURE);
  });

  it("gets the shop's answer in Traditional Chinese", async () => {
    const { lines } = await chat("我們的時薪是 $120。", "你們每小時工錢多少？");
    const reply = lines.find((line) => line.type === "message")?.text ?? "";
    expect(reply).not.toContain(RATE);
    expect(reply).toContain("不單獨報每小時的價錢");
  });
});
