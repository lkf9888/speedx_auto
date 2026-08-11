"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/site-routes";
import {
  applyGoogleConsent,
  readConsent,
  saveConsent,
  type ConsentChoice,
} from "@/lib/consent";

interface ConsentBannerProps {
  locale: Locale;
  copy: {
    title: string;
    description: string;
    accept: string;
    decline: string;
    privacyLink: string;
  };
}

export function ConsentBanner({ locale, copy }: ConsentBannerProps) {
  const choice = useSyncExternalStore(
    subscribeToConsent,
    readConsent,
    getServerConsentSnapshot,
  );

  useEffect(() => {
    if (choice === "granted" || choice === "denied") {
      applyGoogleConsent(choice);
    }
  }, [choice]);

  function choose(choice: ConsentChoice) {
    saveConsent(choice);
    window.dispatchEvent(new Event("speedx-consent-change"));
  }

  if (choice !== null) return null;

  return (
    <aside
      role="dialog"
      aria-label={copy.title}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-2xl border border-ink-200 bg-white p-5 shadow-2xl shadow-ink-900/20 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink-900">{copy.title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-500">
            {copy.description}{" "}
            <Link
              href={`/${locale}/privacy`}
              className="font-semibold text-brand-600 hover:text-brand-700"
            >
              {copy.privacyLink}
            </Link>
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            {copy.decline}
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            {copy.accept}
          </button>
        </div>
      </div>
    </aside>
  );
}

function subscribeToConsent(onStoreChange: () => void): () => void {
  window.addEventListener("speedx-consent-change", onStoreChange);
  return () =>
    window.removeEventListener("speedx-consent-change", onStoreChange);
}

function getServerConsentSnapshot(): "loading" {
  return "loading";
}
