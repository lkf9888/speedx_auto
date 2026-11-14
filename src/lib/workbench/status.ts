/**
 * Which outside sites and services the repair assistant is connected to, and
 * whether each one answers right now: the workbench's "连接状态" panel
 * (Kevin, 2026-11-14).
 *
 * Each check is the lightest real call that proves the login still works
 * (a cached-session search, a model lookup, a key read). Results are kept for
 * five minutes so a page left open doesn't keep hitting the suppliers; staff
 * can force a fresh check, at most once every 15 seconds.
 *
 * ALLDATA isn't here: it is reached through the staff member's own Chrome
 * (the SPEEDX ALLDATA extension), so the panel asks the extension directly.
 */
import { MODEL as PUBLIC_MODEL } from "@/lib/repair-chat/agent";
import { loadTireList } from "@/lib/repair-chat/tires";
import { dtTireConfigured, getDtTireClient } from "@/lib/dt-tire/client";
import { decodeVin } from "@/lib/gov/vpic";
import { getTatoClient, tatoConfigured } from "@/lib/tato/client";
import { getWheelmartClient, wheelmartConfigured } from "@/lib/wheelmart/client";
import { getWorldpacClient } from "@/lib/worldpac/client";
import { WORKBENCH_MODEL } from "./assistant";
import { cloudflareKv } from "./kv";

export type SourceState = "ok" | "down" | "not_configured" | "not_connected";

export interface SourceStatus {
  id: string;
  name: string;
  /** What the assistant uses it for. */
  purpose: string;
  state: SourceState;
  /** A short staff-readable line: what was checked, or why it failed. Never a secret. */
  detail: string;
  latencyMs?: number;
}

export interface StatusReport {
  checkedAt: number;
  sources: SourceStatus[];
}

/** What a check found; throwing means "down" with the error message. */
export type CheckResult = { state: "ok" | "not_configured" | "not_connected"; detail: string };

export interface StatusCheck {
  id: string;
  name: string;
  purpose: string;
  run: () => Promise<CheckResult>;
}

const CHECK_TIMEOUT_MS = 15_000;
const CACHE_MS = 5 * 60_000;
const MIN_REFRESH_MS = 15_000;

const ok = (detail: string): CheckResult => ({ state: "ok", detail });
const notConfigured = (detail = "服务器没有设置账号"): CheckResult => ({ state: "not_configured", detail });

/** An error message staff can read, without anything that looks like a credential. */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/(token|key|password|secret|authorization)\S*\s*[:=]\s*\S+/gi, "$1=…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "未知错误";
}

async function runOne(check: StatusCheck, timeoutMs: number): Promise<SourceStatus> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      check.run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${Math.round(timeoutMs / 1000)} 秒没有回应`)), timeoutMs);
      }),
    ]);
    const latencyMs = Date.now() - started;
    return { id: check.id, name: check.name, purpose: check.purpose, ...result, ...(result.state === "ok" ? { latencyMs } : {}) };
  } catch (error) {
    return { id: check.id, name: check.name, purpose: check.purpose, state: "down", detail: errorText(error), latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export class StatusMonitor {
  private last: StatusReport | null = null;
  private inFlight: Promise<StatusReport> | null = null;

  constructor(
    private readonly checks: () => StatusCheck[],
    private readonly now: () => number = () => Date.now(),
    private readonly timeoutMs = CHECK_TIMEOUT_MS,
  ) {}

  /** The latest report: cached for five minutes; `fresh` re-checks unless the last check is under 15 seconds old. */
  async report(fresh = false): Promise<StatusReport> {
    const age = this.last ? this.now() - this.last.checkedAt : Infinity;
    if (this.last && age < (fresh ? MIN_REFRESH_MS : CACHE_MS)) return this.last;
    this.inFlight ??= Promise.all(this.checks().map((check) => runOne(check, this.timeoutMs)))
      .then((sources) => (this.last = { checkedAt: this.now(), sources }))
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
}

const SAMPLE_TIRE = "225/65R17";
// A widely published sample VIN (2003 Honda Accord), used only to see that vPIC answers.
const SAMPLE_VIN = "1HGCM82633A004352";

async function anthropicModel(model: string, key: string): Promise<void> {
  const response = await fetch(`https://api.anthropic.com/v1/models/${encodeURIComponent(model)}`, {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (response.status === 401) throw new Error("API key 被拒绝");
  if (response.status === 404) throw new Error(`模型 ${model} 不可用`);
  if (!response.ok) throw new Error(`Anthropic 返回 ${response.status}`);
}

