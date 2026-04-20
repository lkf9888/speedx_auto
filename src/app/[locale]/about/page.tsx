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
    title: dict.nav.about,
    description: dict.about.heroSubtitle,
  };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);
  const a = dict.about;

  return (
    <>
      <section className="bg-hero-gradient">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {dict.nav.about}
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              {a.heroTitle}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-500">{a.heroSubtitle}</p>
          </div>
        </Container>
      </section>

      <section className="py-20 sm:py-24">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
                {a.story.title}
              </h2>
              <div className="mt-8 grid gap-3">
                <StatPill label="Founded" value={String(company.foundedYear)} />
                <StatPill label="BC Ranking" value={company.stats.rankInBC} />
                <StatPill label="Fleet Size" value={company.stats.fleetSize} />
                <StatPill label="Trips Completed" value={company.stats.tripsCompleted} />
              </div>
            </div>
            <div className="space-y-5 text-base leading-relaxed text-ink-600">
              {a.story.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-ink-50 py-20 sm:py-24">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              {a.values.title}
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {a.values.items.map((v, i) => (
              <div key={i} className="rounded-2xl bg-white p-6 ring-1 ring-ink-100">
                <h3 className="text-lg font-semibold text-ink-900">{v.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-500">{v.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <LocationMap dict={dict} />

      <section className="py-20 sm:py-28">
        <Container>
          <div className="shimmer-border relative overflow-hidden rounded-3xl bg-dark-hero p-8 text-white sm:p-14">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {dict.hosting.closingCta.title}
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-ink-200">
                {dict.hosting.closingCta.subtitle}
              </p>
              <div className="mt-8">
                <ContactBar dict={dict} variant="dark" />
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 rounded-2xl bg-ink-50 px-5 py-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </span>
      <span className="font-mono text-xl font-bold text-ink-900">{value}</span>
    </div>
  );
}
