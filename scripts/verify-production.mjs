#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const localeCatalog = [
  { locale: "en", lang: "en", hreflang: "en" },
  { locale: "zh-CN", lang: "zh-CN", hreflang: "zh-Hans" },
  { locale: "zh-TW", lang: "zh-TW", hreflang: "zh-Hant" },
];

const routeSuffixes = [
  "",
  "/hosting",
  "/auto-repair",
  "/auto-repair/maintenance",
  "/auto-repair/brakes",
  "/auto-repair/diagnostics",
  "/auto-repair/suspension",
  "/services",
  "/about",
  "/contact",
  "/privacy",
];

const answerMarkers = {
  "/en/hosting": "SPEEDX AUTO provides Turo fleet management",
  "/zh-CN/hosting": "SPEEDX AUTO 为大温地区",
  "/zh-TW/hosting": "SPEEDX AUTO 為大溫地區",
  "/en/auto-repair": "SPEEDX AUTO provides mechanical inspection",
  "/zh-CN/auto-repair": "SPEEDX AUTO 在列治文",
  "/zh-TW/auto-repair": "SPEEDX AUTO 在列治文",
};

export const localizedPages = localeCatalog.flatMap(({ locale, lang }) =>
  routeSuffixes.map((suffix) => ({
    path: `/${locale}${suffix}`,
    suffix,
    lang,
    marker: answerMarkers[`/${locale}${suffix}`],
    requiresContact: suffix === "/hosting" || suffix === "/auto-repair",
  })),
);

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tags(html, element) {
  return [...html.matchAll(new RegExp(`<${element}\\b[^>]*>`, "gi"))].map(
    ([tag]) => tag,
  );
}

function tagHasAttributes(tag, attributes) {
  return Object.entries(attributes).every(([name, value]) =>
    new RegExp(`\\b${name}=["']${escaped(value)}["']`, "i").test(tag),
  );
}

function matchingTags(html, element, attributes) {
  return tags(html, element).filter((tag) => tagHasAttributes(tag, attributes));
}

function jsonLdBlocks(html) {
  return [...html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )].map((match) => match[1]);
}

function expectedAlternates(suffix, canonicalOrigin) {
  const alternates = Object.fromEntries(
    localeCatalog.map(({ locale, hreflang }) => [
      hreflang,
      `${canonicalOrigin}/${locale}${suffix}`,
    ]),
  );
  alternates["x-default"] = `${canonicalOrigin}/en${suffix}`;
  return alternates;
}

