/**
 * Reads Wheel Mart Canada's tire inventory page (wheelmartcanada.ca, a local
 * wholesaler of value tire brands; server-rendered Yii grid). Each row has a
 * size code, SKU, a free-text description, the dealer cost (hidden behind
 * the "..." toggle), the site's suggested price, stock on hand and remarks.
 *
 * Descriptions are typed by hand and messy ("LANVIGTOR", "ALL SEAOSN",
 * "LT265/70R17 121/118S - 10PR …"), so brand, season, size and load are
 * worked out here; a row whose brand or season can't be read is kept for
 * staff but never quoted to customers.
 */
import { sizeKey, type TireSeason } from "@/lib/repair-chat/tires";

export interface WheelmartTire {
  /** Wheel Mart's size code, e.g. "2256517102777". */
  code: string;
  sku: string;
  /** The description exactly as listed, e.g. "225/65R17 102H GROUND SPEED VOYAGER 777 EV ALL SEASON". */
  description: string;
  /** Brand name when recognised, else "". */
  brand: string;
  /** Model / tread pattern: the description without size, load, brand, ply and season words. */
  pattern: string;
  /** Sidewall size as written, e.g. "LT265/70R17", "" when none was found. */
  size: string;
  /** Load index and speed rating, e.g. "106V XL", "121/118S". */
  load: string;
  season: TireSeason | null;
  /** Dealer cost per tire, CAD. */
  cost: number | null;
  /** The site's "Price suggested", CAD. */
  suggested: number | null;
  /** Stock on hand ("20+" → 20); can be negative (oversold). */
  onHand: number;
  onHandText: string;
  remarks: string;
}

