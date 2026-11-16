/**
 * British Columbia sales tax on a quote (Kevin, 2026-11-16): GST 5% and PST 7%
 * on everything the shop charges, parts, labor and fees alike (the same rule
 * the ALLDATA drafts use). Quotes are built before tax; the estimate shows
 * the tax and the total after it.
 */
export const GST_RATE = 0.05;
export const PST_RATE = 0.07;


export interface Taxed {
  subtotal: number;
  gst: number;
  pst: number;
  total: number;
}

export function taxOn(subtotal: number): Taxed {
  // Whole cents, so half-cent amounts round up the way a till does (42.30 × 5% is $2.115, $2.12).
  const base = Math.round(subtotal * 100);
  const gst = Math.round((base * 5) / 100);
  const pst = Math.round((base * 7) / 100);
  return { subtotal: base / 100, gst: gst / 100, pst: pst / 100, total: (base + gst + pst) / 100 };
}
