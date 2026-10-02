export {};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown> | unknown[] | IArguments>;
    gtag?: (...args: unknown[]) => void;
  }
}