export interface WheelmartPage {
  total: number | null;
  tires: WheelmartTire[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function text(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
      if (ENTITIES[name.toLowerCase()]) return ENTITIES[name.toLowerCase()];
      if (name.startsWith("#x")) return String.fromCharCode(parseInt(name.slice(2), 16));
      if (name.startsWith("#")) return String.fromCharCode(Number(name.slice(1)));
      return whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function money(value: string): number | null {
  const match = value.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

/** Brands Wheel Mart carries, with the misspellings its listings use. */
const BRANDS: Array<[string, RegExp]> = [
  ["Lanvigator", /\b(?:LANVIGATOR|LANVIGTOR|LAVIGATOR|ALNVIGATOR|LANVIGATROR)\b/i],
  ["Delinte", /\bDEL(?:INTE?|TINE)\b|(?<=XL)DELINTE\b/i],
  ["Ground Speed", /\bG(?:R)?OUND ?SPEED\b/i],
  ["Sonix", /\bSONIX\b/i],
  ["Powertrac", /\bPOWERTRAC\b/i],
  ["Powerhub", /\bPOWERHUB\b/i],
  ["Landsail", /\bLANDSAIL\b/i],
  ["Roadmarch", /\bROADMARCH\b/i],
  ["iLink", /\bILINK\b/i],
  ["Rockblade", /\bROCKBLADE\b/i],
  ["Compasal", /\bCOMPASAL\b/i],
  ["Gripmax", /\bGRIPMAX\b/i],
  ["Royal Black", /\bROYAL ?BLACK\b/i],
  ["Formoza", /\bFORMOZA\b/i],
  ["Centara", /\bCENTARA\b/i],
  ["Greentrac", /\bGREENTRAC\b/i],
  ["Duraturn", /\bDURATURN\b/i],
  ["Headway", /\bHEADWAY\b/i],
  ["Uniglory", /\bUNIGLORY\b/i],
  ["Anxiang", /\bANXIANG\b/i],
  ["Antares", /\bANTARES\b/i],
  ["Marswil", /\bMARSWIL\b/i],
  ["Fronway", /\bF?RONWAY\b|\bFRONWING\b/i],
  ["Gladiator", /\bGLADIATOR\b/i],
  ["Lexani", /\bLEXANI\b/i],
];

/** Season from the description; winter and off-road words win over "ALL SEASON" ("CATCHFORS M/T ALL SEASON"). */
function seasonOf(description: string, size: string): TireSeason | null {
  const d = description.toUpperCase();
  if (/^ST\d/.test(size.toUpperCase())) return "trailer";
  if (/SNOW|SONW|WINTER|\bX-?ICE\b|ICE-SPIDER/.test(d)) return "winter";
  if (/\b[AMR]\/T\b|-[AMR]\/T\b|ALL TERRAIN|MUD TERRAIN|RUGGED TERRAIN|\bAT\d?W?\b/.test(d)) return "off_road";
  if (/ALL WEATHER/.test(d)) return "all_weather";
  if (/NO M\+S/.test(d)) return null;
  if (/ALL SEA(?:SON|SO|OSN)|\bA\/S\b|\bH\/T\b|\bUHP\b/.test(d)) return "all_season";
  return null;
}

const SIZE = /\b(?:LT|P|ST)?\s*(?:\d{3}\s*\/\/?\s*\d{2}\s*Z?R\s*F?\d{2}|\d{2}\s*X\s*\d{1,2}(?:\.\d{1,2})?\s*R\s*\d{2})(?:\s*(?:LT|C)\b)?/i;
const LOAD = /(?<![\d/])(\d{2,3}(?:\/\d{2,3})?)\s?([HJKLMNPQRSTUVWYZ])(?:\s?(XL|SL|STD))?(?![A-Z\d])/i;
/** "117XL" with no speed rating: the load index alone. */
const LOAD_ONLY = /(?<![\d/])(\d{2,3})\s?XL/i;

function cleanPattern(rest: string, brandPattern: RegExp | null): string {
  let p = rest;
  if (brandPattern) p = p.replace(new RegExp(brandPattern.source, "gi"), " ");
  return p
    .replace(/\(?NO M\+S\)?|\bM\+S\b/gi, " ")
    .replace(/-?\s*\d{1,2}\s*(?:PR|PLY)\b/gi, " ")
    .replace(/\b(?:XL|SL|STD|LT)\b/g, " ")
    .replace(/ALL SEA(?:SON|SO|OSN)\b|ALL WEATHER|\bSNOW\b|\bWINTER\b/gi, " ")
    .replace(/\s+-\s+|^\s*-\s*|\s*-\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Brand, pattern, size, load and season from a free-text description. */
export function readDescription(description: string): Pick<WheelmartTire, "brand" | "pattern" | "size" | "load" | "season"> {
  const sizeMatch = description.match(SIZE);
  const size = sizeMatch ? sizeMatch[0].replace(/\s+/g, "").replace("//", "/").toUpperCase() : "";
  let rest = sizeMatch ? description.replace(sizeMatch[0], " ") : description;
  const loadMatch = rest.match(LOAD);
  const loadOnly = loadMatch ? null : rest.match(LOAD_ONLY);
  const load = loadMatch
    ? [loadMatch[1] + loadMatch[2].toUpperCase(), loadMatch[3]?.toUpperCase() === "XL" ? "XL" : ""].filter(Boolean).join(" ")
    : loadOnly
      ? `${loadOnly[1]} XL`
      : "";
  if (loadMatch ?? loadOnly) rest = rest.replace((loadMatch ?? loadOnly)![0], " ");
  const found = BRANDS.find(([, pattern]) => pattern.test(description));
  return {
    brand: found?.[0] ?? "",
    pattern: cleanPattern(rest, found?.[1] ?? null),
    size,
    load,
    season: seasonOf(description, size),
  };
}

function stock(value: string): number {
  const n = parseInt(value.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseRow(row: string): WheelmartTire | null {
  const cells = row.split(/<td\b[^>]*>/i).slice(1);
  if (cells.length < 7) return null;
  const descriptionCell = cells[3];
  const description = text(descriptionCell.replace(/<span[^>]*class="[^"]*(?:price-toggle|product-price)[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ""));
  // Rim and hardware rows sometimes appear in the tire list.
  if (!description || /\bWHEEL\b/i.test(description)) return null;
  const read = readDescription(description);
  if (!read.size || !sizeKey(read.size)) return null;
  const onHandText = text(cells[5]);
  return {
    code: text(cells[1]),
    sku: text(cells[2]),
    description,
    ...read,
    cost: money(text(descriptionCell.match(/class="[^"]*product-price[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1])),
    suggested: money(text(cells[4])),
    onHand: stock(onHandText),
    onHandText,
    remarks: text(cells[6]),
  };
}

export function parseWheelmartPage(html: string): WheelmartPage {
  const total = text(html.match(/class="summary"[^>]*>([\s\S]*?)<\/div>/)?.[1]).match(/of\s+([\d,]+)\s+item/i);
  const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const rows = body.split(/<tr\b[^>]*>/i).slice(1);
  return {
    total: total ? Number(total[1].replace(/,/g, "")) : null,
    tires: rows.map(parseRow).filter((t): t is WheelmartTire => t !== null),
  };
}

/** True when the page is Wheel Mart's sign-in form (the session has expired). */
export function isWheelmartLoginPage(html: string): boolean {
  return /id="login-form"/.test(html) && /LoginForm\[password\]/.test(html);
}

/** The search box takes digits only: "225/65R17" → "2256517", "33x12.50R17" → "33125017". */
export function searchDigits(size: string): string | null {
  const key = sizeKey(size);
  if (!key) return null;
  return key.key.replace(/[^\d]/g, "");
}
