import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONSENT_STORAGE_KEY,
  applyGoogleConsent,
  readConsent,
  saveConsent,
} from "@/lib/consent";

describe("consent storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.dataLayer = [];
    delete window.gtag;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns null on a first visit or corrupt stored value", () => {
    expect(readConsent()).toBeNull();

    window.localStorage.setItem(CONSENT_STORAGE_KEY, "maybe");
    expect(readConsent()).toBeNull();
  });

  it("persists accepted and declined choices", () => {
    saveConsent("granted");
    expect(readConsent()).toBe("granted");

    saveConsent("denied");
    expect(readConsent()).toBe("denied");
  });

  it("does not crash when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readConsent()).toBeNull();
    expect(() => saveConsent("granted")).not.toThrow();
    expect(readConsent()).toBe("granted");
  });
});

describe("applyGoogleConsent", () => {
  beforeEach(() => {
    window.dataLayer = [];
    delete window.gtag;
  });

  it.each(["granted", "denied"] as const)(
    "updates every Consent Mode v2 field to %s",
    (choice) => {
      applyGoogleConsent(choice);

      expect(window.dataLayer).toEqual([
        [
          "consent",
          "update",
          {
            ad_storage: choice,
            analytics_storage: choice,
            ad_user_data: choice,
            ad_personalization: choice,
          },
        ],
      ]);
    },
  );

  it("does nothing during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(() => applyGoogleConsent("granted")).not.toThrow();
  });
});
