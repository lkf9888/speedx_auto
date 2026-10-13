import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RepairServicePage } from "@/components/RepairServicePage";
import { StructuredData } from "@/components/StructuredData";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { WALK_IN_LABOR_RATE } from "@/lib/repair-chat/pricing";
import { buildPageMetadata } from "@/lib/seo";
import {
  absoluteRouteUrl,
  repairRouteKeys,
  repairServiceSlugs,
  type RepairServiceSlug,
} from "@/lib/site-routes";

function isRepairServiceSlug(value: string): value is RepairServiceSlug {
  return (repairServiceSlugs as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return locales.flatMap((locale) =>
    repairServiceSlugs.map((service) => ({ locale, service })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; service: string }>;
}): Promise<Metadata> {
  const { locale, service } = await params;
  if (!isLocale(locale) || !isRepairServiceSlug(service)) return {};
  const copy = getDictionary(locale).autoRepair.services[service];
  return buildPageMetadata({
    locale,
    route: repairRouteKeys[service],
    title: copy.metaTitle,
    description: copy.metaDescription,
  });
}

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ locale: string; service: string }>;
}) {
  const { locale, service } = await params;
  if (!isLocale(locale) || !isRepairServiceSlug(service)) notFound();
  const dict = getDictionary(locale as Locale);
  const hub = dict.autoRepair;
  const copy = hub.services[service];
  const route = repairRouteKeys[service];

  return (
    <>
      <StructuredData
        locale={locale}
        route={route}
        pageName={copy.title}
        pageDescription={copy.summary}
        service={{
          name: copy.title,
          serviceType: copy.serviceType,
          description: copy.summary,
          areaServed: hub.serviceAreaPlaces,
          hourlyRate: {
            price: WALK_IN_LABOR_RATE,
            currency: "CAD",
            description: hub.pricing.laborRateLabel,
          },
        }}
        breadcrumbs={[
          { name: dict.nav.home, url: absoluteRouteUrl(locale, "home") },
          { name: dict.nav.autoRepair, url: absoluteRouteUrl(locale, "autoRepair") },
          { name: copy.title, url: absoluteRouteUrl(locale, route) },
        ]}
        faqs={copy.faqs}
      />
      <RepairServicePage locale={locale} dict={dict} serviceSlug={service} />
    </>
  );
}
