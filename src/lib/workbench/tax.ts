/**
 * British Columbia sales tax on a quote (Kevin, 2026-11-16): GST 5% and PST 7%
 * on everything the shop charges, parts, labor and fees alike (the same rule
 * the ALLDATA drafts use). Quotes are built before tax; the estimate shows
 * the tax and the total after it.
 */
export const GST_RATE = 0.05;
export const PST_RATE = 0.07;

const cents = (value: number) => Math.round(value * 100) / 100;

export interface Taxed {
  subtotal: number;
  gst: number;
  pst: number;
  total: number;
}

export function taxOn(subtotal: number): Taxed {
  const base = cents(subtotal);
  const gst = cents(base * GST_RATE);
  const pst = cents(base * PST_RATE);
  return { subtotal: base, gst, pst, total: cents(base + gst + pst) };
}
