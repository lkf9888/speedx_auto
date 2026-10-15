/**
 * Safety recalls by year, make and model from Transport Canada's Vehicle
 * Recalls Database (free API, Open Government Licence – Canada), the
 * authority for cars sold here. NHTSA's US list is used only when Canada has
 * nothing under that name (US numbers and coverage can differ).
 *
 * Neither source can say whether one particular car is affected or already
 * fixed: that is checked by VIN on the maker's site or at a dealer.
 */
import { TtlCache } from "@/lib/worldpac/cache";

const TC = "https://data.tc.gc.ca/v1.3/api/eng/vehicle-recall-database";
const NHTSA = "https://api.nhtsa.gov/recalls/recallsByVehicle";
const TIMEOUT_MS = 10_000;
const MAX_RECALLS = 10;
const TEXT_LIMIT = 320;

export interface Recall {
  source: "Transport Canada" | "NHTSA";
  number: string;
  /** YYYY-MM-DD */
  date: string;
  system: string;
  issue: string;
  risk: string;
  remedy: string;
}

export interface RecallResult {
  source: "Transport Canada" | "NHTSA" | null;
  /** The model name the source matched, e.g. "CR-V" or "GLC CLASS". */
  models: string[];
  total: number;
  recalls: Recall[];
}

type Field = { Name: string; Value: { Literal: string } };
type Row = Field[];

const field = (row: Row, name: string) => row.find((f) => f.Name === name)?.Value.Literal ?? "";

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > TEXT_LIMIT ? `${clean.slice(0, TEXT_LIMIT - 1)}…` : clean;
}

/** "1/17/2020 12:00:00 AM" → "2020-01-17" */
function tcDate(value: string): string {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : value.slice(0, 10);
}

/** "28/05/2020" → "2020-05-28" */
function nhtsaDate(value: string): string {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : value;
}

/** Transport Canada's comment has "Issue:", "Safety Risk:" and "Corrective Actions:" parts. */
export function splitTcComment(comment: string): Pick<Recall, "issue" | "risk" | "remedy"> {
  const part = (label: RegExp) => comment.match(label)?.[1] ?? "";
  const issue = part(/Issue:\s*([\s\S]*?)(?=Safety Risk:|Corrective Actions?:|$)/i);
  return {
    issue: clip(issue || comment),
    risk: clip(part(/Safety Risk:\s*([\s\S]*?)(?=Corrective Actions?:|$)/i)),
    remedy: clip(part(/Corrective Actions?:\s*([\s\S]*)$/i)),
  };
}

/**
 * Names to try, most likely first: the model as given, then without or with a
 * hyphen ("CRV" → "CR-V", "F150" → "F-150"), then its letters ("GLC300" → "GLC")
 * and its first word ("Silverado 1500" → "Silverado").
 */
export function modelNames(model: string): string[] {
  const m = model.trim().toLowerCase().replace(/\s+/g, " ");
  const names = [
    m,
    m.replace(/-/g, ""),
    m.replace(/^([a-z]+)(\d+)$/, "$1-$2"),
    m.replace(/^([a-z]{2})([a-z])$/, "$1-$2"),
    m.match(/^[a-z]+(?=\d)/)?.[0] ?? "",
    m.split(" ")[0],
  ];
  return [...new Set(names.filter((n) => n.length >= 2))].slice(0, 4);
}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return (await response.json()) as T;
}

async function canada(year: number, make: string, model: string, fetchImpl: typeof fetch): Promise<RecallResult | null> {
  for (const name of modelNames(model)) {
    const path = `/recall/make-name/${encodeURIComponent(make.toLowerCase())}/model-name/${encodeURIComponent(name)}/year-range/${year}-${year}?format=json`;
    const list = await getJson<{ ResultSet?: Row[] }>(`${TC}${path}`, fetchImpl);
    const rows = list.ResultSet ?? [];
    if (rows.length === 0) continue;
    const byNumber = new Map<string, { number: string; date: string; model: string }>();
    for (const row of rows) {
      const number = field(row, "Recall number");
      if (number && !byNumber.has(number)) byNumber.set(number, { number, date: tcDate(field(row, "Recall date")), model: field(row, "Model name") });
    }
    const newest = [...byNumber.values()].sort((a, b) => b.date.localeCompare(a.date));
    const recalls = await Promise.all(
      newest.slice(0, MAX_RECALLS).map(async ({ number, date }): Promise<Recall> => {
        const summary = await getJson<{ ResultSet?: Row[] }>(`${TC}/recall-summary/recall-number/${number}?format=json`, fetchImpl).catch(() => ({ ResultSet: [] as Row[] }));
        const row = summary.ResultSet?.[0] ?? [];
        return { source: "Transport Canada", number, date, system: field(row, "SYSTEM_TYPE_ETXT"), ...splitTcComment(field(row, "COMMENT_ETXT")) };
      }),
    );
    return { source: "Transport Canada", models: [...new Set(newest.map((r) => r.model))], total: newest.length, recalls };
  }
  return null;
}

interface NhtsaRecall {
  NHTSACampaignNumber?: string;
  ReportReceivedDate?: string;
  Component?: string;
  Summary?: string;
  Consequence?: string;
  Remedy?: string;
  Model?: string;
}

async function unitedStates(year: number, make: string, model: string, fetchImpl: typeof fetch): Promise<RecallResult | null> {
  for (const name of modelNames(model).slice(0, 2)) {
    const url = `${NHTSA}?${new URLSearchParams({ make, model: name, modelYear: String(year) })}`;
    const data = await getJson<{ results?: NhtsaRecall[] }>(url, fetchImpl);
    const rows = (data.results ?? []).filter((r) => r.NHTSACampaignNumber);
    if (rows.length === 0) continue;
    const recalls = rows
      .map((r): Recall => ({
        source: "NHTSA",
        number: r.NHTSACampaignNumber!,
        date: nhtsaDate(r.ReportReceivedDate ?? ""),
        system: r.Component ?? "",
        issue: clip(r.Summary ?? ""),
        risk: clip(r.Consequence ?? ""),
        remedy: clip(r.Remedy ?? ""),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return { source: "NHTSA", models: [...new Set(rows.map((r) => r.Model ?? name))], total: recalls.length, recalls: recalls.slice(0, MAX_RECALLS) };
  }
  return null;
}

const cache = new TtlCache<RecallResult>(24 * 60 * 60 * 1000, 1000);

/** Recalls for one model year; an empty result when neither source lists any. Throws when both are unreachable. */
export async function findRecalls(year: number, make: string, model: string, fetchImpl: typeof fetch = fetch): Promise<RecallResult> {
  const key = [year, make.toLowerCase().trim(), model.toLowerCase().trim()].join("|");
  return cache.getOrLoad(key, async () => {
    let canadaFailed = false;
    const ca = await canada(year, make, model, fetchImpl).catch((error: unknown) => {
      canadaFailed = true;
      console.error("transport canada recalls failed", error instanceof Error ? error.message.slice(0, 160) : "unknown");
      return null;
    });
    if (ca) return ca;
    const us = await unitedStates(year, make, model, fetchImpl).catch((error: unknown) => {
      if (canadaFailed) throw error;
      return null;
    });
    if (us) return us;
    // "No recalls" is only an answer when Canada was actually asked.
    if (canadaFailed) throw new Error("Transport Canada recalls unreachable");
    return { source: null, models: [], total: 0, recalls: [] };
  });
}
