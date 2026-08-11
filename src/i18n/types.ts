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

export interface AutoRepairCopy {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  summary: string;
  servicesTitle: string;
  servicesIntro: string;
  whyTitle: string;
  whyItems: Array<{ title: string; body: string }>;
  serviceAreaTitle: string;
  serviceAreaBody: string;
  faqTitle: string;
  faqs: LocalizedFaqItem[];
  ctaTitle: string;
  ctaBody: string;
  lastUpdated: string;
  services: Record<RepairServiceSlug, RepairServiceCopy>;
}
