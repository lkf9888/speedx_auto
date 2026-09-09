/**
 * Internal systems that share the speedxrental.com domain.
 *
 * Each app keeps its own accounts and roles. Cloudflare Access sits in front of
 * these subdomains and supplies the single sign-in; this list only publishes the
 * entry points. Adding a system here is enough to surface it in the staff menu —
 * remember to add matching copy under `nav.staff.apps` in every locale.
 */
export const staffAppKeys = ["carwash", "gps"] as const;

export type StaffAppKey = (typeof staffAppKeys)[number];

export const staffAppUrls: Record<StaffAppKey, string> = {
  carwash: "https://carwash.speedxrental.com",
  gps: "https://gps.speedxrental.com",
};
