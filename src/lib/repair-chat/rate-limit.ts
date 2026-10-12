/**
 * In-memory limits for the public chat endpoint. The site runs as a single
 * Render instance, so process memory is a sufficient store; a restart simply
 * resets the counters. These protect both the API bill and the WorldPac
 * account from being driven by scripted traffic.
 */
export interface RateLimits {
  perIpWindowMs: number;
  perIpWindowMax: number;
  perIpDailyMax: number;
  globalDailyMax: number;
}

export const DEFAULT_LIMITS: RateLimits = {
  perIpWindowMs: 10 * 60 * 1000,
  perIpWindowMax: 15,
  perIpDailyMax: 60,
  globalDailyMax: 1500,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private globalDay = 0;
  private globalCount = 0;

  constructor(private readonly limits: RateLimits = DEFAULT_LIMITS) {}

  /** Returns null when allowed, or the reason the request is refused. */
  check(ip: string, now = Date.now()): "ip" | "global" | null {
    const day = Math.floor(now / DAY_MS);
    if (day !== this.globalDay) {
      this.globalDay = day;
      this.globalCount = 0;
    }
    if (this.globalCount >= this.limits.globalDailyMax) return "global";

    const recent = (this.hits.get(ip) ?? []).filter((t) => now - t < DAY_MS);
    const inWindow = recent.filter((t) => now - t < this.limits.perIpWindowMs).length;
    if (inWindow >= this.limits.perIpWindowMax || recent.length >= this.limits.perIpDailyMax) {
      this.hits.set(ip, recent);
      return "ip";
    }
    recent.push(now);
    this.hits.set(ip, recent);
    this.globalCount += 1;
    if (this.hits.size > 5000) this.prune(now);
    return null;
  }

  private prune(now: number): void {
    for (const [ip, times] of this.hits) {
      if (times.every((t) => now - t >= DAY_MS)) this.hits.delete(ip);
    }
  }
}
