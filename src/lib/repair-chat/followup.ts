/**
 * Follow-up email to the shop when an estimate-assistant visit ends.
 *
 * The AI summary sees only the conversation and estimates — never the
 * customer's name or phone, which go straight into the email.
 */
import type Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { company } from "@/lib/company";
import type { MessagesClient } from "./agent";
import { fallbackOptions, MODEL } from "./agent";
import type { EstimateCard } from "./pricing";
import { matchScript } from "./script";
import type { ChatSession, FinishReason, FollowUpHandler } from "./session";

export interface OutgoingEmail {
  subject: string;
  text: string;
}

export type Mailer = (email: OutgoingEmail) => Promise<void>;

const LANGUAGE_LABEL: Record<string, string> = { en: "英文", "zh-CN": "简体中文", "zh-TW": "繁体中文" };
const REASON_LABEL: Record<FinishReason, string> = {
  left_page: "客户离开了页面",
  idle: "客户 10 分钟无回应",
  server_restart: "网站服务器重启（部署更新）；客户可能还在对话，如果继续提问会另发一封邮件",
};

const SUMMARY_PROMPT = `You summarise a website chat between a customer and ${company.name}'s online repair assistant for the shop's service advisor, who will phone the customer back. Write in Simplified Chinese using exactly these five labelled lines:
车辆：
问题：
已给估价：
客户关注点：
建议跟进：
Use only facts from the conversation and the estimate list; write 未提及 when something was not discussed. Keep each line to one or two short sentences. Plain text only.`;

const money = (n: number) => `$${n.toFixed(2)}`;

export function estimateLine(card: EstimateCard): string {
  const label = `${card.id} · ${card.vehicle} · ${card.service}${card.position ? `（${card.position}）` : ""}`;
  if (card.kind === "team_quote") return `${label} · 未给价格，请回电给客户报价（${card.partsNote}）`;
  if (card.kind === "flat") {
    const options = card.partOptions.map((p) => `${p.description}${p.quantity > 1 ? ` ×${p.quantity}` : ""} ${money(p.total)}`).join("；");
    return `${label} · 一口价：${options}（未含税）`;
  }
  const range = card.totalLow === card.totalHigh ? money(card.totalLow) : `${money(card.totalLow)}–${money(card.totalHigh)}`;
  return `${card.id} · ${card.vehicle} · ${card.service}${card.position ? `（${card.position}）` : ""} · 工时 ${card.laborHours}h · 合计 ${range}（未含税）`;
}

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** "2026-10-14（周三）11:30" */
export function bookingLabel(booking: { date: string; time: string }): string {
  const day = new Date(`${booking.date}T12:00:00Z`).getUTCDay();
  return `${booking.date}（${WEEKDAY[day]}）${booking.time}`;
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { timeZone: "America/Vancouver", hour12: false });
}

export async function summarizeSession(client: MessagesClient, session: ChatSession): Promise<string> {
  const conversation = session.transcript
    .map((line) => `${line.role === "user" ? "Customer" : "Assistant"}: ${line.text}`)
    .join("\n\n");
  const estimates = session.estimates.map(estimateLine).join("\n") || "(none)";
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SUMMARY_PROMPT,
    messages: [
      {
        role: "user",
        content: `<conversation>\n${conversation}\n</conversation>\n<estimates>\n${estimates}\n</estimates>`,
      },
    ],
    output_config: { effort: "low" },
    ...fallbackOptions(MODEL),
  });
  if (response.stop_reason === "refusal") return "";
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return matchScript(text, "Simplified Chinese");
}

