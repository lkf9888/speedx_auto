# SPEEDX AUTO GEO Two-Pillar Implementation Plan

> **Required sub-skill:** Use `superpowers:executing-plans` to implement this plan task by task. If the user explicitly chooses delegated execution, use `superpowers:subagent-driven-development` instead.

**Goal:** Make SPEEDX AUTO easier for ChatGPT, Gemini, and search engines to understand and recommend for Turo fleet management and mechanical repair, while converting visitors through measurable WhatsApp, phone, and WeChat actions.

**Architecture:** Keep the existing Next.js App Router site and its three locale dictionaries. Add a centralized route/metadata layer, page-specific structured data, answer-first repair pages, privacy-aware analytics, and a production verifier. Hosting remains one strong authority page; repair gains one hub and four genuinely distinct service pages.

**Tech stack:** Next.js 16.2, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Google tag/Consent Mode v2, JSON-LD.

**Approved design:** `docs/superpowers/specs/2026-08-11-geo-two-pillar-design.md`

## Global constraints

- Preserve the current visual identity unless a change is required for readability or conversion.
- Publish all customer-facing additions in English, Simplified Chinese, and Traditional Chinese.
- Keep the existing Google Ads destination `AW-625073096` active.
- Do not invent prices, turnaround times, certifications, guarantees, reviews, or case studies.
- Keep strong factual claims only when their evidence and comparison date can be shown. If a dated comparison for “lowest management fees” is unavailable, use “competitive management fees.”
- Treat a contact click as a lead signal, not a completed call, conversation, booking, or sale.
- A successful build is not a live launch. Production HTML and click events must be verified after deployment.
- Use test-driven development for code-bearing tasks: add a failing test, run it, implement the smallest complete change, then rerun relevant tests.

## Planned file structure

```text
src/
  app/
    [locale]/
      auto-repair/
        [service]/page.tsx
        page.tsx
      privacy/page.tsx
      layout.tsx
    layout.tsx                         # remove after locale layout becomes root
    robots.ts
    sitemap.ts
  components/
    AnalyticsScripts.tsx
    ConsentBanner.tsx
    ContactBar.tsx
    RepairServicePage.tsx
    StructuredData.tsx
  i18n/
    en.ts
    zh-CN.ts
    zh-TW.ts
    types.ts
  lib/
    analytics.ts
    consent.ts
    seo.ts
    site-routes.ts
    structured-data.ts
  types/
    global.d.ts
public/
  llms.txt
scripts/
  verify-production.mjs
tests/
  analytics.test.ts
  consent.test.ts
  contact-bar.test.tsx
  repair-copy.test.ts
  seo.test.ts
  sitemap.test.ts
  structured-data.test.ts
docs/
  geo/
    external-entity-checklist.md
    measurement-baseline.md
```

## Task 1: Establish the test harness and typed route catalog

**Files**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/lib/site-routes.ts`
- Create: `tests/site-routes.test.ts`

**Interfaces**

```ts
export const BASE_URL = "https://speedxrental.com";
export const CONTENT_LAST_MODIFIED = "2026-08-11";
export const locales = ["en", "zh-CN", "zh-TW"] as const;
export const repairServiceSlugs = [
  "maintenance",
  "brakes",
  "diagnostics",
  "suspension",
] as const;

export type Locale = (typeof locales)[number];
export type RepairServiceSlug = (typeof repairServiceSlugs)[number];
export type RouteKey = keyof typeof routePaths;

