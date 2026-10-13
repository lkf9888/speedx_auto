import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactBar } from "@/components/ContactBar";
import { Container } from "@/components/Container";
import { FlatPriceTable } from "@/components/FlatPriceTable";
import { StructuredData } from "@/components/StructuredData";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import {
  displayedTotal,
  fillPriceGuide,
  formatRange,
  priceGuideJobs,
  priceGuideQuotes,
  priceGuideSystems,
  priceGuideValues,
} from "@/lib/repair-price-guide";
import { buildPageMetadata } from "@/lib/seo";
import { absoluteRouteUrl, routePath } from "@/lib/site-routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const copy = getDictionary(locale).autoRepair.priceGuide;
  return buildPageMetadata({
    locale,
    route: "repairPrices",
    title: copy.metaTitle,
    description: copy.metaDescription,
  });
}

export default async function RepairPriceGuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);
  const copy = dict.autoRepair.priceGuide;
  const pagePath = routePath(locale, "repairPrices");
  const values = priceGuideValues();
  const fill = (text: string) => fillPriceGuide(text, values);
  const summary = fill(copy.summary);
  const faqs = copy.faqs.map((faq) => ({ question: faq.question, answer: fill(faq.answer) }));

  return (
    <>
      <StructuredData
        locale={locale}
        route="repairPrices"
        pageName={copy.title}
        pageDescription={summary}
        breadcrumbs={[
          { name: dict.nav.home, url: absoluteRouteUrl(locale, "home") },
          { name: dict.nav.autoRepair, url: absoluteRouteUrl(locale, "autoRepair") },
          { name: copy.navLabel, url: absoluteRouteUrl(locale, "repairPrices") },
        ]}
        faqs={faqs}
      />
      <section className="bg-hero-gradient">
        <Container className="py-12 sm:py-20">
          <nav aria-label="Breadcrumb" className="text-sm text-ink-500">
            <Link href={routePath(locale, "home")} className="hover:text-ink-900">{dict.nav.home}</Link>
            <span aria-hidden className="mx-2">/</span>
            <Link href={routePath(locale, "autoRepair")} className="hover:text-ink-900">{dict.nav.autoRepair}</Link>
          </nav>
          <div className="mt-8 max-w-3xl">
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {copy.eyebrow}
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-5xl">{copy.title}</h1>
            <p data-testid="answer-summary" className="mt-5 leading-7 text-ink-600 sm:mt-6 sm:text-lg sm:leading-8">
              {summary}
            </p>
            <Link
              href={`${routePath(locale, "autoRepair")}#estimate`}
              className="mt-6 inline-flex rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {copy.estimateLabel} →
            </Link>
            <p className="mt-3 text-xs font-semibold text-ink-400">{copy.lastUpdated}</p>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-16">
        <Container className="space-y-12">
          {priceGuideSystems.map((system) => (
            <div key={system}>
              <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.systemTitles[system]}</h2>
              <div className="mt-5 overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="border-b border-ink-100 text-xs uppercase tracking-wider text-ink-400">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">{copy.columns.job}</th>
                      <th scope="col" className="px-5 py-3 font-semibold">{copy.columns.vehicle}</th>
                      <th scope="col" className="px-5 py-3 font-semibold">{copy.columns.laborTime}</th>
                      <th scope="col" className="px-5 py-3 font-semibold">{copy.columns.parts}</th>
                      <th scope="col" className="px-5 py-3 font-semibold">{copy.columns.total}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {priceGuideJobs[system].flatMap((job) =>
                      priceGuideQuotes
                        .filter((quote) => quote.job === job)
                        .map((quote) => {
                          const total = displayedTotal(quote);
                          return (
                            <tr key={`${job}-${quote.vehicle}`}>
                              <th scope="row" className="px-5 py-3 font-semibold text-ink-900">{copy.jobNames[job]}</th>
                              <td className="px-5 py-3 text-ink-600">{quote.vehicle}</td>
                              <td className="whitespace-nowrap px-5 py-3 tabular-nums text-ink-600">
                                {quote.laborHours} {copy.hoursUnit}
                              </td>
                              <td className="whitespace-nowrap px-5 py-3 tabular-nums text-ink-600">
                                {formatRange(Math.round(quote.partsLow), Math.round(quote.partsHigh))}
                              </td>
                              <td className="whitespace-nowrap px-5 py-3 font-semibold tabular-nums text-ink-900">
                                {formatRange(total.low, total.high)}
                              </td>
                            </tr>
                          );
                        }),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div>
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.flatTitle}</h2>
            <p className="mt-3 max-w-2xl leading-7 text-ink-600">{copy.flatIntro}</p>
            <div className="mt-5">
              <FlatPriceTable labels={dict.autoRepair.pricing.flat} />
            </div>
            <p className="mt-4 max-w-3xl text-xs leading-6 text-ink-400">{dict.autoRepair.pricing.flat.note}</p>
          </div>
        </Container>
      </section>

      <section className="bg-ink-50 py-10 sm:py-16">
        <Container>
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.methodTitle}</h2>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-ink-600 sm:text-base">
              {copy.methodItems.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="text-brand-600">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-12 max-w-4xl">
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.faqTitle}</h2>
            <div className="mt-6 space-y-3">
              {faqs.map((faq) => (
                <details key={faq.question} className="rounded-2xl bg-white p-5 ring-1 ring-ink-100">
                  <summary className="cursor-pointer list-none font-semibold text-ink-900">{faq.question}</summary>
                  <p className="mt-3 text-sm leading-7 text-ink-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-16">
        <Container>
          <div className="rounded-3xl bg-dark-hero p-6 text-white sm:p-12">
            <h2 className="text-2xl font-bold sm:text-3xl">{copy.ctaTitle}</h2>
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
