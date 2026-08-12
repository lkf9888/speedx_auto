import { company } from "@/lib/company";
import {
  absoluteRouteUrl,
  type Locale,
  type RouteKey,
} from "@/lib/site-routes";

export interface FaqItem {
  question: string;
  answer: string;
}

export interface StructuredDataInput {
  locale: Locale;
  route: RouteKey;
  pageName: string;
  pageDescription: string;
  service?: {
    name: string;
    description: string;
    areaServed: string[];
  };
  breadcrumbs?: Array<{ name: string; url: string }>;
  faqs?: FaqItem[];
  video?: {
    name: string;
    description: string;
    thumbnailUrl: string;
    uploadDate: string;
    contentUrl?: string;
    embedUrl?: string;
  };
}

export type JsonLdNode = Record<string, unknown> & {
  "@id"?: string;
  "@type"?: string | string[];
};

export interface StructuredDataGraph {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

const BUSINESS_ID = "https://speedxrental.com/#business";
const WEBSITE_ID = "https://speedxrental.com/#website";

export function buildStructuredData(
  input: StructuredDataInput,
): StructuredDataGraph {
  const canonical = absoluteRouteUrl(input.locale, input.route);
  const webPageId = `${canonical}#webpage`;
  const serviceId = `${canonical}#service`;
  const faqId = `${canonical}#faq`;
  const breadcrumbId = `${canonical}#breadcrumb`;
  const videoId = `${canonical}#video`;

  const business: JsonLdNode = {
    "@id": BUSINESS_ID,
    "@type": ["LocalBusiness", "AutoRental", "AutoRepair"],
    name: company.name,
    alternateName: "SPEEDX AUTO 速驰汽车",
    url: "https://speedxrental.com",
    logo: "https://speedxrental.com/logo.png",
    image: "https://speedxrental.com/logo.png",
    telephone: company.phoneDisplay,
    email: company.email,
    foundingDate: String(company.foundedYear),
    address: {
      "@type": "PostalAddress",
      streetAddress: company.addressLine1,
      addressLocality: "Richmond",
      addressRegion: "BC",
      postalCode: "V6X 2B3",
      addressCountry: "CA",
    },
    areaServed: ["Richmond", "Metro Vancouver", "British Columbia"],
    openingHours: "Mo-Fr 10:00-18:00",
    sameAs: [company.turoHostUrl],
  };

  const website: JsonLdNode = {
    "@id": WEBSITE_ID,
    "@type": "WebSite",
    name: company.name,
    url: "https://speedxrental.com",
    publisher: { "@id": BUSINESS_ID },
    inLanguage: ["en", "zh-CN", "zh-TW"],
  };

  const webPage: JsonLdNode = {
    "@id": webPageId,
    "@type": "WebPage",
    url: canonical,
    name: input.pageName,
    description: input.pageDescription,
    inLanguage: input.locale,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": BUSINESS_ID },
    ...(input.service ? { mainEntity: { "@id": serviceId } } : {}),
    ...(input.breadcrumbs
      ? { breadcrumb: { "@id": breadcrumbId } }
      : {}),
    ...(input.video ? { video: { "@id": videoId } } : {}),
  };

  const graph: JsonLdNode[] = [business, website, webPage];

  if (input.service) {
    graph.push({
      "@id": serviceId,
      "@type": "Service",
      name: input.service.name,
      serviceType: input.service.name,
      description: input.service.description,
      areaServed: input.service.areaServed,
      provider: { "@id": BUSINESS_ID },
      mainEntityOfPage: { "@id": webPageId },
    });
  }

  if (input.faqs?.length) {
    graph.push({
      "@id": faqId,
      "@type": "FAQPage",
      isPartOf: { "@id": webPageId },
      mainEntity: input.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    });
  }

  if (input.breadcrumbs?.length) {
    graph.push({
      "@id": breadcrumbId,
      "@type": "BreadcrumbList",
      itemListElement: input.breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    });
  }

  if (input.video) {
    graph.push({
      "@id": videoId,
      "@type": "VideoObject",
      name: input.video.name,
      description: input.video.description,
      thumbnailUrl: input.video.thumbnailUrl,
      uploadDate: input.video.uploadDate,
      ...(input.video.contentUrl
        ? { contentUrl: input.video.contentUrl }
        : {}),
      ...(input.video.embedUrl ? { embedUrl: input.video.embedUrl } : {}),
      mainEntityOfPage: { "@id": webPageId },
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}
