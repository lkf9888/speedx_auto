import type { ReactNode } from "react";

/**
 * A closed-by-default section for reference material (facts, price tables).
 *
 * Built on <details>, so the full text stays in the served HTML for search
 * engines and AI crawlers while visitors only see a one-line heading until
 * they tap it. The heading stays a real <h2> inside the <summary>.
 */
export function Collapsible({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl bg-white ring-1 ring-ink-100">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[1.125rem] font-bold text-ink-900 sm:text-xl">{title}</h2>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 text-brand-600 transition-transform group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="border-t border-ink-100 px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}
