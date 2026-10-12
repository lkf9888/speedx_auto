import type { RepairServiceSlug } from "@/lib/site-routes";

export interface LocalizedFaqItem {
  question: string;
  answer: string;
}

export interface RepairServiceCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  summary: string;
  symptomsTitle: string;
  symptoms: string[];
  inspectionsTitle: string;
  inspections: string[];
  safetyTitle: string;
  safetyBody: string;
  processTitle: string;
  process: string[];
  serviceAreaTitle: string;
  serviceAreaBody: string;
  faqTitle: string;
  faqs: LocalizedFaqItem[];
  ctaTitle: string;
  ctaBody: string;
  lastUpdated: string;
}

export interface RepairFact {
  label: string;
  value: string;
}

export interface RepairPriceRow {
  job: string;
  laborTime: string;
  total: string;
  examples: string;
}

export interface AutoRepairCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  summary: string;
  /** Plain service name and type for structured data. */
  serviceName: string;
  serviceType: string;
  facts: {
    title: string;
    items: RepairFact[];
    hoursLabel: string;
    addressLabel: string;
  };
  pricing: {
    title: string;
    intro: string;
    laborRateLabel: string;
    laborTitle: string;
    laborBody: string;
    columns: RepairPriceRow;
    rows: RepairPriceRow[];
    footnote: string;
  };
  scope: {
    title: string;
    offeredTitle: string;
    offered: string[];
    quoteTitle: string;
    quoteBody: string;
    notOfferedTitle: string;
    notOfferedBody: string;
  };
  ev: {
    title: string;
    body: string;
    items: string[];
    note: string;
  };
  servicesTitle: string;
  servicesIntro: string;
  whyTitle: string;
  whyItems: Array<{ title: string; body: string }>;
  serviceAreaTitle: string;
  serviceAreaBody: string;
  serviceAreaPlaces: string[];
  faqTitle: string;
  faqs: LocalizedFaqItem[];
  ctaTitle: string;
  ctaBody: string;
  lastUpdated: string;
  services: Record<RepairServiceSlug, RepairServiceCopy>;
}
