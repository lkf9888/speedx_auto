import { readConsent } from "@/lib/consent";

/**
 * SPEEDX AUTO's Meta (Facebook / Instagram) Pixel. The ID is public, like the
 * Google Ads labels: dataset "SPEEDX AUTO" in ad account 1196767670786322.
 */
export const META_PIXEL_ID = "1100853409577646";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: Fbq;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let initializedId: string | null = null;

/** Meta's standard base code, run only after the visitor grants consent. */
export function loadMetaPixel(pixelId: string = META_PIXEL_ID): boolean {
  if (typeof window === "undefined" || !pixelId || readConsent() !== "granted") return false;
  if (initializedId === pixelId) return true;

  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq ??= fbq;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
  window.fbq("init", pixelId);
  initializedId = pixelId;
  return true;
}

/** Send a Meta standard event, only when the pixel loaded with consent. */
export function trackMetaEvent(event: string, parameters?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !initializedId || !window.fbq) return;
  if (readConsent() !== "granted") return;
  if (parameters) window.fbq("track", event, parameters);
  else window.fbq("track", event);
}

/** Test helper: forget the loaded pixel between tests. */
export function resetMetaPixelForTests(): void {
  initializedId = null;
  delete window.fbq;
  delete window._fbq;
}
