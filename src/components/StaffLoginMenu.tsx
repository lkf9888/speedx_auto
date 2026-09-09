"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { staffAppKeys, staffAppUrls } from "@/lib/staff-apps";

/**
 * Entry point to the internal systems on the speedxrental.com subdomains.
 *
 * The links leave this site, so they are plain anchors. Cloudflare Access
 * challenges the visitor at the subdomain; nothing here decides who gets in.
 */
export function StaffLoginMenu({ dict }: { dict: Dictionary }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const staff = dict.nav.staff;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 px-3.5 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:border-ink-200 hover:bg-ink-50 hover:text-ink-900"
      >
        {staff.label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={staff.menuTitle}
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-lg shadow-ink-900/5"
        >
          <p className="border-b border-ink-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {staff.menuTitle}
          </p>
          {staffAppKeys.map((key) => (
            <a
              key={key}
              role="menuitem"
              href={staffAppUrls[key]}
              rel="noopener"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 transition-colors hover:bg-ink-50"
            >
              <span className="block text-sm font-semibold text-ink-900">
                {staff.apps[key].name}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {staff.apps[key].description}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