export function validatePageDocument(
  html,
  {
    path,
    lang,
    marker,
    requiresContact = true,
    canonicalOrigin,
    suffix = path.replace(/^\/(?:en|zh-CN|zh-TW)/, ""),
  },
) {
  const errors = [];
  const expectedUrl = `${canonicalOrigin}${path}`;

  if (matchingTags(html, "html", { lang }).length !== 1) {
    errors.push(`html lang is not ${lang}`);
  }

  const canonicals = tags(html, "link").filter((tag) =>
    tagHasAttributes(tag, { rel: "canonical" }),
  );
  if (canonicals.length !== 1) {
    errors.push(`expected exactly one canonical but found ${canonicals.length}`);
  } else if (!tagHasAttributes(canonicals[0], { href: expectedUrl })) {
    errors.push(`canonical is not ${expectedUrl}`);
  }

  const alternateLinks = tags(html, "link").filter((tag) =>
    tagHasAttributes(tag, { rel: "alternate" }),
  );
  const alternates = expectedAlternates(suffix, canonicalOrigin);
  for (const [hreflang, href] of Object.entries(alternates)) {
    const matches = alternateLinks.filter((tag) =>
      tagHasAttributes(tag, { hreflang, href }),
    );
    if (matches.length !== 1) {
      errors.push(`hreflang ${hreflang} is not exactly ${href}`);
    }
  }
  if (alternateLinks.length !== 4) {
    errors.push(`expected exactly 4 hreflang links but found ${alternateLinks.length}`);
  }

  if (
    matchingTags(html, "meta", {
      property: "og:url",
      content: expectedUrl,
    }).length !== 1
  ) {
    errors.push(`og:url is not exactly ${expectedUrl}`);
  }

  const blocks = jsonLdBlocks(html);
  const parsedGraphs = [];
  if (blocks.length === 0) {
    errors.push("JSON-LD missing");
  }
  for (const block of blocks) {
    try {
      parsedGraphs.push(JSON.parse(block));
    } catch {
      errors.push("JSON-LD is not valid JSON");
    }
  }
  const hasCanonicalWebPage = parsedGraphs.some((data) =>
    Array.isArray(data?.["@graph"]) &&
    data["@graph"].some(
      (node) =>
        node?.["@type"] === "WebPage" &&
        node?.url === expectedUrl &&
        node?.["@id"] === `${expectedUrl}#webpage`,
    ),
  );
  if (blocks.length > 0 && !hasCanonicalWebPage) {
    errors.push("JSON-LD missing canonical WebPage node");
  }

  if (requiresContact) {
    if (!/href=["']tel:\+17789170710["']/i.test(html)) {
      errors.push("phone contact link missing");
    }
    if (!/href=["']https:\/\/wa\.me\/17789170710["']/i.test(html)) {
      errors.push("WhatsApp contact link missing");
    }
  }
  if (marker && !html.includes(marker)) {
    errors.push(`answer marker missing: ${marker}`);
  }

  return errors;
}

export function validateSitemap(xml, paths, canonicalOrigin) {
  const errors = [];
  const actualUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1],
  );
  const expectedUrls = paths.map((path) => `${canonicalOrigin}${path}`);

  if (actualUrls.length !== expectedUrls.length) {
    errors.push(
      `sitemap expected ${expectedUrls.length} URLs but found ${actualUrls.length}`,
    );
  }
  for (const url of expectedUrls) {
    if (!actualUrls.includes(url)) errors.push(`sitemap missing ${url}`);
  }
  for (const url of actualUrls) {
    if (!expectedUrls.includes(url)) errors.push(`sitemap has unexpected ${url}`);
  }
  if (new Set(actualUrls).size !== actualUrls.length) {
    errors.push("sitemap contains duplicate URLs");
  }
  return errors;
}

async function fetchText(baseUrl, path, failures) {
  try {
    const response = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
    if (!response.ok) {
      failures.push(`${path}: HTTP ${response.status}`);
      return null;
    }
    return response.text();
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function verifyProduction({
  baseUrl = process.env.VERIFY_BASE_URL || "https://speedxrental.com",
  canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://speedxrental.com",
} = {}) {
  const failures = [];

  for (const page of localizedPages) {
    const html = await fetchText(baseUrl, page.path, failures);
    if (html === null) continue;
    for (const error of validatePageDocument(html, { ...page, canonicalOrigin })) {
      failures.push(`${page.path}: ${error}`);
    }
  }

  const robots = await fetchText(baseUrl, "/robots.txt", failures);
  if (robots !== null && !robots.includes(`${canonicalOrigin}/sitemap.xml`)) {
    failures.push("/robots.txt: canonical sitemap URL missing");
  }

  const llms = await fetchText(baseUrl, "/llms.txt", failures);
  if (llms !== null) {
    for (const fact of [canonicalOrigin, "Turo", "auto repair", "SPEEDX2020"]) {
      if (!llms.toLowerCase().includes(fact.toLowerCase())) {
        failures.push(`/llms.txt: missing ${fact}`);
      }
    }
  }

  const sitemap = await fetchText(baseUrl, "/sitemap.xml", failures);
  if (sitemap !== null) {
    failures.push(
      ...validateSitemap(
        sitemap,
        localizedPages.map((page) => page.path),
        canonicalOrigin,
      ),
    );
  }

  return failures;
}

async function main() {
  const baseUrl =
    process.argv[2] ||
    process.env.VERIFY_BASE_URL ||
    "https://speedxrental.com";
  const failures = await verifyProduction({ baseUrl });

  if (failures.length > 0) {
    console.error(`Production verification failed (${failures.length} checks):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Production verification passed for ${localizedPages.length} localized pages, robots.txt, llms.txt, and sitemap.xml at ${baseUrl}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
