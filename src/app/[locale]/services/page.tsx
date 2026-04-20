import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Container } from "@/components/Container";
import { ContactBar } from "@/components/ContactBar";
import { LocationMap } from "@/components/LocationMap";
import { company } from "@/lib/company";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: dict.nav.services,
    description: dict.services.heroSubtitle,
  };
}

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <section className="bg-hero-gradient">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {dict.nav.services}
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl">
              {dict.services.heroTitle}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-500">
              {dict.services.heroSubtitle}
            </p>
            <div className="mt-8">
              <ContactBar dict={dict} />
            </div>
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container>
          <div className="grid gap-6 md:grid-cols-2">
            {dict.services.items.map((item, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-3xl border border-ink-100 bg-white p-8 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/5"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <ServiceIcon index={i} />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-ink-900">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-500">{item.body}</p>
                <div className="mt-5">
                  {item.external ? (
                    <Link
                      href={company.turoHostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                    >
                      {item.ctaLabel} ↗
                    </Link>
                  ) : (
                    <Link
                      href={i === 1 ? `/${locale}/hosting` : `/${locale}/contact`}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
                    >
                      {item.ctaLabel} →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <LocationMap dict={dict} />
    </>
  );
}

function ServiceIcon({ index }: { index: number }) {
  const paths = [
    <g key="1"><path d="M3 12 4 7a2 2 0 0 1 2-1.5h12a2 2 0 0 1 2 1.5l1 5" /><path d="M3 12v6a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2h12v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-6" /><circle cx="7" cy="14.5" r="1" /><circle cx="17" cy="14.5" r="1" /></g>,
    <g key="2"><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h16" /><circle cx="19" cy="12" r="3" /></g>,
    <g key="3"><path d="M14 6.5 17 4l3 3-2.5 3" /><path d="M14 6.5 6 14.5" /><circle cx="6" cy="18" r="3" /><path d="M20 20l-2-2" /></g>,
    <g key="4"><path d="M12 2 3 7v5c0 5 4 9 9 10 5-1 9-5 9-10V7l-9-5z" /><path d="m9 12 2 2 4-4" /></g>,
  ];
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[index % paths.length]}
    </svg>
  );
}
