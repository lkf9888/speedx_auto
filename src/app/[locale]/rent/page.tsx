import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { RentalSiteFrame } from "@/components/RentalSiteFrame";
import { rentalSiteHref } from "@/lib/rental-site";
import { buildPageMetadata } from "@/lib/seo";

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
    route: "rent",
    title: dict.rent.metaTitle,
    description: dict.rent.metaDescription,
  });
}

/**
 * Direct booking, as a page of this site: the fleet, prices, checkout
 * and contract all come from the booking site (TATO, at
 * rent.speedxrental.com), framed under this site's nav.
 */
export default async function RentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <h1 className="sr-only">{dict.rent.metaTitle}</h1>
      <RentalSiteFrame locale={locale as Locale} title={dict.rent.frameTitle} />
      <noscript>
        <p className="px-4 py-6 text-center text-sm">
          <a href={rentalSiteHref(locale as Locale)} className="font-semibold underline">
            {dict.rent.openFull}
          </a>
        </p>
      </noscript>
    </>
  );
}