export function routePath(locale: Locale, route: RouteKey): string;
export function absoluteRouteUrl(locale: Locale, route: RouteKey): string;
export function localizedAlternates(route: RouteKey): Record<string, string>;
```

`routePaths` must contain exactly: `home`, `hosting`, `autoRepair`, `repairMaintenance`, `repairBrakes`, `repairDiagnostics`, `repairSuspension`, `services`, `about`, `contact`, and `privacy`.

**Steps**

1. Add exact dev dependencies compatible with the current React setup: `vitest@3.2.4`, `jsdom@26.1.0`, `@testing-library/react@16.3.0`, `@testing-library/jest-dom@6.6.3`, and `@testing-library/user-event@14.6.1`.
2. Add scripts:

   ```json
   {
     "test": "vitest run",
     "test:watch": "vitest"
   }
   ```

3. Configure Vitest for `jsdom`, the `@/*` alias, and `tests/setup.ts`.
4. Write failing route tests covering all 11 route keys, all three locales, absolute URLs, and alternates containing `en`, `zh-Hans`, `zh-Hant`, and `x-default`.
5. Run `npm test -- tests/site-routes.test.ts` and confirm the failure is caused by the missing route module.
6. Implement the typed catalog. `x-default` must point to the English version and the homepage path must end at `/{locale}` without a trailing slash.
7. Rerun the focused test, then `npm test`.
8. Commit: `test: add route catalog and test harness`.

## Task 2: Centralize metadata and emit the correct document language

**Files**

- Create: `src/lib/seo.ts`
- Create: `tests/seo.test.ts`
- Modify: `src/app/[locale]/layout.tsx`
- Delete: `src/app/layout.tsx`
- Modify: every page under `src/app/[locale]` to use the metadata helper

**Interface**

```ts
export function buildPageMetadata(input: {
  locale: Locale;
  route: RouteKey;
  title: string;
  description: string;
}): Metadata;
```

**Steps**

1. Add failing unit tests for a homepage and a nested repair page. Assert:
   - self-referencing canonical URL;
   - exact alternate URLs for the three locales and `x-default`;
   - page-specific Open Graph URL, title, and description;
   - no inherited homepage canonical on a subpage.
2. Run `npm test -- tests/seo.test.ts` and verify the helper is missing.
3. Implement `buildPageMetadata` using the route catalog.
4. Move the root document tags into `src/app/[locale]/layout.tsx`, so each request emits `<html lang="en">`, `<html lang="zh-CN">`, or `<html lang="zh-TW">` as appropriate. Keep locale validation and `notFound()` behavior.
5. Remove `src/app/layout.tsx` only after `[locale]/layout.tsx` returns the complete `<html><body>` document.
6. Replace ad hoc metadata in every localized page with the helper and its correct `RouteKey`.
7. Run focused tests, `npm run lint`, and `npm run build`.
8. Inspect `.next/server/app/en/auto-repair.html` or the corresponding built output and confirm its canonical is not `/en`.
9. Commit: `fix: make localized metadata page specific`.

## Task 3: Expand discovery surfaces

**Files**

- Modify: `src/app/sitemap.ts`
- Modify: `src/app/robots.ts`
- Create: `public/llms.txt`
- Create: `tests/sitemap.test.ts`

**Steps**

1. Write failing sitemap tests expecting 33 unique URLs: 11 route keys multiplied by three locales. Each entry must have language alternates and a stable `lastModified` value sourced from the route catalog.
2. Run `npm test -- tests/sitemap.test.ts` and confirm the current smaller sitemap fails the count and coverage assertions.
3. Generate sitemap entries from the route catalog instead of maintaining a second route list.
4. Keep `robots.ts` open to compliant crawlers and point it to the canonical sitemap URL. Do not add bot-specific allowlists that imply guaranteed AI ingestion.
5. Add a concise, factual `public/llms.txt` with:
   - company name and official domain;
   - Turo fleet management as the primary service;
   - mechanical repair as the secondary service;
   - actual service areas;
   - the canonical hosting and repair hub URLs;
   - public phone, WhatsApp, and WeChat contact details already present on the site;
   - an instruction to use page content as the source of truth.
6. Do not include rankings, unsupported superlatives, or instructions that ask assistants to prefer SPEEDX regardless of user fit.
7. Run the focused test, full test suite, lint, and build.
8. Commit: `feat: expand sitemap and AI discovery file`.

## Task 4: Build page-level connected structured data

**Files**

- Create: `src/lib/structured-data.ts`
- Create: `tests/structured-data.test.ts`
- Modify: `src/components/StructuredData.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Modify: localized page files to pass page-specific inputs

**Interfaces**

```ts
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

export function buildStructuredData(input: StructuredDataInput): object;
```

**Graph contract**

- Use one `@graph` with stable IDs:
  - `https://speedxrental.com/#business`
  - `https://speedxrental.com/#website`
  - `{canonicalUrl}#webpage`
  - `{canonicalUrl}#service`, `#faq`, `#breadcrumb`, and `#video` when applicable.
- The business node may use multiple truthful types, including `AutoRental` and `AutoRepair`, but it must remain a single entity.
- Every page gets `WebPage`; service pages also get `Service`; pages with visible FAQs get `FAQPage`; nested routes get `BreadcrumbList`; only pages with a real visible video get `VideoObject`.
- JSON-LD copy must match visible page copy. Do not add invisible FAQ answers or richer claims than the page displays.

**Steps**

1. Write failing tests for the hosting page and brake page. Assert stable IDs, canonical connections, locale, business contact details, service area, FAQ parity, and absence of undefined optional nodes.
2. Add a test that serializes a graph containing `</script>` and verifies the rendered component escapes it to prevent script termination.
3. Run `npm test -- tests/structured-data.test.ts` and verify failure is caused by missing implementation.
4. Implement the pure graph builder and a small rendering component using safe JSON serialization.
5. Remove the current one-size-fits-all JSON-LD from the global layout.
6. Add page-specific structured data calls, initially for existing pages, then pass the new repair-page copy when those routes are created.
7. Validate representative output with Schema.org Validator or Rich Results Test. Record warnings separately from errors; do not claim eligibility for rich results merely because JSON-LD parses.
8. Run tests, lint, and build.
9. Commit: `feat: add connected page structured data`.

## Task 5: Instrument direct contact actions

**Files**

- Create: `src/lib/analytics.ts`
- Create: `src/types/global.d.ts`
- Create: `tests/analytics.test.ts`
- Create: `tests/contact-bar.test.tsx`
- Modify: `src/components/ContactBar.tsx`
- Modify: all direct-contact call sites

**Interfaces**

```ts
export type ContactMethod = "whatsapp" | "phone" | "wechat" | "email";
export type ContactIntent = "hosting" | "auto_repair" | "general";
export type ContactPlacement = "hero" | "middle" | "footer" | "sticky_mobile";

export interface ContactClickEvent {
  method: ContactMethod;
  intent: ContactIntent;
  locale: Locale;
  placement: ContactPlacement;
  pagePath: string;
}

export function emitContactClick(event: ContactClickEvent): void;
```

`emitContactClick` must push this normalized object to `window.dataLayer`:

```ts
{
  event: "contact_click",
  method,
  intent,
  locale,
  placement,
  page_path: pagePath,
}
```

**Component contract**

```ts
interface ContactBarProps {
  dict: Dictionary;
  locale: Locale;
  intent: ContactIntent;
  placement: ContactPlacement;
  pagePath: string;
  variant?: "inline" | "sticky";
}
```

**Steps**

1. Add failing analytics tests for exact event names/parameters and for safe behavior when `window` or `dataLayer` is unavailable.
2. Add failing component tests that click WhatsApp and phone and assert one event per click.
3. Add a WeChat test that clicks the button, copies the real WeChat ID, changes visible text to localized success feedback, and emits one event. Mock both successful and rejected Clipboard API calls.
4. Run the focused tests and confirm current components do not meet the contract.
5. Implement the event helper without blocking navigation.
6. Convert WeChat from a non-actionable label into a button. On clipboard failure, keep the WeChat ID visibly selectable and show localized “copy manually” feedback.
7. Update every contact bar/button to pass page intent, placement, locale, and current localized path. Hosting routes use `hosting`; repair routes use `auto_repair`; generic pages use `general`.
8. Ensure keyboard focus, accessible labels, and a live region for copy status.
9. Run focused tests, the full suite, lint, and build.
10. Commit: `feat: track direct contact clicks`.

## Task 6: Add privacy-aware Google measurement

**Files**

- Create: `src/lib/consent.ts`
- Create: `src/components/AnalyticsScripts.tsx`
- Create: `src/components/ConsentBanner.tsx`
- Create: `tests/consent.test.ts`
- Modify: `src/app/[locale]/layout.tsx`
- Create: `src/app/[locale]/privacy/page.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/i18n/zh-TW.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Consent contract**

```ts
export const CONSENT_STORAGE_KEY = "speedx-consent-v1";
export type ConsentChoice = "granted" | "denied";

export function readConsent(): ConsentChoice | null;
export function saveConsent(choice: ConsentChoice): void;
export function applyGoogleConsent(choice: ConsentChoice): void;
```

**Steps**

1. Write failing tests for first visit, saved accept, saved decline, corrupt storage values, unavailable storage, and exact Google consent updates.
2. Run `npm test -- tests/consent.test.ts` and verify the missing module failure.
3. Implement Consent Mode v2 defaults before the external tag loads:

   ```ts
   ad_storage: "denied"
   analytics_storage: "denied"
   ad_user_data: "denied"
   ad_personalization: "denied"
   wait_for_update: 500
   ```

4. Add a localized consent banner with clear Accept and Decline controls and a privacy-page link. Do not use a preselected choice.
5. Move tag loading to `AnalyticsScripts`. Always preserve Google Ads destination `AW-625073096`; conditionally configure GA4 only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` matches `^G-[A-Z0-9]+$`.
6. Make a missing or invalid GA4 ID non-fatal. Document an empty `NEXT_PUBLIC_GA_MEASUREMENT_ID=` in `.env.example` instead of committing a real property ID.
7. Add a trilingual privacy page that explains the stored consent choice, Google measurement, contact-click parameters, retention at a high level, and how to change preference by clearing site data until a preference-management UI is added.
8. Add the privacy link to the footer and metadata/sitemap route catalog.
9. Manually verify in a clean browser profile:
   - consent defaults are denied before tag load;
   - Decline persists and does not grant analytics;
   - Accept persists and sends a consent update;
   - the existing Ads configuration remains present;
   - a configured GA4 property receives `contact_click` in DebugView.
10. Run tests, lint, and build.
11. Commit: `feat: add consent-aware analytics`.

## Task 7: Define and verify the trilingual repair content contract

**Files**

- Modify: `src/i18n/types.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/i18n/zh-TW.ts`
- Create: `tests/repair-copy.test.ts`

**Interface**

```ts
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
  faqs: FaqItem[];
  ctaTitle: string;
  ctaBody: string;
  lastUpdated: string;
}
```

The dictionary must expose `autoRepair` hub copy plus four records keyed by `RepairServiceSlug`.

**Content rules**

- Each page opens with a standalone 40–80 word English answer summary; Chinese equivalents should convey the same facts naturally rather than match word count mechanically.
- Describe likely symptoms and inspection scope without diagnosing an unseen vehicle.
- Explain that final recommendations and quotes follow inspection.
- Keep service areas consistent: Richmond/YVR and Metro Vancouver for repairs.
- Keep owner/fleet scope consistent: Metro Vancouver and qualifying BC owners for hosting.
- Use “updated August 11, 2026” in localized form.
- Every FAQ answer visible in JSON-LD must be visible on the page.
- Avoid copy that guarantees availability, completion time, price, savings, or a specific repair outcome.

**Steps**

1. Write failing tests that iterate over all locales and all four repair slugs.
2. Assert every required string is non-empty, arrays meet minimum useful lengths, every FAQ has a question and answer, and service-area wording is present.
3. Add an English summary word-count assertion of 40–80 words for the hub and each service page.
4. Add literal-safety assertions rejecting unsupported phrases such as guaranteed, same-day, cheapest, certified technicians, and fixed price unless the approved design or evidence file explicitly supports them.
5. Run `npm test -- tests/repair-copy.test.ts` and confirm dictionary shape failures.
6. Draft distinct, intent-matched content for:
   - maintenance and inspections;
   - brake inspection and repair;
   - check-engine and vehicle diagnostics;
   - suspension and steering inspection.
7. Translate for meaning and local search terminology, then verify no locale silently falls back to English.
8. Run the focused test and full suite.
9. Commit: `content: add trilingual repair service copy`.

## Task 8: Build the repair hub and four service routes

**Files**

- Create: `src/components/RepairServicePage.tsx`
- Create: `src/app/[locale]/auto-repair/page.tsx`
- Create: `src/app/[locale]/auto-repair/[service]/page.tsx`
- Modify: `src/components/Nav.tsx`
- Modify: `src/components/Footer.tsx`
- Modify: `src/components/ContactBar.tsx`

**Dynamic route contract**

```ts
export function generateStaticParams(): Array<{ locale: Locale; service: RepairServiceSlug }>;

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale; service: string }>;
}): Promise<Metadata>;
```

Map service slugs to route keys explicitly:

```ts
const repairRouteKeys: Record<RepairServiceSlug, RouteKey> = {
  maintenance: "repairMaintenance",
  brakes: "repairBrakes",
  diagnostics: "repairDiagnostics",
  suspension: "repairSuspension",
};
```

**Steps**

1. Add component tests for a service page: answer summary appears before detailed sections, FAQs render visibly, breadcrumbs link correctly, and all direct contacts emit `auto_repair` intent.
2. Run the focused component tests and confirm failure before adding the component.
3. Build `RepairServicePage` from typed dictionary data. Include:
   - semantic heading hierarchy;
   - answer-first summary;
   - symptoms, inspection scope, safety note, process, service area, FAQs, updated date;
   - contextual links to the repair hub and the other service pages;
   - WhatsApp, phone, and WeChat actions above the fold and near the conclusion.
4. Build the repair hub with a concise answer summary, proof points already supported by the business, links to all four services, FAQs, and contact actions.
5. Implement the dynamic service route with exact static params, `notFound()` for unknown slugs/locales, page-specific metadata, structured data, and breadcrumbs.
6. Add repair navigation without crowding mobile navigation. The primary menu label should lead to the hub; service links may live in a hub grid and footer.
7. Verify at 390×844 and desktop width:
   - no horizontal overflow;
   - sticky contact controls do not obscure content or consent controls;
   - WeChat feedback remains readable;
   - all service cards are keyboard reachable.
8. Run tests, lint, and build.
9. Commit: `feat: add localized auto repair pages`.

## Task 9: Reframe existing pages around the two conversion pillars

**Files**

- Modify: `src/app/[locale]/page.tsx`
- Modify: `src/app/[locale]/hosting/page.tsx`
- Modify: `src/app/[locale]/services/page.tsx`
- Modify: `src/app/[locale]/about/page.tsx`
- Modify: `src/app/[locale]/contact/page.tsx`
- Modify: relevant components and all three dictionaries

**Steps**

1. Update homepage metadata and the first visible section so a visitor and a machine can immediately distinguish:
   - primary: Turo vehicle hosting/fleet management;
   - secondary: mechanical repair in Richmond/YVR and Metro Vancouver.
2. Keep the homepage concise. Link to `/hosting` and `/auto-repair` rather than duplicating all detail.
3. Strengthen `/hosting` as the single authority page with:
   - a 40–80 word English answer summary and equivalent Chinese summaries;
   - qualifying owner/service-area scope;
   - operating process and owner responsibilities;
   - currently supportable evidence;
   - visible FAQs and direct contacts with `hosting` intent;
   - a dated factual-review line.
4. Refresh the public Turo trip count from the public profile during implementation. If it cannot be retrieved reliably, retain the last publicly verified count `5,150+`, include the verification date in the evidence record, and do not extrapolate.
5. Review every occurrence of “#1,” “largest,” “100+,” “lowest,” “licensed,” and “24/7.” Keep only claims that have an evidence note. Change “lowest management fees” to “competitive management fees” unless a dated, publishable comparison exists.
6. Reposition `/services` as a short routing page that points clearly to hosting and repair. It must not compete with the two pillar pages for the same query intent.
7. Make `/about` reinforce one business entity, real operational experience, service area, and the relationship between fleet hosting and in-house repair capability.
8. Make `/contact` lead with WhatsApp, phone, and a copyable WeChat ID. Email can remain secondary. Tag all actions with `general` intent and correct placement.
9. Add contextual internal links with descriptive anchor text; avoid generic repeated “learn more” anchors.
10. Check page-specific structured data and metadata after copy changes so visible and machine-readable claims remain identical.
11. Run literal searches for high-risk claims, review each match, then run tests, lint, and build.
12. Commit: `content: align site with hosting and repair pillars`.

## Task 10: Add production verification and operational GEO records

**Files**

- Create: `scripts/verify-production.mjs`
- Modify: `package.json`
- Create: `docs/geo/external-entity-checklist.md`
- Create: `docs/geo/measurement-baseline.md`

**Production verifier contract**

```bash
npm run verify:production -- https://speedxrental.com
```

The Node script must fetch representative pages in all three locales and fail with a non-zero exit code when any required condition is missing.

**Required assertions**

- HTTP 200 for homepage, hosting, repair hub, all four repair services, privacy, robots, sitemap, and `llms.txt`.
- One self-referencing canonical per HTML page.
- Correct `en`, `zh-Hans`, `zh-Hant`, and `x-default` alternate links.
- Page-specific `og:url`.
- Correct `<html lang>`.
- Every `application/ld+json` block parses as JSON and includes the page canonical in its graph.
- An answer summary and direct contact controls are present on the two pillar pages.
- Sitemap contains all expected localized canonical URLs.

**External entity checklist**

Create one row per profile/source, including at minimum Google Business Profile, Bing Places, Apple Business Connect, Turo public profile, BBB, major local directories currently ranking for the brand, and the website. Track:

- business name;
- address and service-area representation;
- phone;
- website URL;
- primary/secondary categories;
- hours;
- status restricted to `not checked`, `correction requested`, `updated`, or `verified live`;
- evidence URL and verification date.

Do not mark a correction as live merely because it was submitted.

**Measurement baseline**

Define a day 0/30/60/90 table for:

- contact clicks by method, intent, locale, placement, and page path;
- Google Search Console impressions, clicks, CTR, average position, and indexed-page count;
- Bing Webmaster Tools equivalents where available;
- AI-assistant referral sessions when referrer data is available;
- manually tested recommendation prompts, recorded as observations rather than guaranteed rankings;
- qualified leads and booked work, entered only from actual business records.

**Steps**

1. Implement the verifier with the built-in Node fetch/API and a small HTML extraction helper; do not add a heavyweight browser dependency for these static assertions.
2. Add `"verify:production": "node scripts/verify-production.mjs"`.
3. Test failure behavior against a local fixture or intentionally wrong base URL, then test against the local production server from `npm run build && npm start`.
4. Create the external entity and measurement documents with all statuses initially honest. Existing known inconsistencies must be recorded, not silently normalized in documentation.
5. Run tests, lint, build, and the local production verifier.
6. Commit: `test: add production GEO verification`.

## Task 11: Final review, draft PR, deployment, and live proof

**Files**

- Review every changed file
- Update: `README.md` if final setup commands differ
- Update: `docs/geo/measurement-baseline.md` with the actual launch date and property configuration status

**Pre-PR verification**

1. Confirm only task-related files changed:

   ```bash
   git status --short
   git diff --stat main...HEAD
   git diff --check main...HEAD
   ```

2. Run the complete clean-room gate:

   ```bash
   npm ci
   npm test
   npm run lint
   npm run build
   ```

3. Start the built application and run:

   ```bash
   npm run verify:production -- http://127.0.0.1:3000
   ```

4. Perform visual QA at desktop and 390×844 for English, Simplified Chinese, and Traditional Chinese on:
   - homepage;
   - hosting;
   - repair hub;
   - one repair detail page;
   - privacy page;
   - contact page.
5. Test each WhatsApp, phone, and WeChat action once per intent. Confirm one `contact_click` data-layer event per action and verify Clipboard failure fallback.
6. Review source HTML, not only the hydrated DOM, for canonical, alternates, page title, description, Open Graph URL, and JSON-LD.
7. Search for secrets and accidental property IDs before staging. A real GA4 ID belongs in deployment configuration, not source control.
8. Use `superpowers:requesting-code-review` for a final implementation review. Resolve findings or document why they are not applicable.
9. Commit any final corrections as focused commits; do not squash away useful test/content history unless the user requests it.

**Publication sequence**

1. Push `codex/geo-two-pillar`.
2. Open a draft pull request with:
   - the two business pillars;
   - route and structured-data changes;
   - contact-event schema;
   - consent behavior;
   - exact verification commands and results;
   - remaining operational dependencies, especially the real GA4 ID and external-profile corrections.
3. Review the deployment preview. Do not merge until the preview passes the production verifier and visual/contact QA.
4. After authorized merge/deployment, run the verifier against `https://speedxrental.com`.
5. Confirm live GA4 DebugView receives `contact_click` only after consent when a real measurement ID has been configured. If no GA4 property exists yet, report code readiness separately from live measurement readiness.
6. Confirm the public sitemap and `llms.txt` return 200 and request indexing in Google Search Console/Bing Webmaster Tools where the business has access.
7. Update the measurement baseline to day 0 and record each external-profile status accurately.

**Completion evidence**

The implementation is complete only when the handoff reports these states separately:

- code tests/build: pass or fail;
- draft PR: opened or not opened;
- preview deployment: verified or not verified;
- production deployment: live or not live;
- GA4 property: configured or missing;
- contact event: seen live or only locally verified;
- external listings: not checked, correction requested, updated, or verified live.

## Plan self-review checklist

- Every approved design section maps to at least one task.
- Every new route is present in metadata, sitemap, structured data, content, internal links, and production verification.
- Event names and parameter values are identical across types, tests, code, and measurement documentation.
- Locale identifiers are intentionally different where standards require it: URL/app locale `zh-CN` and `zh-TW`; hreflang `zh-Hans` and `zh-Hant`.
- Consent defaults occur before Google tag configuration, and a missing GA4 ID remains non-fatal.
- Strong claims have an evidence review step and a safe rewrite rule.
- No external listing, deployment, analytics signal, or AI recommendation is described as verified before direct evidence exists.
- Every code-bearing task has a failing-test step, focused verification, full verification, and a scoped commit.
