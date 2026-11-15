/**
 * Server side of follow-up offers: who unsubscribed, the unsubscribe links,
 * and the mailbox the emails go out from (FOLLOWUP_SMTP_USER / _PASS, a Gmail
 * app password the owner sets in Railway). Unsubscribe links carry a random
 * token, never the email address; opt-outs are kept as a hash of the address.
 */
import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { cloudflareKv, type KvClient } from "./kv";

const OPTOUT = "followup-optout-v1:";
const UNSUB = "followup-unsub-v1:";
/** Unsubscribe links keep working for a year. */
const UNSUB_TTL = 365 * 24 * 3600;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

export const isUnsubscribeToken = (token: unknown): token is string => typeof token === "string" && TOKEN.test(token);

export class FollowUpStore {
  constructor(private readonly kv: KvClient) {}

  async isOptedOut(email: string): Promise<boolean> {
    return (await this.kv.get(OPTOUT + emailHash(email))) !== null;
  }

  /** A new unsubscribe token for one email address. */
  async unsubscribeToken(email: string): Promise<string> {
    const token = randomBytes(16).toString("base64url");
    await this.kv.put(UNSUB + token, emailHash(email), { ttlSeconds: UNSUB_TTL });
    return token;
  }

  /** Stops follow-up emails to the address behind the token; false for an unknown token. */
  async unsubscribe(token: string): Promise<boolean> {
    if (!isUnsubscribeToken(token)) return false;
    const hash = await this.kv.get(UNSUB + token);
    if (!hash) return false;
    await this.kv.put(OPTOUT + hash, new Date().toISOString());
    return true;
  }
}

let shared: FollowUpStore | null | undefined;

export function getFollowUpStore(): FollowUpStore | null {
  if (shared === undefined) {
    const kv = cloudflareKv();
    shared = kv ? new FollowUpStore(kv) : null;
  }
  return shared;
}

export interface FollowUpMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

export type FollowUpMailer = (mail: FollowUpMail) => Promise<void>;

/** The repair mailbox (speedxautocar@gmail.com by Kevin's choice), or null until its app password is set. */
export function followUpMailer(env: NodeJS.ProcessEnv = process.env): FollowUpMailer | null {
  const user = env.FOLLOWUP_SMTP_USER?.trim();
  const pass = env.FOLLOWUP_SMTP_PASS?.trim();
  if (!user || !pass) return null;
  const transport = nodemailer.createTransport({
    host: env.FOLLOWUP_SMTP_HOST || "smtp.gmail.com",
    port: Number(env.FOLLOWUP_SMTP_PORT || 465),
    secure: Number(env.FOLLOWUP_SMTP_PORT || 465) === 465,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  const from = `${env.FOLLOWUP_FROM_NAME || "SPEEDX AUTO 维修"} <${user}>`;
  return async (mail) => {
    await transport.sendMail({
      from,
      replyTo: user,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: {
        "List-Unsubscribe": `<${mail.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  };
}
