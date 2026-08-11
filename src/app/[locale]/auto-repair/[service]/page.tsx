import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RepairServicePage } from "@/components/RepairServicePage";
import { StructuredData } from "@/components/StructuredData";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { buildPageMetadata } from "@/lib/seo";
import {
  absoluteRouteUrl,
  repairServiceSlugs,
  type RepairServiceSlug,
  type RouteKey,
} from "@/lib/site-routes";

const repairRouteKeys: Record<RepairServiceSlug, RouteKey> = {
  maintenance: "repairMaintenance",
  brakes: "repairBrakes",
  diagnostics: "repairDiagnostics",
  suspension: "repairSuspension",
};

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
  const copy = dict.autoRepair.services[service];
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
          description: copy.summary,
          areaServed: ["Richmond", "Metro Vancouver"],
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
