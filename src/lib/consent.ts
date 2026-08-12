export const CONSENT_STORAGE_KEY = "speedx-consent-v1";
export type ConsentChoice = "granted" | "denied";

let volatileConsent: ConsentChoice | null = null;

export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (value === "granted" || value === "denied") return value;
    volatileConsent = null;
    return null;
  } catch {
    return volatileConsent;
  }
}

export function saveConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;

  volatileConsent = choice;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
    volatileConsent = null;
  } catch {
    // Consent still applies for the current page when persistent storage is blocked.
  }
}

export function applyGoogleConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;

  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag("consent", "update", {
    ad_storage: choice,
    analytics_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
  });
}
