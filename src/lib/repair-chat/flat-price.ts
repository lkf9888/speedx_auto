/**
 * The shop's posted flat prices for routine services (oil change, tire
 * change, A/C recharge). These come from the shop's own price list, not from
 * the labor guide, so the model never computes them.
 *
 * Vehicles with 8 or more cylinders, or a new price over CAD $120,000, get no
 * flat price: the customer is asked to contact the team for a quote.
 */
import { describeVehicle, type VehicleRef } from "@/lib/worldpac/catalog";

export type FlatService = "oil_change" | "tire_change" | "ac_recharge";
export type VehicleSize = "car" | "small_suv" | "large_suv_or_pickup";
export type Fuel = "gasoline" | "hybrid" | "diesel" | "electric" | "unknown";
export type OilGrade = "standard" | "premium";
export type TireType = "up_to_18" | "over_18" | "run_flat" | "off_road";
export type Refrigerant = "r134a" | "r1234yf";

/** CAD, tax extra. Oil change prices include oil and filter. */
export const FLAT_PRICES = {
  oil: {
    standard: { regular: 95, large: 150 },
    premium: { regular: 120, large: 180 },
    diesel: { car: 280, suv: 320 },
    european: 220,
  },
  tirePerWheel: { up_to_18: 25, over_18: 30, run_flat: 35, off_road: 45 },
  acRecharge: { r134a: 150, r1234yf: 230 },
} as const;

export const FLAT_SERVICES: readonly FlatService[] = ["oil_change", "tire_change", "ac_recharge"];

const EUROPEAN_MAKES = [
  "audi", "bmw", "mercedes-benz", "volkswagen", "porsche", "volvo", "mini", "land rover",
  "jaguar", "fiat", "alfa romeo", "smart", "saab", "maserati", "polestar", "peugeot",
];

/** Makes whose every model sells new above CAD $120,000. */
const PREMIUM_MAKES = [
  "ferrari", "lamborghini", "mclaren", "rolls-royce", "bentley", "aston martin", "bugatti", "maybach",
  "lotus", "pagani", "koenigsegg",
];

/** Models that sell new above CAD $120,000 even though the make doesn't. */
const PREMIUM_MODELS: Array<[string, RegExp]> = [
  ["porsche", /\b(911|taycan|panamera|918|carrera gt)\b|cayenne.*turbo/i],
  ["mercedes-benz", /\b(s[ -]?class|s\d{2,3}|g[ -]?class|g\d{2,3}|amg gt|sls?\d*|eqs|maybach|gls ?(580|600)|cl\d{3})\b/i],
  ["bmw", /\b(7[ -]?series|7\d{2}[a-z]*|i7|8[ -]?series|8\d{2}[a-z]*|m8|m5|xm|x7|i8|alpina)\b/i],
  ["audi", /\b(r8|a8|s8|rs ?[67]|rs ?q8|e-tron gt)\b/i],
  ["land rover", /\brange rover\b(?!.*\b(sport|evoque|velar)\b)/i],
  ["lexus", /\b(lx|lc)\s?\d*/i],
  ["cadillac", /\b(escalade|celestiq)\b/i],
  ["tesla", /\bmodel x\b|\bplaid\b/i],
  ["maserati", /\bmc20\b/i],
  ["lucid", /\bair\b/i],
];

// "35d" etc. is BMW/Mercedes diesel naming (xDrive35d); Tesla "75D" is caught as electric first.
const DIESEL_LABEL = /\b(dsl|diesel|tdi|crdi?|bluetec|ecodiesel|duramax|power ?stroke|cummins)\b|\d{2,3}d\b/i;
const ELECTRIC_LABEL = /\b(electric|ev)\b/i;
const ELECTRIC_MAKES = ["tesla", "polestar", "rivian", "lucid"];

export interface VehicleFacts {
  year: number | null;
  make: string;
  description: string;
  /** From the engine detail, e.g. "5.0 V8" → 8; null when not recorded. */
  cylinders: number | null;
  diesel: boolean;
  electric: boolean;
  european: boolean;
  premium: boolean;
}

export function cylinderCount(engineLabel: string): number | null {
  const match = engineLabel.match(/(?:^|[\s-])[VLHWI](\d{1,2})(?=$|[\s,])/i);
  const count = match ? Number(match[1]) : NaN;
  return Number.isInteger(count) && count > 0 ? count : null;
}

function findMake(label: string): string {
  const lower = label.toLowerCase();
  const known = [...EUROPEAN_MAKES, ...PREMIUM_MAKES, ...PREMIUM_MODELS.map(([make]) => make), ...ELECTRIC_MAKES];
  return known.find((make) => new RegExp(`(^|\\s)${make.replace(/[-]/g, "[- ]?")}(\\s|$)`).test(lower)) ?? "";
}

