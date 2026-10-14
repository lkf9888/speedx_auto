import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactBar } from "@/components/ContactBar";
import { Container } from "@/components/Container";
import { TrackedContactLink } from "@/components/TrackedContactLink";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { whatsappLink } from "@/lib/company";
import { fillPriceGuide, priceGuideValues } from "@/lib/repair-price-guide";
import {
  BASE_URL,
  landingPath,
  repairLandingSlugs,
  routePath,
  type RepairLandingSlug,
  type RouteKey,
} from "@/lib/site-routes";

/** The organic page each ad landing page sends readers to for more detail. */
const detailRoute: Record<RepairLandingSlug, RouteKey> = {
  "winter-tires": "repairMaintenance",
  "tesla-ev": "repairTeslaEv",
};

function isLandingSlug(value: string): value is RepairLandingSlug {
  return (repairLandingSlugs as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return locales.flatMap((locale) => repairLandingSlugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !isLandingSlug(slug)) return {};
  const copy = getDictionary(locale).autoRepair.landing[slug];
  const values = priceGuideValues();
  const title = fillPriceGuide(copy.metaTitle, values);
  const description = fillPriceGuide(copy.metaDescription, values);
  const url = `${BASE_URL}${landingPath(locale, slug)}`;
  // Ad landing pages stay out of search: the organic service pages cover the same topics.
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "SPEEDX AUTO", type: "website", images: [{ url: "/logo.png" }] },
  };
}

export default async function RepairLandingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !isLandingSlug(slug)) notFound();
  const dict = getDictionary(locale as Locale);
  const copy = dict.autoRepair.landing[slug];
  const pagePath = landingPath(locale, slug);
  const values = priceGuideValues();
  const fill = (text: string) => fillPriceGuide(text, values);
  const whatsappHref = `${whatsappLink}?text=${encodeURIComponent(copy.whatsappText)}`;

  return (
    <>
      <section className="bg-hero-gradient">
        <Container className="py-10 sm:py-20">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-700">
              {copy.eyebrow}
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-900 sm:text-5xl">{fill(copy.title)}</h1>
            <p data-testid="answer-summary" className="mt-4 leading-7 text-ink-600 sm:mt-6 sm:text-lg sm:leading-8">
              {fill(copy.subtitle)}
            </p>
          </div>
          <dl className="mt-7 grid max-w-3xl grid-cols-3 gap-2 sm:gap-4">
            {copy.highlights.map((item) => (
              <div key={item.label} className="rounded-2xl bg-white p-3 ring-1 ring-ink-100 sm:p-5">
                <dt className="sr-only">{item.label}</dt>
                <dd className="text-2xl font-bold tabular-nums text-ink-900 sm:text-4xl">{fill(item.value)}</dd>
                <dd className="mt-1 text-xs leading-5 text-ink-500 sm:text-sm">{item.label}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-7 max-w-3xl space-y-4">
            <TrackedContactLink
              href={whatsappHref}
              method="whatsapp"
              intent="auto_repair"
              locale={locale}
              placement="hero"
              pagePath={pagePath}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="landing-whatsapp"
              className="flex w-full items-center justify-center rounded-full bg-[#1f9d55] px-6 py-4 text-base font-bold text-white shadow-lg hover:bg-[#188a49] sm:inline-flex sm:w-auto"
            >
              {copy.whatsappLabel}
            </TrackedContactLink>
            <ContactBar
              dict={dict}
              locale={locale}
              intent="auto_repair"
              placement="hero"
              pagePath={pagePath}
              whatsappText={copy.whatsappText}
            />
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-16">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.priceTitle}</h2>
            <div className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-ink-100">
                  {copy.priceRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-4 py-3 font-medium text-ink-700 sm:px-5">{row.label}</th>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-900 sm:px-5">{fill(row.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-6 text-ink-400">{fill(copy.note)}</p>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-ink-900 sm:text-3xl">{copy.pointsTitle}</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {copy.points.map((point) => (
                <article key={point.title} className="rounded-2xl bg-ink-50 p-5">
                  <h3 className="font-semibold text-ink-900">{point.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-600">{fill(point.body)}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-ink-50 py-10 sm:py-16">
        <Container className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold text-ink-900">{copy.stepsTitle}</h2>
            <ol className="mt-5 space-y-3">
              {copy.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-ink-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="leading-7">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-ink-900">{copy.trustTitle}</h2>
            <ul className="mt-5 space-y-2 text-ink-700">
              {copy.trust.map((item) => (
                <li key={item} className="flex gap-3 leading-7">
                  <span aria-hidden className="text-brand-600">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
              <Link href={routePath(locale, detailRoute[slug])} className="text-brand-600 hover:text-brand-700">
                {copy.learnMoreLabel} →
              </Link>
              <Link href={routePath(locale, "repairPrices")} className="text-brand-600 hover:text-brand-700">
                {dict.autoRepair.priceGuide.linkLabel} →
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-16">
        <Container>
          <div className="rounded-3xl bg-dark-hero p-6 text-white sm:p-12">
            <h2 className="text-2xl font-bold sm:text-3xl">{copy.ctaTitle}</h2>
            <p className="mt-3 max-w-2xl leading-7 text-ink-200">{copy.ctaBody}</p>
            <div className="mt-6">
              <ContactBar
                dict={dict}
                locale={locale}
                intent="auto_repair"
                placement="middle"
                pagePath={pagePath}
                theme="dark"
                whatsappText={copy.whatsappText}
                quoteHref={`${routePath(locale, "autoRepair")}#estimate`}
              />
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
        whatsappText={copy.whatsappText}
      />
    </>
  );
}