/** The live connections, read from the server's environment. */
export function defaultChecks(env: NodeJS.ProcessEnv = process.env): StatusCheck[] {
  return [
    {
      id: "worldpac",
      name: "WorldPac speedDIAL",
      purpose: "零件价格和库存、工时手册",
      run: async () => {
        if (!env.WORLDPAC_USERNAME || !env.WORLDPAC_PASSWORD) return notConfigured();
        const result = await getWorldpacClient().get<{ makes?: unknown[] }>(`vehicle/makesbyyear?id=2020&vehicleGroupID=2`);
        if (!result.makes?.length) throw new Error("登录成功但没有返回车型数据");
        return ok("已登录，车型目录正常");
      },
    },
    {
      id: "dttire",
      name: "DT Tire Hub",
      purpose: "轮胎库存和建议零售价",
      run: async () => {
        if (!dtTireConfigured(env)) return notConfigured();
        const page = await getDtTireClient().searchBySize({ size: SAMPLE_TIRE, season: "ALL" });
        return ok(`已登录，${SAMPLE_TIRE} 查到 ${page.tires.length} 款`);
      },
    },
    {
      id: "wheelmart",
      name: "Wheel Mart Canada",
      purpose: "国产轮胎批发库存和拿货价",
      run: async () => {
        const client = wheelmartConfigured(env) ? getWheelmartClient() : null;
        if (!client) return notConfigured();
        const page = await client.searchBySize(SAMPLE_TIRE);
        return ok(`已登录，${SAMPLE_TIRE} 查到 ${page.tires.length} 款`);
      },
    },
    {
      id: "tires",
      name: "合作轮胎价目表",
      purpose: "店里合作供货商的轮胎拿货价",
      run: async () => {
        const list = loadTireList();
        if (!list) return notConfigured("服务器没有放价目表");
        return ok(`已载入 ${list.length} 条`);
      },
    },
    {
      id: "tato",
      name: "TATO 车队",
      purpose: "自家 Turo 车辆和行程",
      run: async () => {
        const client = tatoConfigured(env) ? getTatoClient() : null;
        if (!client) return notConfigured("服务器没有设置只读令牌");
        await client.ping();
        return ok("只读令牌有效");
      },
    },
    {
      id: "kv",
      name: "Cloudflare KV",
      purpose: "工作台会话和记忆的云端存储",
      run: async () => {
        const kv = cloudflareKv(env);
        if (!kv) return notConfigured("服务器没有设置 KV");
        await kv.get("workbench-memory-v1");
        return ok("读写正常");
      },
    },
    {
      id: "anthropic",
      name: "Anthropic Claude",
      purpose: "AI 回复（网站和工作台）",
      run: async () => {
        const key = env.ANTHROPIC_API_KEY?.trim();
        if (!key) return notConfigured("服务器没有设置 API key");
        const models = [...new Set([PUBLIC_MODEL, WORKBENCH_MODEL])];
        await Promise.all(models.map((model) => anthropicModel(model, key)));
        return ok(`网站 ${PUBLIC_MODEL}，工作台 ${WORKBENCH_MODEL}`);
      },
    },
    {
      id: "vpic",
      name: "NHTSA vPIC",
      purpose: "VIN 解码（政府免费数据）",
      run: async () => {
        const specs = await decodeVin(SAMPLE_VIN);
        if (!specs) throw new Error("没有解出示例 VIN");
        return ok("示例 VIN 解码正常");
      },
    },
    {
      id: "recalls",
      name: "Transport Canada 召回库",
      purpose: "车辆召回（政府免费数据）",
      run: async () => {
        const response = await fetch(
          "https://data.tc.gc.ca/v1.3/api/eng/vehicle-recall-database/recall/make-name/honda/model-name/civic/year-range/2018-2018?format=json",
          { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) },
        );
        if (!response.ok) throw new Error(`Transport Canada 返回 ${response.status}`);
        await response.json();
        return ok("查询正常");
      },
    },
    {
      id: "email",
      name: "线索邮件（SMTP）",
      purpose: "网站留资、回电请求发邮件给店里",
      run: async () => {
        if (!env.SMTP_USER || !env.SMTP_PASS) return notConfigured("服务器没有设置发信邮箱");
        const nodemailer = (await import("nodemailer")).default;
        const port = Number(env.SMTP_PORT || 465);
        const transport = nodemailer.createTransport({
          host: env.SMTP_HOST || "smtp.gmail.com",
          port,
          secure: port === 465,
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
          connectionTimeout: CHECK_TIMEOUT_MS,
        });
        try {
          await transport.verify();
        } finally {
          transport.close();
        }
        return ok("发信邮箱登录正常");
      },
    },
    {
      id: "ebay",
      name: "eBay",
      purpose: "二手和副厂零件",
      run: async () => ({ state: "not_connected", detail: "还没接入：等 eBay 开发者账号批下来" }),
    },
  ];
}

const KEY = Symbol.for("speedx.workbench.status");

/** One monitor per server process. */
export function getStatusMonitor(): StatusMonitor {
  const holder = globalThis as unknown as Record<symbol, StatusMonitor | undefined>;
  return (holder[KEY] ??= new StatusMonitor(() => defaultChecks()));
}
