/**
 * Per-visitor rules for opening the estimate assistant.
 *
 * - An IP that opens more than DAILY_OPEN_LIMIT conversations in one shop day
 *   (Vancouver time) gets a fixed "please call us" reply instead of the AI.
 * - IPs on REPAIR_CHAT_IP_ALLOWLIST (the owner's home and the shop, for
 *   testing) skip that limit and the per-IP rate limits. The list lives in
 *   the environment, not the repo, because the repo is public. Entries are
 *   comma or space separated addresses or CIDR ranges (IPv4 or IPv6), e.g.
 *   "203.0.113.7, 2001:db8:1234:5678::/64".
 */
import { BlockList, isIP } from "node:net";

export const DAILY_OPEN_LIMIT = 3;

const shopDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" });

export class DailyOpenCounter {
  private day = "";
  private readonly counts = new Map<string, number>();

  private roll(now: Date): void {
    const day = shopDay.format(now);
    if (day !== this.day) {
      this.day = day;
      this.counts.clear();
    }
  }

  /** Count one more conversation for this IP today; returns today's total. */
  record(ip: string, now = new Date()): number {
    this.roll(now);
    const count = (this.counts.get(ip) ?? 0) + 1;
    this.counts.set(ip, count);
    return count;
  }

  today(ip: string, now = new Date()): number {
    this.roll(now);
    return this.counts.get(ip) ?? 0;
  }
}

export function parseAllowlist(raw: string | undefined): BlockList {
  const list = new BlockList();
  for (const entry of (raw ?? "").split(/[\s,]+/).filter(Boolean)) {
    const [address, prefix] = entry.split("/");
    const family = isIP(address);
    if (!family) {
      console.error("repair-chat: ignoring invalid allowlist entry", entry);
      continue;
    }
    const type = family === 6 ? "ipv6" : "ipv4";
    if (prefix === undefined) list.addAddress(address, type);
    else list.addSubnet(address, Number(prefix), type);
  }
  return list;
}

export function isAllowlisted(list: BlockList, ip: string): boolean {
  const family = isIP(ip);
  if (!family) return false;
  try {
    return list.check(ip, family === 6 ? "ipv6" : "ipv4");
  } catch {
    return false;
  }
}
