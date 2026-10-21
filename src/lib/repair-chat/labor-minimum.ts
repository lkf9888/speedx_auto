/** The shop charges at least this much labor per order (all the jobs quoted together), not per job. Safe for the browser. */
export const MIN_LABOR_HOURS = 0.5;

/** Hours to add so an order's labor reaches the minimum; 0 when it already does or has no labor. */
export function laborShortfall(jobHours: number[]): number {
  const total = jobHours.reduce((sum, h) => sum + (h > 0 ? h : 0), 0);
  return total > 0 && total < MIN_LABOR_HOURS ? Math.round((MIN_LABOR_HOURS - total) * 100) / 100 : 0;
}
