import Link from "next/link";
import type { Dictionary } from "@/i18n/en";
import { Container } from "@/components/Container";
import { company, googleMapsLink } from "@/lib/company";

export function LocationMap({
  dict,
  className = "pb-20 sm:pb-24",
}: {
  dict: Dictionary;
  className?: string;
}) {
  return (
    <section className={className}>
      <Container>
        <div className="overflow-hidden rounded-3xl border border-ink-100 bg-white">
          <div className="grid md:grid-cols-[1fr_1.1fr]">
            <div className="p-8 sm:p-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 22s8-7 8-13a8 8 0 1 0-16 0c0 6 8 13 8 13z" />
                  <circle cx="12" cy="9" r="3" />
                </svg>
              </div>
              <h2 className="mt-5 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                {dict.contact.location.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-500">
                {dict.contact.location.body}
              </p>
              <div className="mt-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  {dict.footer.hours}
                </div>
                <div className="mt-1 text-base font-semibold text-ink-900">
                  {dict.contact.location.hours}
                </div>
              </div>
              <Link
                href={googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-1 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                {dict.cta.openInMaps} ↗
              </Link>
            </div>
            <div className="relative min-h-[320px] bg-ink-50">
              <iframe
                title="SPEEDX AUTO location map"
                src={`https://www.google.com/maps?q=${company.googleMapsQuery}&output=embed`}
                width="100%"
                height="100%"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                style={{ border: 0, position: "absolute", inset: 0 }}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
