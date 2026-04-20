"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Nav({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPath = usePathname() ?? `/${locale}`;

  const items = [
    { href: `/${locale}`, label: dict.nav.home, match: "" },
    { href: `/${locale}/hosting`, label: dict.nav.hosting, match: "hosting" },
    { href: `/${locale}/services`, label: dict.nav.services, match: "services" },
    { href: `/${locale}/about`, label: dict.nav.about, match: "about" },
    { href: `/${locale}/contact`, label: dict.nav.contact, match: "contact" },
  ];

  const isActive = (match: string) =>
    match === "" ? currentPath === `/${locale}` : currentPath.includes(`/${match}`);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-ink-100/60 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="SPEEDX AUTO"
            width={36}
            height={36}
            className="rounded-md"
            priority
          />
          <span className="text-base font-bold tracking-tight text-ink-900">
            SPEEDX <span className="text-brand-500">AUTO</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive(item.match)
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher currentLocale={locale} />
          <Link
            href={`/${locale}/hosting`}
            className="hidden rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 sm:inline-block"
          >
            {dict.nav.cta}
          </Link>
          <button
            aria-label="Menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 text-ink-600 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? (
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-ink-100 bg-white md:hidden">
          <nav className="mx-auto flex w-full max-w-6xl flex-col px-4 py-2 sm:px-6">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive(item.match)
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-600 hover:bg-ink-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={`/${locale}/hosting`}
              onClick={() => setMobileOpen(false)}
              className="mt-1 rounded-lg bg-ink-900 px-3 py-2.5 text-center text-sm font-semibold text-white"
            >
              {dict.nav.cta}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
