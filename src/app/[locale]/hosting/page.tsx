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
    title: dict.nav.hosting,
    description: dict.hosting.heroSubtitle,
  };
}

export default async function HostingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);
  const h = dict.hosting;

  return (
    <>
      {/* HERO */}
      <section className="bg-hero-gradient">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {dict.nav.hosting}
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              {h.heroTitle}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-500">{h.heroSubtitle}</p>
            <div className="mt-8">
              <ContactBar dict={dict} />
            </div>
          </div>
        </Container>
      </section>

      {/* WHO IT'S FOR */}
      <section className="py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {h.whoItsFor.title}
            </h2>
            <p className="mt-4 text-lg text-ink-500">{h.whoItsFor.subtitle}</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {h.whoItsFor.items.map((item, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-2xl border border-ink-100 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/5"
              >
                <div className="absolute right-4 top-4 text-xs font-bold text-brand-500">
                  0{i + 1}
                </div>
                <h3 className="pr-8 text-lg font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-ink-500">{item.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* WHAT IS TURO */}
      <section className="bg-ink-50 py-20 sm:py-24">
        <Container>
          <div className="grid items-start gap-10 md:grid-cols-[1fr_1.2fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700 ring-1 ring-brand-100">
                Turo 101
              </span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                {h.whatIsTuro.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-500">
                {h.whatIsTuro.subtitle}
              </p>
              <Link
                href={company.turoHostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                {dict.nav.turoListings} ↗
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {h.whatIsTuro.points.map((p, i) => (
                <div key={i} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                  <h3 className="text-sm font-semibold text-ink-900">{p.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-500">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {h.howItWorks.title}
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {h.howItWorks.steps.map((step, i) => (
              <div key={i} className="relative">
                <div className="text-xs font-semibold uppercase tracking-wider text-brand-500">
                  Step {step.num}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-500">{step.body}</p>
                {i < h.howItWorks.steps.length - 1 && (
                  <div className="absolute right-0 top-6 hidden h-px w-full -translate-x-6 bg-gradient-to-r from-brand-200 to-transparent lg:block" />
                )}
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* FAQ */}
      <section className="bg-ink-50 py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {h.faq.title}
            </h2>
          </div>
          <div className="mt-10 grid gap-3">
            {h.faq.items.map((item, i) => (
              <details
                key={i}
                className="group rounded-2xl bg-white p-5 ring-1 ring-ink-100 transition-shadow open:shadow-md"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <h3 className="text-base font-semibold text-ink-900">{item.q}</h3>
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-600 transition-transform group-open:rotate-45">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-ink-500">{item.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <LocationMap dict={dict} />

      {/* CLOSING CTA */}
      <section className="py-20 sm:py-28">
        <Container>
          <div className="shimmer-border relative overflow-hidden rounded-3xl bg-dark-hero p-8 text-center text-white sm:p-14">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
              {h.closingCta.title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-ink-200">
              {h.closingCta.subtitle}
            </p>
            <div className="mt-8 flex justify-center">
              <ContactBar dict={dict} variant="dark" />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