export function composeFollowUpEmail(
  session: ChatSession,
  reason: FinishReason,
  summary: string | null,
): OutgoingEmail {
  const asked = session.transcript.some((line) => line.role === "user");
  const vehicle = session.estimates[0]?.vehicle ?? "";
  const subject = `【网站估价线索】${session.lead?.name ?? ""} ${session.lead?.phone ?? ""}${vehicle ? ` · ${vehicle}` : ""}`;
  const lines = [
    "网站维修估价助手有一位客户需要回访。",
    "",
    `客户姓名：${session.lead?.name ?? "（未留）"}`,
    `客户电话：${session.lead?.phone ?? "（未留）"}`,
    `使用语言：${LANGUAGE_LABEL[session.locale] ?? session.locale}`,
    `开始时间：${localTime(session.startedAt)}`,
    `最后活动：${localTime(session.lastActivityAt)}`,
    `结束原因：${REASON_LABEL[reason]}`,
    ...(session.booking ? [`预约请求：${bookingLabel(session.booking)}（已另发预约邮件，需致电确认）`] : []),
    ...(session.capped
      ? [`使用次数：该 IP 今天第 ${session.opensToday} 次开启估价助手（超过每天 3 次），已自动请客户直接致电，没有调用 AI`]
      : []),
    "",
    "—— 已给出的估价 ——",
    ...(session.estimates.length ? session.estimates.map(estimateLine) : ["（没有生成估价）"]),
    "",
    "—— AI 摘要 ——",
    !asked ? "客户留下了联系方式，但没有提问。建议直接致电了解需求。" : summary || "（摘要生成失败，请直接查看下方对话记录）",
    "",
    "—— 对话记录 ——",
    ...(asked
      ? session.transcript.map((line) => `${line.role === "user" ? "客户" : "助手"}（${localTime(line.at)}）：\n${line.text}\n`)
      : ["（无）"]),
    "",
    "估价按工时 $120/小时 + 零件标价计算；换机油、换胎、空调加雪种按店里一口价。仅供参考，不是正式报价。",
  ];
  return { subject, text: lines.join("\n") };
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const to = env.LEAD_EMAIL_TO || company.email;
  if (!user || !pass) {
    return async (email) => {
      console.info("repair-followup (SMTP not configured)", JSON.stringify(email));
    };
  }
  const port = Number(env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return async (email) => {
    await transport.sendMail({
      from: env.LEAD_EMAIL_FROM || `${company.name} Website <${user}>`,
      to,
      subject: email.subject,
      text: email.text,
    });
  };
}

export function createFollowUpHandler(client: () => MessagesClient | null, mailer: Mailer): FollowUpHandler {
  return async (session, reason) => {
    // No name or phone: nobody to call back, so no email (and no summary call).
    if (!session.lead) {
      console.info("repair-followup skipped: visitor left no contact details", session.transcript.length, "lines");
      return;
    }
    let summary: string | null = null;
    const api = client();
    if (api && session.transcript.some((line) => line.role === "user")) {
      try {
        summary = await summarizeSession(api, session);
      } catch (error) {
        console.error("repair-followup summary failed", (error as Error).name, (error as Error).message?.slice(0, 500));
      }
    }
    const email = composeFollowUpEmail(session, reason, summary);
    try {
      await mailer(email);
    } catch (error) {
      // Never lose the lead: keep the full email in the log if sending fails.
      console.error("repair-followup email failed", (error as Error).message, JSON.stringify(email));
    }
  };
}

/** Email to the shop when a visitor requests an appointment from the booking card. */
export function composeBookingEmail(
  lead: { name: string; phone: string },
  locale: string,
  booking: { date: string; time: string },
  session: ChatSession | undefined,
): OutgoingEmail {
  const estimates = session?.estimates ?? [];
  const vehicle = estimates[0]?.vehicle ?? "";
  return {
    subject: `【网站预约请求】${lead.name} ${lead.phone} · ${bookingLabel(booking)}${vehicle ? ` · ${vehicle}` : ""}`,
    text: [
      "网站维修估价助手收到一个预约请求，请致电或 WhatsApp 跟客户确认。",
      "",
      `客户姓名：${lead.name}`,
      `客户电话：${lead.phone}`,
      `使用语言：${LANGUAGE_LABEL[locale] ?? locale}`,
      `希望到店：${bookingLabel(booking)}`,
      "",
      "—— 已给出的估价 ——",
      ...(estimates.length ? estimates.map(estimateLine) : ["（没有记录到估价）"]),
      "",
      "完整对话和 AI 摘要会在客户离开页面后另发一封跟进邮件。",
    ].join("\n"),
  };
}
