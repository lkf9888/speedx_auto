// Match Google's documented gtag queue: command entries must be arguments
// objects, not arrays (which Google treats as data-model method calls).
export function queueGoogleCommand(...command: unknown[]): void {
  if (typeof window === "undefined" || command.length === 0) return;
  window.dataLayer ??= [];
  // eslint-disable-next-line prefer-rest-params -- Google requires an arguments object, not a rest array.
  window.dataLayer.push(arguments);
}
