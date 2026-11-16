/**
 * The shop's posted flat prices, with nothing imported, so browser code (the
 * workbench's rules panel) can read them without pulling in the catalog.
 */
export type FlatService = "oil_change" | "tire_change" | "ac_recharge" | "inspection" | "tire_repair";

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
  /** Quick vehicle inspection; waived when the owner has the repair done at the shop (Kevin, 2026-11-16). */
  inspection: 80,
  /** Tire puncture repair (patch), per tire; AT tires cost more. */
  tirePatch: { standard: 20, at: 30 },
} as const;


/**
 * Every posted flat price as a named slot, so the owner can change one from
 * the workbench ("直接改一口价"). Tire changes are per tire.
 */
export const FLAT_PRICE_SLOTS = {
  oil_standard_regular: { service: "oil_change", zh: "换机油 · 普通机油 0W-20 · 轿车/小中型 SUV", price: FLAT_PRICES.oil.standard.regular },
  oil_standard_large: { service: "oil_change", zh: "换机油 · 普通机油 0W-20 · 大型 SUV/皮卡", price: FLAT_PRICES.oil.standard.large },
  oil_premium_regular: { service: "oil_change", zh: "换机油 · 高级机油 0W-30 · 轿车/小中型 SUV", price: FLAT_PRICES.oil.premium.regular },
  oil_premium_large: { service: "oil_change", zh: "换机油 · 高级机油 0W-30 · 大型 SUV/皮卡", price: FLAT_PRICES.oil.premium.large },
  oil_diesel_car: { service: "oil_change", zh: "换机油 · 柴油车 · 轿车", price: FLAT_PRICES.oil.diesel.car },
  oil_diesel_suv: { service: "oil_change", zh: "换机油 · 柴油车 · SUV/皮卡", price: FLAT_PRICES.oil.diesel.suv },
  oil_european: { service: "oil_change", zh: "换机油 · 欧洲车（原厂机油）", price: FLAT_PRICES.oil.european },
  tire_up_to_18: { service: "tire_change", zh: "换胎 · 18 寸及以下（每条）", price: FLAT_PRICES.tirePerWheel.up_to_18 },
  tire_over_18: { service: "tire_change", zh: "换胎 · 18 寸以上（每条）", price: FLAT_PRICES.tirePerWheel.over_18 },
  tire_run_flat: { service: "tire_change", zh: "换胎 · 防爆胎（每条）", price: FLAT_PRICES.tirePerWheel.run_flat },
  tire_off_road: { service: "tire_change", zh: "换胎 · 越野胎 AT/MT/RT（每条）", price: FLAT_PRICES.tirePerWheel.off_road },
  ac_r134a: { service: "ac_recharge", zh: "空调加雪种 · R134a", price: FLAT_PRICES.acRecharge.r134a },
  ac_r1234yf: { service: "ac_recharge", zh: "空调加雪种 · R1234yf", price: FLAT_PRICES.acRecharge.r1234yf },
  inspection_quick: { service: "inspection", zh: "车辆快速检查（在店维修则免）", price: FLAT_PRICES.inspection },
  tire_patch_standard: { service: "tire_repair", zh: "补胎 · 普通胎（每条）", price: FLAT_PRICES.tirePatch.standard },
  tire_patch_at: { service: "tire_repair", zh: "补胎 · AT 胎（每条）", price: FLAT_PRICES.tirePatch.at },
} as const satisfies Record<string, { service: FlatService; zh: string; price: number }>;

export type FlatPriceSlot = keyof typeof FLAT_PRICE_SLOTS;
export const FLAT_PRICE_SLOT_KEYS = Object.keys(FLAT_PRICE_SLOTS) as FlatPriceSlot[];
