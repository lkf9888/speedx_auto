import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Container } from "@/components/Container";
import { ContactBar } from "@/components/ContactBar";
import { LocationMap } from "@/components/LocationMap";
import { company } from "@/lib/company";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);

  return (
    <>
      {/* HERO */}
      <section className="bg-hero-gradient relative overflow-hidden">
        <Container className="py-16 sm:py-24 lg:py-32">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
            <div className="fade-in-up">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                {dict.hero.eyebrow}
              </span>
              <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
                {dict.hero.title}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-500">
                {dict.hero.subtitle}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={`/${locale}/hosting`}
                  className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-ink-900/10 transition-colors hover:bg-brand-600"
                >
                  {dict.hero.primaryCta}
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href={company.turoHostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-6 py-3 text-sm font-semibold text-ink-800 transition-colors hover:border-ink-900 hover:bg-ink-50"
                >
                  {dict.hero.secondaryCta} ↗
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <CheckIcon /> {dict.footer.hoursValue}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckIcon /> {company.addressFull}
                </span>
              </div>
            </div>

            {/* Stats card */}
            <div className="relative">
              <div className="shimmer-border relative overflow-hidden rounded-3xl bg-ink-900 p-6 text-white shadow-2xl shadow-brand-900/20 sm:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_80%_-10%,rgba(126,91,255,0.5),rgba(0,0,0,0))]" />
                <div className="relative">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-200">
                    <Image src="/logo.png" alt="" width={20} height={20} className="rounded opacity-90" />
                    SPEEDX · BC's #1 Turo Host
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-5">
                    <Stat label={dict.hero.stat1Label} value={dict.hero.stat1} big />
                    <Stat label={dict.hero.stat2Label} value={dict.hero.stat2} />
                    <Stat label={dict.hero.stat3Label} value={dict.hero.stat3} />
                    <Stat label={dict.hero.stat4Label} value={dict.hero.stat4} />
                  </div>
                  <div className="mt-8 rounded-2xl bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">
                      Since {company.foundedYear}
                    </p>
                    <p className="mt-1 text-sm text-ink-100">
                      {company.stats.tripsCompleted} trips · {company.stats.fleetSize} cars managed · Richmond, BC
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* VIDEO */}
      <section className="py-20 sm:py-24">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {dict.video.eyebrow}
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {dict.video.title}
            </h2>
            <p className="mt-4 text-lg text-ink-500">{dict.video.subtitle}</p>
          </div>
          <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-3xl bg-ink-900 shadow-xl shadow-brand-900/10 ring-1 ring-ink-100">
            <div className="relative aspect-video">
              <iframe
                title="SPEEDX AUTO promo video"
                src="https://www.youtube-nocookie.com/embed/gLrh6DLm5FI?rel=0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ADVANTAGES */}
      <section className="pb-20 sm:pb-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {dict.advantages.title}
            </h2>
            <p className="mt-4 text-lg text-ink-500">{dict.advantages.subtitle}</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {dict.advantages.items.map((item, i) => (
              <div
                key={i}
                className="group rounded-2xl border border-ink-100 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg hover:shadow-brand-500/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <BadgeIcon index={i} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-500">{item.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <LocationMap dict={dict} />

      {/* SERVICES OVERVIEW */}
      <section className="bg-ink-50 py-20 sm:py-24">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                {dict.services.heroTitle}
              </h2>
              <p className="mt-4 text-lg text-ink-500">{dict.services.heroSubtitle}</p>
            </div>
            <Link
              href={`/${locale}/services`}
              className="text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              {dict.cta.learnMore} →
            </Link>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {dict.services.items.map((item, i) => (
              <div key={i} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-ink-100">
                <h3 className="text-lg font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-500">{item.body}</p>
                <div className="mt-4">
                  {item.external ? (
                    <Link
                      href={company.turoHostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                    >
                      {item.ctaLabel} ↗
                    </Link>
                  ) : (
                    <Link
                      href={i === 1 ? `/${locale}/hosting` : `/${locale}/contact`}
                      className="text-sm font-semibold text-brand-600 hover:text-brand-700"
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

      {/* HOSTING PROGRAM CTA */}
      <section className="py-20 sm:py-28">
        <Container>
          <div className="shimmer-border relative overflow-hidden rounded-3xl bg-dark-hero p-8 text-white sm:p-14">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-200">
                {dict.nav.hosting}
              </span>
              <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                {dict.hosting.heroTitle}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-200">
                {dict.hosting.heroSubtitle}
              </p>
              <div className="mt-8">
                <ContactBar dict={dict} variant="dark" />
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/hosting`}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink-900 transition-colors hover:bg-brand-50"
                >
                  {dict.cta.becomeHost} →
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className={`font-bold text-white ${big ? "text-5xl sm:text-6xl" : "text-3xl sm:text-4xl"}`}>
        {value}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-brand-200">
        {label}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function BadgeIcon({ index }: { index: number }) {
  const icons = [
    <path key="1" d="M5 21V9l7-6 7 6v12h-5v-6h-4v6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />,
    <path key="2" d="M3 3v18h18M8 13l4-4 4 4 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    <path key="3" d="M3 12h4l2-7 4 14 2-7h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    <path key="4" d="M12 2v20M5 7l14 10M5 17l14-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />,
    <path key="5" d="M12 22s8-7 8-13a8 8 0 1 0-16 0c0 6 8 13 8 13z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />,
    <path key="6" d="M12 2v3m0 14v3m10-10h-3M5 12H2m14.9-7.1-2.1 2.1M7.2 16.8l-2.1 2.1m0-14.2 2.1 2.1m9.6 9.6 2.1 2.1M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />,
  ];
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      {icons[index % icons.length]}
    </svg>
  );
}
