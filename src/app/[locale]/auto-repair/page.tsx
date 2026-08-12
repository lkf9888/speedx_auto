import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactBar } from "@/components/ContactBar";
import { Container } from "@/components/Container";
import { StructuredData } from "@/components/StructuredData";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/seo";
import {
  absoluteRouteUrl,
  repairServiceSlugs,
  routePath,
  type RepairServiceSlug,
  type RouteKey,
} from "@/lib/site-routes";

const routeKeyByService: Record<RepairServiceSlug, RouteKey> = {
  maintenance: "repairMaintenance",
  brakes: "repairBrakes",
  diagnostics: "repairDiagnostics",
  suspension: "repairSuspension",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = getDictionary(locale).autoRepair;
  return buildPageMetadata({
    locale,
    route: "autoRepair",
    title: copy.metaTitle,
    description: copy.metaDescription,
  });
}

export default async function AutoRepairPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);
  const copy = dict.autoRepair;
  const pagePath = routePath(locale, "autoRepair");

  return (
    <>
      <StructuredData
        locale={locale}
        route="autoRepair"
        pageName={copy.title}
        pageDescription={copy.summary}
        service={{
          name: copy.title,
          description: copy.summary,
          areaServed: ["Richmond", "Metro Vancouver"],
        }}
        breadcrumbs={[
          { name: dict.nav.home, url: absoluteRouteUrl(locale, "home") },
          {
            name: dict.nav.autoRepair,
            url: absoluteRouteUrl(locale, "autoRepair"),
          },
        ]}
        faqs={copy.faqs}
      />
      <section className="bg-hero-gradient">
        <Container className="py-16 sm:py-24 lg:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {copy.eyebrow}
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              {copy.title}
            </h1>
            <p data-testid="answer-summary" className="mt-6 text-lg leading-8 text-ink-600">
              {copy.summary}
            </p>
            <div className="mt-8">
              <ContactBar dict={dict} locale={locale} intent="auto_repair" placement="hero" pagePath={pagePath} />
            </div>
            <p className="mt-3 text-xs font-semibold text-ink-400">{copy.lastUpdated}</p>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <h2 className="text-3xl font-bold text-ink-900 sm:text-4xl">{copy.servicesTitle}</h2>
          <p className="mt-4 max-w-2xl leading-7 text-ink-600">{copy.servicesIntro}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {repairServiceSlugs.map((slug) => {
              const service = copy.services[slug];
              return (
                <Link key={slug} href={routePath(locale, routeKeyByService[slug])} className="rounded-3xl border border-ink-100 bg-white p-7 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg">
                  <h3 className="text-xl font-semibold text-ink-900">{service.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-600">{service.metaDescription}</p>
                  <span className="mt-5 inline-flex text-sm font-semibold text-brand-600">{dict.cta.learnMore} →</span>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="bg-ink-50 py-16 sm:py-20">
        <Container>
          <h2 className="text-3xl font-bold text-ink-900">{copy.whyTitle}</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {copy.whyItems.map((item) => (
              <article key={item.title} className="rounded-2xl bg-white p-6 ring-1 ring-ink-100">
                <h3 className="font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-600">{item.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-12 max-w-3xl">
            <h2 className="text-3xl font-bold text-ink-900">{copy.serviceAreaTitle}</h2>
            <p className="mt-4 leading-7 text-ink-600">{copy.serviceAreaBody}</p>
          </div>
          <div className="mt-12 max-w-4xl">
            <h2 className="text-3xl font-bold text-ink-900">{copy.faqTitle}</h2>
            <div className="mt-6 space-y-3">
              {copy.faqs.map((faq) => (
                <details key={faq.question} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                  <summary className="cursor-pointer list-none font-semibold text-ink-900">{faq.question}</summary>
                  <p className="mt-3 text-sm leading-7 text-ink-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="rounded-3xl bg-dark-hero p-8 text-white sm:p-12">
            <h2 className="text-3xl font-bold">{copy.ctaTitle}</h2>
            <p className="mt-4 max-w-2xl leading-7 text-ink-200">{copy.ctaBody}</p>
            <div className="mt-7">
              <ContactBar dict={dict} locale={locale} intent="auto_repair" placement="middle" pagePath={pagePath} theme="dark" />
            </div>
          </div>
        </Container>
      </section>
      <ContactBar
        dict={dict}
        locale={locale}
        intent="auto_repair"
        placement="sticky_mobile"
        pagePath={pagePath}
        variant="sticky"
      />
    </>
  );
}