export function vehicleFacts(vehicle: VehicleRef): VehicleFacts {
  const description = describeVehicle(vehicle);
  const engine = vehicle.attributes.find((a) => a.name === "EngineBase")?.label ?? "";
  const yearMatch = vehicle.label.match(/^(\d{4})\b/);
  const make = findMake(vehicle.label);
  const premiumModel = PREMIUM_MODELS.find(([m]) => m === make)?.[1];
  return {
    year: yearMatch ? Number(yearMatch[1]) : null,
    make,
    description,
    cylinders: cylinderCount(engine),
    diesel: DIESEL_LABEL.test(description),
    electric: ELECTRIC_MAKES.includes(make) || ELECTRIC_LABEL.test(engine),
    european: EUROPEAN_MAKES.includes(make),
    premium: PREMIUM_MAKES.includes(make) || Boolean(premiumModel?.test(description)),
  };
}

export interface FlatRequest {
  service: FlatService;
  size: VehicleSize;
  fuel: Fuel;
  oilGrade: OilGrade | null;
  tireType: TireType | null;
  tireCount: number | null;
  refrigerant: Refrigerant | null;
  /** The model's own judgement that the vehicle sold new above CAD $120,000. */
  premiumClaimed: boolean;
}

export interface FlatOption {
  code: string;
  unitPrice: number;
  quantity: number;
}

export type FlatQuote =
  | { status: "ok"; service: FlatService; size: VehicleSize | null; options: FlatOption[]; perWheel: boolean }
  | { status: "team_quote"; service: FlatService; reason: "eight_cylinders" | "premium" }
  | { status: "not_applicable"; reason: string };

/** A/C systems switched from R-134a to R-1234yf between roughly 2013 and 2021. */
export function likelyRefrigerants(year: number | null): Refrigerant[] {
  if (year !== null && year <= 2012) return ["r134a"];
  if (year !== null && year >= 2021) return ["r1234yf"];
  return ["r134a", "r1234yf"];
}

export function quoteFlatService(facts: VehicleFacts, request: FlatRequest): FlatQuote {
  if ((facts.cylinders ?? 0) >= 8) {
    return { status: "team_quote", service: request.service, reason: "eight_cylinders" };
  }
  if (facts.premium || request.premiumClaimed) {
    return { status: "team_quote", service: request.service, reason: "premium" };
  }
  const one = (code: string, unitPrice: number): FlatOption => ({ code, unitPrice, quantity: 1 });

  if (request.service === "oil_change") {
    const electric = facts.electric || request.fuel === "electric";
    if (electric) return { status: "not_applicable", reason: "Electric vehicles have no engine oil to change." };
    if (facts.diesel || request.fuel === "diesel") {
      const suv = request.size !== "car";
      return {
        status: "ok",
        service: "oil_change",
        size: request.size,
        perWheel: false,
        options: [one(suv ? "oil_diesel_suv" : "oil_diesel_car", suv ? FLAT_PRICES.oil.diesel.suv : FLAT_PRICES.oil.diesel.car)],
      };
    }
    if (facts.european) {
      return { status: "ok", service: "oil_change", size: null, perWheel: false, options: [one("oil_european", FLAT_PRICES.oil.european)] };
    }
    const tier = request.size === "large_suv_or_pickup" ? "large" : "regular";
    const grades: OilGrade[] = request.oilGrade ? [request.oilGrade] : ["standard", "premium"];
    return {
      status: "ok",
      service: "oil_change",
      size: request.size,
      perWheel: false,
      options: grades.map((grade) => one(`oil_${grade}`, FLAT_PRICES.oil[grade][tier])),
    };
  }

  if (request.service === "tire_change") {
    const count = request.tireCount && request.tireCount >= 1 && request.tireCount <= 6 ? request.tireCount : 4;
    const types: TireType[] = request.tireType ? [request.tireType] : ["up_to_18", "over_18", "run_flat", "off_road"];
    return {
      status: "ok",
      service: "tire_change",
      size: null,
      perWheel: true,
      options: types.map((type) => ({ code: `tire_${type}`, unitPrice: FLAT_PRICES.tirePerWheel[type], quantity: count })),
    };
  }

  const refrigerants = request.refrigerant ? [request.refrigerant] : likelyRefrigerants(facts.year);
  return {
    status: "ok",
    service: "ac_recharge",
    size: null,
    perWheel: false,
    options: refrigerants.map((r) => one(`ac_${r}`, FLAT_PRICES.acRecharge[r])),
  };
}

// ------------------------------------------------------------------- wording

type Locale = "en" | "zh-CN" | "zh-TW";

