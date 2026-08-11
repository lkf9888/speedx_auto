#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const representativePages = [
  { path: "/en", lang: "en", marker: "Two ways SPEEDX AUTO can help" },
  {
    path: "/en/hosting",
    lang: "en",
    marker: "SPEEDX AUTO provides Turo fleet management",
  },
  {
    path: "/zh-CN/hosting",
    lang: "zh-CN",
    marker: "SPEEDX AUTO 为大温地区",
  },
  {
    path: "/zh-TW/auto-repair",
    lang: "zh-TW",
    marker: "SPEEDX AUTO 在列治文",
  },
  {
    path: "/en/auto-repair/brakes",
    lang: "en",
    marker: "SPEEDX AUTO inspects brake noise",
  },
  { path: "/en/contact", lang: "en", marker: "Get In Touch" },
  {
    path: "/en/privacy",
    lang: "en",
    marker: "Privacy and Measurement Choices",
  },
];

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAttribute(html, element, name, value) {
  const tagPattern = new RegExp(`<${element}\\b[^>]*>`, "gi");
  const attributePattern = new RegExp(
    `\\b${name}=["']${escaped(value)}["']`,
    "i",
  );
  return [...html.matchAll(tagPattern)].some(([tag]) => attributePattern.test(tag));
}

function hasLink(html, attributes) {
  const tags = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag);
  return tags.some((tag) =>
    Object.entries(attributes).every(([name, value]) =>
      new RegExp(`\\b${name}=["']${escaped(value)}["']`, "i").test(tag),
    ),
  );
}

function jsonLdBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    blocks.push(match[1]);
  }
  return blocks;
}

export function validatePageDocument(
  html,
  { path, lang, marker, canonicalOrigin },
) {
  const errors = [];
  const expectedUrl = `${canonicalOrigin}${path}`;

  if (!hasAttribute(html, "html", "lang", lang)) {
    errors.push(`html lang is not ${lang}`);
  }
  if (!hasLink(html, { rel: "canonical", href: expectedUrl })) {
    errors.push(`canonical missing ${expectedUrl}`);
  }
  for (const alternate of ["en", "zh-Hans", "zh-Hant", "x-default"]) {
    if (!hasLink(html, { rel: "alternate", hreflang: alternate })) {
      errors.push(`hreflang missing ${alternate}`);
    }
  }
  if (!hasAttribute(html, "meta", "property", "og:url") || !html.includes(expectedUrl)) {
    errors.push(`og:url missing ${expectedUrl}`);
  }

  const blocks = jsonLdBlocks(html);
  if (blocks.length === 0) {
    errors.push("JSON-LD missing");
  } else {
    for (const block of blocks) {
      try {
        JSON.parse(block);
      } catch {
        errors.push("JSON-LD is not valid JSON");
      }
    }
  }

  if (!/href=["']tel:\+17789170710["']/i.test(html)) {
    errors.push("phone contact link missing");
  }
  if (!/href=["']https:\/\/wa\.me\/17789170710["']/i.test(html)) {
    errors.push("WhatsApp contact link missing");
  }
  if (!html.includes(marker)) {
    errors.push(`answer marker missing: ${marker}`);
  }

  return errors;
}

export function validateSitemap(xml, paths, canonicalOrigin) {
  const errors = [];
  for (const path of paths) {
    const expectedUrl = `${canonicalOrigin}${path}`;
    if (!xml.includes(`<loc>${expectedUrl}</loc>`)) {
      errors.push(`sitemap missing ${expectedUrl}`);
    }
  }
  return errors;
}

export async function verifyProduction({
  baseUrl = process.env.VERIFY_BASE_URL || "https://speedxrental.com",
  canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL || "https://speedxrental.com",
} = {}) {
  const failures = [];

  for (const page of representativePages) {
    const response = await fetch(`${baseUrl}${page.path}`, { redirect: "follow" });
    if (!response.ok) {
      failures.push(`${page.path}: HTTP ${response.status}`);
      continue;
    }
    const html = await response.text();
    for (const error of validatePageDocument(html, { ...page, canonicalOrigin })) {
      failures.push(`${page.path}: ${error}`);
    }
  }

  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  if (!sitemapResponse.ok) {
    failures.push(`/sitemap.xml: HTTP ${sitemapResponse.status}`);
  } else {
    const sitemap = await sitemapResponse.text();
    failures.push(
      ...validateSitemap(
        sitemap,
        representativePages.map((page) => page.path),
        canonicalOrigin,
      ),
    );
  }

  return failures;
}

async function main() {
  const baseUrl = process.argv[2] || process.env.VERIFY_BASE_URL || "https://speedxrental.com";
  const failures = await verifyProduction({ baseUrl });

  if (failures.length > 0) {
    console.error(`Production verification failed (${failures.length} checks):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Production verification passed for ${representativePages.length} pages and sitemap.xml at ${baseUrl}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
