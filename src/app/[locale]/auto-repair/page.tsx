import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Collapsible } from "@/components/Collapsible";
import { ContactBar } from "@/components/ContactBar";
import { RepairChat } from "@/components/RepairChat";
import { Container } from "@/components/Container";
import { FlatPriceTable } from "@/components/FlatPriceTable";
import { StructuredData } from "@/components/StructuredData";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { company } from "@/lib/company";
import { buildPageMetadata, repairShareImage } from "@/lib/seo";
import {
  absoluteRouteUrl,
  repairRouteKeys,
  repairServiceSlugs,
  routePath,
} from "@/lib/site-routes";

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
    image: repairShareImage(locale),
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
  const chatEnabled = process.env.NEXT_PUBLIC_REPAIR_CHAT_ENABLED === "true";
  const quoteHref = chatEnabled ? "#estimate" : undefined;

  return (
    <>
      <StructuredData
        locale={locale}
        route="autoRepair"
        pageName={copy.title}
        pageDescription={copy.summary}
        service={{
          name: copy.serviceName,
          serviceType: copy.serviceType,
          description: copy.summary,
          areaServed: copy.serviceAreaPlaces,
          catalog: { name: copy.scope.offeredTitle, items: copy.scope.offered },
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
      <div className="page-compact">
      <section className="bg-hero-gradient">
        <Container className="py-10 sm:py-24 lg:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {copy.eyebrow}
            </span>
            <h1 className="mt-4 text-[1.65rem] font-bold leading-tight tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
              {copy.title}
            </h1>
            <p data-testid="answer-summary" className="mt-5 leading-7 text-ink-600 sm:mt-6 sm:text-lg sm:leading-8">
              {copy.heroSummary ?? copy.summary}
            </p>
            <div className="mt-8">
              <ContactBar dict={dict} locale={locale} intent="auto_repair" placement="hero" pagePath={pagePath} quoteHref={quoteHref} />
            </div>
            <p className="mt-3 text-xs font-semibold text-ink-400">{copy.lastUpdated}</p>
          </div>
        </Container>
      </section>

      {chatEnabled && (
        <RepairChat
          locale={locale}
          dict={dict}
          pagePath={pagePath}
          cardCopies={{
            en: getDictionary("en").repairChat,
            "zh-CN": getDictionary("zh-CN").repairChat,
            "zh-TW": getDictionary("zh-TW").repairChat,
          }}
        />
      )}

      <section id="pricing" className="bg-ink-50 py-6 sm:py-10">
        <Container className="space-y-3">
          <Collapsible title={copy.facts.title}>
            <dl className="grid gap-x-10 gap-y-4 md:grid-cols-2">
              {[
                ...copy.facts.items,
                { label: copy.facts.hoursLabel, value: dict.footer.hoursValue },
                { label: copy.facts.addressLabel, value: company.addressFull },
              ].map((fact) => (
                <div key={fact.label} className="grid grid-cols-[6.5rem_1fr] gap-3 sm:grid-cols-[8.5rem_1fr] sm:gap-4 border-b border-ink-100 pb-4 text-sm">
                  <dt className="font-semibold text-ink-900">{fact.label}</dt>
                  <dd className="leading-6 text-ink-600">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </Collapsible>
          <Collapsible title={copy.pricing.title}>
            <p className="max-w-2xl text-sm leading-7 text-ink-600 sm:text-base">{copy.pricing.intro}</p>
            <div className="mt-5 max-w-3xl rounded-2xl bg-ink-50 p-5 ring-1 ring-ink-100">
              <h3 className="font-semibold text-ink-900">{copy.pricing.laborTitle}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-600">{copy.pricing.laborBody}</p>
            </div>
            <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-ink-100">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-ink-100 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">{copy.pricing.columns.job}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{copy.pricing.columns.laborTime}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{copy.pricing.columns.total}</th>
                    <th scope="col" className="px-5 py-3 font-semibold">{copy.pricing.columns.examples}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {copy.pricing.rows.map((row) => (
                    <tr key={row.job}>
                      <th scope="row" className="px-5 py-4 font-semibold text-ink-900">{row.job}</th>
                      <td className="whitespace-nowrap px-5 py-4 tabular-nums text-ink-600">{row.laborTime}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums text-ink-900">{row.total}</td>
                      <td className="px-5 py-4 text-ink-600">{row.examples}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 max-w-3xl text-xs leading-6 text-ink-400">{copy.pricing.footnote}</p>
            <Link href={routePath(locale, "repairPrices")} className="mt-3 inline-flex text-sm font-semibold text-brand-600 hover:text-brand-700">
              {copy.priceGuide.linkLabel} →
            </Link>
          </Collapsible>
          <Collapsible title={copy.pricing.flat.title}>
            <p className="max-w-2xl text-sm leading-7 text-ink-600 sm:text-base">{copy.pricing.flat.intro}</p>
            <div className="mt-5">
              <FlatPriceTable labels={copy.pricing.flat} />
            </div>
            <p className="mt-4 max-w-3xl text-xs leading-6 text-ink-400">{copy.pricing.flat.note}</p>
          </Collapsible>
        </Container>
      </section>

      <section className="py-10 sm:py-20">
        <Container>
          <h2 className="text-2xl font-bold text-ink-900 sm:text-4xl">{copy.scope.title}</h2>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-ink-100 bg-white p-5 sm:p-7">
              <h3 className="text-xl font-semibold text-ink-900">{copy.scope.offeredTitle}</h3>
              <ul className="mt-4 space-y-2 text-sm leading-7 text-ink-600">
                {copy.scope.offered.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="text-brand-600">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 space-y-4 border-t border-ink-100 pt-5 text-sm leading-7">
                <div>
                  <h3 className="font-semibold text-ink-900">{copy.scope.quoteTitle}</h3>
                  <p className="mt-1 text-ink-600">{copy.scope.quoteBody}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-ink-900">{copy.scope.notOfferedTitle}</h3>
                  <p className="mt-1 text-ink-600">{copy.scope.notOfferedBody}</p>
                </div>
              </div>
            </div>
            <div id="ev" className="rounded-3xl bg-ink-50 p-5 sm:p-7">
              <h3 className="text-xl font-semibold text-ink-900">{copy.ev.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ink-600">{copy.ev.body}</p>
              <ul className="mt-4 space-y-2 text-sm leading-7 text-ink-600">
                {copy.ev.items.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span aria-hidden="true" className="text-brand-600">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-7 text-ink-500">{copy.ev.note}</p>
              <Link href={routePath(locale, "repairTeslaEv")} className="mt-5 inline-flex text-sm font-semibold text-brand-600 hover:text-brand-700">
                {copy.ev.linkLabel} →
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-ink-50 py-10 sm:py-20">
        <Container>
          <h2 className="text-2xl font-bold text-ink-900 sm:text-4xl">{copy.servicesTitle}</h2>
          <p className="mt-4 max-w-2xl leading-7 text-ink-600">{copy.servicesIntro}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {repairServiceSlugs.map((slug) => {
              const service = copy.services[slug];
              return (
                <Link key={slug} href={routePath(locale, repairRouteKeys[slug])} className="rounded-3xl border border-ink-100 bg-white p-5 sm:p-7 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg">
                  <h3 className="text-xl font-semibold text-ink-900">{service.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-600">{service.metaDescription}</p>
                  <span className="mt-5 inline-flex text-sm font-semibold text-brand-600">{dict.cta.learnMore} →</span>
                </Link>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-20">
        <Container>
          <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.whyTitle}</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {copy.whyItems.map((item) => (
              <article key={item.title} className="rounded-2xl bg-white p-6 ring-1 ring-ink-100">
                <h3 className="font-semibold text-ink-900">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-600">{item.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-12 max-w-3xl">
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.serviceAreaTitle}</h2>
            <p className="mt-4 leading-7 text-ink-600">{copy.serviceAreaBody}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {copy.serviceAreaPlaces.map((place) => (
                <li key={place} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">{place}</li>
              ))}
            </ul>
          </div>
          <div className="mt-12 max-w-4xl">
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.faqTitle}</h2>
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

      <section className="py-10 sm:py-20">
        <Container>
          <div className="rounded-3xl bg-dark-hero p-6 text-white sm:p-12">
            <h2 className="text-2xl font-bold sm:text-3xl">{copy.ctaTitle}</h2>
            <p className="mt-4 max-w-2xl leading-7 text-ink-200">{copy.ctaBody}</p>
            <div className="mt-7">
              <ContactBar dict={dict} locale={locale} intent="auto_repair" placement="middle" pagePath={pagePath} theme="dark" quoteHref={quoteHref} />
            </div>
          </div>
        </Container>
      </section>
      </div>
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
