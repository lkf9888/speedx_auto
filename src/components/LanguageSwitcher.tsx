"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { locales, localeNames, type Locale } from "@/i18n/config";

export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const [open, setOpen] = useState(false);
  const currentPath = usePathname() ?? `/${currentLocale}`;
  const rest = currentPath.replace(/^\/[^/]+/, "") || "";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50"
        aria-label="Change language"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {localeNames[currentLocale]}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" className="opacity-60">
          <path d="M6 8.5 1.5 4h9L6 8.5z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg">
          {locales.map((l) => (
            <Link
              key={l}
              href={`/${l}${rest}`}
              className={`flex items-center justify-between px-3 py-2 text-sm ${
                l === currentLocale
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-ink-700 hover:bg-ink-50"
              }`}
            >
              {localeNames[l]}
              {l === currentLocale && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M10 3 4.5 8.5 2 6l.7-.7L4.5 7l4.8-4.7L10 3z" />
                </svg>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
