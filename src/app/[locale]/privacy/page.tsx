import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { StructuredData } from "@/components/StructuredData";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/seo";
import { absoluteRouteUrl } from "@/lib/site-routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);

  return buildPageMetadata({
    locale,
    route: "privacy",
    title: dict.privacy.metaTitle,
    description: dict.privacy.metaDescription,
  });
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);
  const privacy = dict.privacy;

  return (
    <>
      <StructuredData
        locale={locale}
        route="privacy"
        pageName={privacy.title}
        pageDescription={privacy.metaDescription}
        breadcrumbs={[
          { name: dict.nav.home, url: absoluteRouteUrl(locale, "home") },
          {
            name: privacy.eyebrow,
            url: absoluteRouteUrl(locale, "privacy"),
          },
        ]}
      />
      <section className="bg-hero-gradient">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {privacy.eyebrow}
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
              {privacy.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-500">
              {privacy.intro}
            </p>
            <p className="mt-4 text-sm font-semibold text-ink-400">
              {privacy.lastUpdated}
            </p>
          </div>
        </Container>
      </section>
      <section className="py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl space-y-10">
            {privacy.sections.map((section) => (
              <article key={section.title}>
                <h2 className="text-2xl font-semibold text-ink-900">
                  {section.title}
                </h2>
                <p className="mt-3 leading-7 text-ink-600">{section.body}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