const WORDS: Record<Locale, Record<string, string>> = {
  en: {
    oil_change: "Oil change",
    tire_change: "Tire change",
    ac_recharge: "A/C refrigerant recharge",
    car: "Car / small SUV",
    small_suv: "Car / small SUV",
    large_suv_or_pickup: "Large SUV / pickup",
    oil_standard: "Regular oil 0W-20",
    oil_premium: "Premium oil 0W-30",
    oil_diesel_car: "OEM oil (diesel car)",
    oil_diesel_suv: "OEM oil (diesel SUV / truck)",
    oil_european: "OEM oil (European vehicle)",
    tire_up_to_18: "All-season / winter, up to 18\"",
    tire_over_18: "All-season / winter, over 18\"",
    tire_run_flat: "Run-flat",
    tire_off_road: "AT / RT / MT, any size",
    ac_r134a: "R-134a (older systems)",
    ac_r1234yf: "R-1234yf (newer systems)",
    oil_note: "Flat price including oil and filter.",
    tire_note: "Priced per tire for the tire change; buying the tires is extra.",
    ac_note: "Flat price. The refrigerant type is confirmed from the label under the hood.",
    tires_new: "New tires, installed",
    tires_note: "Price per tire includes installation. Stock and delivery time are confirmed by the shop.",
    tire_in_stock: "in stock",
    tire_ships_soon: "about 1–3 days to arrive",
    tire_studded: "studded",
    min_labor: "Minimum labor charge (order under 0.5 h)",
  },
  "zh-CN": {
    oil_change: "换机油",
    tire_change: "换胎",
    ac_recharge: "空调加雪种（冷媒）",
    car: "普通轿车 / 小 SUV",
    small_suv: "普通轿车 / 小 SUV",
    large_suv_or_pickup: "大型 SUV / 皮卡",
    oil_standard: "普通机油 0W-20",
    oil_premium: "高级机油 0W-30",
    oil_diesel_car: "原厂机油（柴油轿车）",
    oil_diesel_suv: "原厂机油（柴油 SUV / 皮卡）",
    oil_european: "原厂机油（欧洲车）",
    tire_up_to_18: "四季胎 / 雪胎，18 寸及以下",
    tire_over_18: "四季胎 / 雪胎，18 寸以上",
    tire_run_flat: "防爆胎",
    tire_off_road: "AT / RT / MT 越野胎，任何尺寸",
    ac_r134a: "旧雪种 R-134a",
    ac_r1234yf: "新雪种 R-1234yf",
    oil_note: "一口价，含机油和机油滤芯。",
    tire_note: "换胎工钱按条计价，轮胎购买费用另计。",
    ac_note: "一口价。雪种类型以发动机舱内的标签为准。",
    tires_new: "新轮胎（含安装）",
    tires_note: "每条价格已含安装。库存和到货时间以店里确认为准。",
    tire_in_stock: "现货",
    tire_ships_soon: "需调货，约 1–3 天",
    tire_studded: "带钉",
    min_labor: "最低工时补足（整单不足 0.5 小时）",
  },
  "zh-TW": {
    oil_change: "換機油",
    tire_change: "換胎",
    ac_recharge: "冷氣加雪種（冷媒）",
    car: "一般轎車 / 小 SUV",
    small_suv: "一般轎車 / 小 SUV",
    large_suv_or_pickup: "大型 SUV / 皮卡",
    oil_standard: "普通機油 0W-20",
    oil_premium: "高級機油 0W-30",
    oil_diesel_car: "原廠機油（柴油轎車）",
    oil_diesel_suv: "原廠機油（柴油 SUV / 皮卡）",
    oil_european: "原廠機油（歐洲車）",
    tire_up_to_18: "四季胎 / 雪胎，18 吋及以下",
    tire_over_18: "四季胎 / 雪胎，18 吋以上",
    tire_run_flat: "防爆胎",
    tire_off_road: "AT / RT / MT 越野胎，任何尺寸",
    ac_r134a: "舊雪種 R-134a",
    ac_r1234yf: "新雪種 R-1234yf",
    oil_note: "一口價，含機油和機油濾芯。",
    tire_note: "換胎工錢按條計價，輪胎購買費用另計。",
    ac_note: "一口價。雪種類型以引擎室內的標籤為準。",
    tires_new: "新輪胎（含安裝）",
    tires_note: "每條價格已含安裝。庫存和到貨時間以店裡確認為準。",
    tire_in_stock: "現貨",
    tire_ships_soon: "需調貨，約 1–3 天",
    tire_studded: "帶釘",
    min_labor: "最低工時補足（整單不足 0.5 小時）",
  },
};

export function flatWord(locale: string, key: string): string {
  const words = WORDS[(locale in WORDS ? locale : "en") as Locale];
  return words[key] ?? WORDS.en[key] ?? key;
}

/** English names for the model and the shop's email. */
export function flatWordEn(key: string): string {
  return WORDS.en[key] ?? key;
}

/** The English wording for a phrase from the Chinese tables, e.g. "换机油" → "Oil change"; null when it isn't one. */
export function englishFlatWord(text: string): string | null {
  const wanted = text.trim();
  for (const locale of ["zh-CN", "zh-TW"] as const) {
    const key = Object.keys(WORDS[locale]).find((k) => WORDS[locale][k] === wanted);
    if (key) return WORDS.en[key] ?? null;
  }
  return null;
}
