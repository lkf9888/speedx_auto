import Link from "next/link";
import { ContactBar } from "@/components/ContactBar";
import { Container } from "@/components/Container";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  repairServiceSlugs,
  routePath,
  type Locale,
  type RepairServiceSlug,
  type RouteKey,
} from "@/lib/site-routes";

const routeKeyByService: Record<RepairServiceSlug, RouteKey> = {
  maintenance: "repairMaintenance",
  brakes: "repairBrakes",
  diagnostics: "repairDiagnostics",
  suspension: "repairSuspension",
};

export function RepairServicePage({
  locale,
  dict,
  serviceSlug,
}: {
  locale: Locale;
  dict: Dictionary;
  serviceSlug: RepairServiceSlug;
}) {
  const copy = dict.autoRepair.services[serviceSlug];
  const pagePath = routePath(locale, routeKeyByService[serviceSlug]);

  return (
    <>
      <section className="bg-hero-gradient">
        <Container className="py-14 sm:py-20 lg:py-24">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
            <Link href={routePath(locale, "home")} className="hover:text-ink-900">
              {dict.nav.home}
            </Link>
            <span aria-hidden className="mx-2">/</span>
            <Link
              href={routePath(locale, "autoRepair")}
              className="hover:text-ink-900"
            >
              {dict.nav.autoRepair}
            </Link>
          </nav>
          <div className="mt-8 max-w-3xl">
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {copy.eyebrow}
            </span>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              {copy.title}
            </h1>
            <p
              data-testid="answer-summary"
              className="mt-6 text-lg leading-8 text-ink-600"
            >
              {copy.summary}
            </p>
            <div className="mt-8">
              <ContactBar
                dict={dict}
                locale={locale}
                intent="auto_repair"
                placement="hero"
                pagePath={pagePath}
              />
            </div>
            <p className="mt-3 text-xs font-semibold text-ink-400">
              {copy.lastUpdated}
            </p>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="grid gap-8 lg:grid-cols-2">
            <InfoList title={copy.symptomsTitle} items={copy.symptoms} />
            <InfoList title={copy.inspectionsTitle} items={copy.inspections} />
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <article className="rounded-3xl bg-ink-900 p-7 text-white">
              <h2 className="text-2xl font-semibold">{copy.safetyTitle}</h2>
              <p className="mt-4 leading-7 text-ink-200">{copy.safetyBody}</p>
            </article>
            <InfoList title={copy.processTitle} items={copy.process} numbered />
          </div>
        </Container>
      </section>

      <section className="bg-ink-50 py-16 sm:py-20">
        <Container>
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold text-ink-900">
              {copy.serviceAreaTitle}
            </h2>
            <p className="mt-4 leading-7 text-ink-600">{copy.serviceAreaBody}</p>
          </div>
          <div className="mt-12 max-w-4xl">
            <h2 className="text-3xl font-bold text-ink-900">{copy.faqTitle}</h2>
            <div className="mt-6 space-y-3">
              {copy.faqs.map((faq) => (
                <details key={faq.question} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                  <summary className="cursor-pointer list-none">
                    <h3 className="inline text-base font-semibold text-ink-900">
                      {faq.question}
                    </h3>
                  </summary>
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
              <ContactBar
                dict={dict}
                locale={locale}
                intent="auto_repair"
                placement="middle"
                pagePath={pagePath}
                theme="dark"
              />
            </div>
          </div>
          <nav aria-label="Related repair services" className="mt-10 flex flex-wrap gap-3">
            {repairServiceSlugs
              .filter((slug) => slug !== serviceSlug)
              .map((slug) => (
                <Link
                  key={slug}
                  href={routePath(locale, routeKeyByService[slug])}
                  className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700"
                >
                  {dict.autoRepair.services[slug].title}
                </Link>
              ))}
          </nav>
        </Container>
      </section>
    </>
  );
}

function InfoList({
  title,
  items,
  numbered = false,
}: {
  title: string;
  items: string[];
  numbered?: boolean;
}) {
  return (
    <article className="rounded-3xl border border-ink-100 bg-white p-7">
      <h2 className="text-2xl font-semibold text-ink-900">{title}</h2>
      <ul className="mt-5 space-y-4 text-ink-600">
        {items.map((item, index) => (
          <li key={item} className="flex gap-3 leading-7">
            <span className="font-mono text-sm font-bold text-brand-600">
              {numbered ? String(index + 1).padStart(2, "0") : "•"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
