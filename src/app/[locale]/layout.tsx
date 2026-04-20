import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, localeHtmlLang, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { StructuredData } from "@/components/StructuredData";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: {
      default: `${dict.meta.siteName} — ${dict.meta.tagline}`,
      template: `%s · ${dict.meta.siteName}`,
    },
    description: dict.meta.description,
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [localeHtmlLang[l], `/${l}`])),
    },
    openGraph: {
      title: `${dict.meta.siteName} — ${dict.meta.tagline}`,
      description: dict.meta.description,
      url: `/${locale}`,
      siteName: dict.meta.siteName,
      locale: localeHtmlLang[locale],
      type: "website",
      images: [{ url: "/logo.png", width: 1200, height: 1200, alt: dict.meta.siteName }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${dict.meta.siteName} — ${dict.meta.tagline}`,
      description: dict.meta.description,
      images: ["/logo.png"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale as Locale);

  return (
    <>
      <StructuredData locale={locale} />
      <Nav locale={locale as Locale} dict={dict} />
      <main className="flex-1">{children}</main>
      <Footer locale={locale as Locale} dict={dict} />
    </>
  );
}
