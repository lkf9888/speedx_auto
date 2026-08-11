# SPEEDX AUTO GEO Two-Pillar Growth Design

Date: 2026-08-11

Status: Approved design

Repository: `lkf9888/speedx_auto`
Primary market: British Columbia, Canada

## 1. Objective

Improve SPEEDX AUTO's eligibility, clarity, trust, and conversion performance when prospective customers use Google Search, Gemini, ChatGPT, and other search or AI-assisted discovery tools.

The first 90-day acquisition priorities are:

1. Vehicle owners seeking hands-off Turo fleet management.
2. Customers seeking mechanical repair in Richmond, near YVR, or elsewhere in Metro Vancouver.

The site will keep WhatsApp, phone, and WeChat as the shortest conversion paths. It will not add a lead form in this phase.

## 2. Business Scope and Verified Claims

### Service areas

- Vehicle hosting: Metro Vancouver and qualifying vehicle owners elsewhere in British Columbia.
- Mechanical repair: Richmond, the YVR area, and Metro Vancouver.

### Owner-confirmed claims

The business owner confirmed that the following existing claims are current and factually supportable:

- SPEEDX is BC's number-one Turo host by the business's stated fleet and trip-volume basis.
- More than 100 vehicles are under management.
- SPEEDX has the largest Turo fleet in British Columbia by the business's stated basis.
- SPEEDX offers the lowest management fees by the business's stated comparison basis.
- SPEEDX is a licensed auto service center.
- SPEEDX supports 24/7 vehicle delivery.

Public-facing superlatives must be paired with a concise basis statement and a visible evidence link where possible. The Turo host profile is the primary public source for current trip volume and host reputation. Internal fleet records and licensing records remain the source for facts not displayed on Turo.

The "lowest management fees" claim may remain only when the business supplies a dated comparison basis that can be summarized on the page. If that basis is not available for publication, the site will use "competitive management fees" instead. This does not dispute the owner-confirmed fact; it keeps the public claim independently understandable.

The site must use one current trip-count value across visible text, metadata, and structured data. The value should be refreshed from the public Turo profile at implementation time rather than preserving the existing `4,500+` value.

## 3. Current-State Findings

The existing Next.js 16 site has a strong baseline: server-rendered text, three locales, a sitemap, permissive robots rules, responsive design, direct contact links, and LocalBusiness-derived JSON-LD.

The main defects are:

- Locale layouts set canonical, hreflang, and Open Graph URLs to the locale homepage. Child pages inherit those homepage URLs.
- The root document always emits `<html lang="en">`, including Chinese pages.
- Every page receives the same `AutoRental` structured data, even when the page is about hosting, auto repair, or another topic.
- The sitemap does not include the proposed repair service pages and has no meaningful update timestamp.
- The site has one broad services page but no high-intent mechanical repair landing pages.
- Contact links have no consistent analytics event model.
- WeChat is selectable text rather than a trackable copy action.
- The site loads Google Ads tag `AW-625073096`, but no GA4 Measurement ID or Google Tag Manager container is configured.
- Third-party business listings contain conflicting contact and address details. This weakens entity consistency and must be handled operationally alongside code changes.

## 4. Information Architecture

The homepage will continue to lead with vehicle hosting. Mechanical repair becomes the clear secondary business pillar with a first-screen action and its own content hub.

### Initial page set per locale

- `/{locale}` — homepage
- `/{locale}/hosting` — vehicle hosting authority page
- `/{locale}/auto-repair` — mechanical repair hub
- `/{locale}/auto-repair/maintenance` — routine maintenance
- `/{locale}/auto-repair/brakes` — brake service and repair
- `/{locale}/auto-repair/diagnostics` — engine and fault diagnostics
- `/{locale}/auto-repair/suspension` — suspension and steering repair
- `/{locale}/services` — cross-business service directory
- `/{locale}/about` — company evidence and operating model
- `/{locale}/contact` — contact methods, hours, and location
- `/{locale}/privacy` — analytics and advertising measurement notice

Supported locales remain `en`, `zh-CN`, and `zh-TW`. English slugs remain stable across locales to avoid a routing migration and to preserve the existing locale architecture.

Turo car rental and body repair remain supporting services in this phase. They must remain visible but must not compete with hosting and mechanical repair for primary homepage attention.

Case-study routes are deferred until the business supplies publishable facts, photographs, and customer authorization. The implementation must not ship fabricated or placeholder case studies.

## 5. Page Content Design

All core pages follow an answer-first structure:

1. A direct 40-80 word answer describing the service, customer, and geographic area.
2. Verifiable operating facts and evidence links.
3. Detailed service or process information.
4. High-intent questions written in the customer's language.
5. Direct WhatsApp, phone, and WeChat actions.
6. A visible last-updated date.

Content must be written naturally for each locale. Simplified and Traditional Chinese may share factual structure, but they must not be published as awkward word-for-word machine translations.

### Homepage

- Keep vehicle hosting as the primary headline and primary action.
- Add a clearly visible mechanical repair action in the first screen.
- Present the two business pillars before supporting services.
- Show evidence metrics with a visible basis and update date.
- Preserve the Turo profile link as an external proof source.
- Keep the map, hours, and direct contact methods.

### Vehicle hosting page

- Define the service and intended owners.
- Explain vehicle eligibility without inventing acceptance rules.
- Describe evaluation, agreement, inspection, listing, operations, maintenance, claims support, reporting, payout, and withdrawal.
- Explain revenue factors without promising a fixed return.
- Explain management fees without publishing an exact rate unless the business supplies one for publication.
- Explain protection and claims using current Turo source links and qualified wording.
- Include a concise basis for the number-one, largest-fleet, and trip-volume claims.
- Include visible FAQs and contact actions near the beginning, middle, and end.

### Mechanical repair hub

- Define the Richmond/YVR/Metro Vancouver service area.
- List supported repair categories and common symptoms.
- Explain inspection, estimate, authorization, repair, and handoff.
- Explain the practical advantage of operating and maintaining a high-volume fleet.
- Do not invent prices, completion times, certification titles, warranties, or customer reviews.
- Link to each dedicated repair service page.

### Repair service pages

Each page covers:

- What the service addresses.
- Symptoms that justify inspection.
- Components SPEEDX normally inspects or services.
- Safety signals that warrant stopping the vehicle and seeking help.
- The inspection and quotation process.
- The local service area.
- Five to eight visible high-intent FAQs.
- Direct contact actions.

Safety language must be conservative. It must direct customers to professional inspection rather than diagnose a vehicle remotely.

## 6. Metadata and Internationalization

Each indexable page must emit:

- A self-referencing canonical URL.
- Locale alternates pointing to the equivalent route in `en`, `zh-CN`, and `zh-TW`.
- An `x-default` alternate pointing to the English equivalent.
- Page-specific title, description, Open Graph URL, Open Graph title, and Open Graph description.
- A locale-appropriate `<html lang>` value.

The implementation should centralize route-aware metadata generation so new pages cannot accidentally inherit homepage canonical data.

The sitemap must include every route-locale combination, correct language alternates, and a meaningful `lastModified` value. Robots rules remain publicly permissive. A small factual `llms.txt` will summarize the company and main canonical pages, but it is not treated as a ranking mechanism or a substitute for indexable content.

## 7. Structured Data Design

Structured data will use a connected JSON-LD `@graph` with stable `@id` values.

### Site-wide entities

- `Organization`
- `LocalBusiness` expressed with applicable `AutoRental` and `AutoRepair` types
- `WebSite`

### Page-level entities

- `WebPage` for every page
- `Service` for hosting and each repair service page
- `FAQPage` only when all marked-up questions and answers are visible on that page
- `BreadcrumbList` on nested pages
- `VideoObject` on the homepage for the visible SPEEDX video

The graph will connect services to the business provider and web pages through stable IDs. Visible text and structured data must use matching names, phone, address, hours, service areas, URLs, and claims. No self-authored aggregate rating markup will be added unless it becomes eligible under applicable search guidelines.

## 8. Contact Conversion Design

The site will not add a form. The conversion path stays direct:

- WhatsApp opens the existing `wa.me` destination.
- Phone opens the existing `tel:` destination.
- WeChat becomes a button that copies `SPEEDX2020`, shows clear success feedback, and records the action.
- Email may remain available as a secondary method.

Contact actions appear in the hero, relevant mid-page sections, and closing calls to action. Hosting and repair pages also receive a compact mobile sticky contact bar that is hidden on larger screens and reserves enough page space to avoid covering content or controls.

## 9. Analytics Event Model

All contact actions emit one standard event:

`contact_click`

Required parameters:

- `method`: `whatsapp`, `phone`, `wechat`, or `email`
- `intent`: `hosting`, `auto_repair`, or `general`
- `locale`: `en`, `zh-CN`, or `zh-TW`
- `placement`: `hero`, `middle`, `footer`, or `sticky_mobile`
- `page_path`: the current path

A reusable client-side contact component will own event emission so pages do not implement analytics inconsistently.

The analytics layer must tolerate a missing Measurement ID without breaking navigation or contact actions. In that state it may enqueue a standard data-layer event, but no reporting claim may be made.

Before click counts can be viewed, the business must create a free GA4 property and supply its `G-...` Measurement ID. The site will read the ID from `NEXT_PUBLIC_GA_MEASUREMENT_ID`. The existing Google Ads tag remains in place. After GA4 is connected, WhatsApp, phone, and WeChat clicks will be configured as key events. Google Ads conversion import is a later account-level action, not a prerequisite for the website deployment.

The site will include a clear privacy notice describing analytics and advertising measurement. Analytics and advertising tags will use Google Consent Mode v2 with consent denied by default and a localized accept-or-decline choice. Declining measurement must not block or delay contact actions.

## 10. External Entity Consistency

Code changes alone cannot resolve conflicting third-party profiles. An operational checklist will accompany the implementation for:

- Google Business Profile
- Turo host profile
- BBB profile
- iTalkBB listing
- Other material local directories

The canonical company record is:

- Name: SPEEDX AUTO
- Address: 2980 Number 3 Rd, Richmond, BC V6X 2B3
- Phone: +1 (778) 917-0710
- Email: speedxrentalcar@gmail.com
- WeChat: SPEEDX2020
- Website: https://speedxrental.com

Any correction to a third-party profile is an external account action and requires the relevant account access. The website must not imply that these external corrections are complete until each profile is visibly updated.

## 11. Implementation Boundaries

### In scope

- Metadata and locale fixes
- Page-specific connected JSON-LD
- New mechanical repair hub and four service pages in three locales
- Hosting and homepage content restructuring
- Direct-contact interaction improvements
- Contact click event layer
- Sitemap and robots review
- Factual `llms.txt`
- Privacy notice for measurement disclosure
- Localized analytics consent control
- Automated and manual verification
- External entity correction checklist

### Out of scope

- Lead forms, CRM, or appointment scheduling
- Fabricated testimonials, reviews, prices, certifications, or case studies
- Guaranteed AI recommendations or ranking promises
- Automated posting to third-party directories
- Google Ads campaign changes
- Publishing exact hosting fees or earnings guarantees without new owner-supplied facts

## 12. Error Handling and Resilience

- Contact links must work even when analytics fails or is blocked.
- WeChat copy failure must leave the ID visible and selectable.
- Missing GA configuration must not cause runtime errors.
- Invalid locales continue to return the existing not-found behavior.
- Structured data serialization must not accept unescaped user-controlled input.
- External maps, Turo, and video failures must not hide core service text or contact methods.
- Third-party scripts remain deferred or lazy where possible to protect page performance.

## 13. Verification

### Repository checks

- `npm ci`
- `npm run lint`
- `npm run build`

### Metadata checks

- Every route returns HTTP 200.
- Every page has one self-canonical URL.
- Every page has exact locale-equivalent hreflang URLs plus `x-default`.
- Open Graph URLs match canonical URLs.
- HTML language values match the locale.
- The sitemap contains all intended pages and no nonexistent pages.

### Structured data checks

- JSON parses successfully on every route.
- Stable IDs connect the business, page, and service entities.
- FAQ markup matches visible questions and answers.
- Business name, address, phone, hours, and source links match visible content.

### Interaction checks

- WhatsApp opens the correct destination.
- Phone opens the correct number.
- WeChat copies the correct ID and shows feedback.
- Contact events contain the correct method, intent, locale, placement, and path.
- All contact actions still work when analytics is unavailable.

### Visual checks

- Desktop layout at a standard viewport.
- Mobile layout at 390 px width.
- First-screen actions remain clear in all three locales.
- Persistent mobile actions do not cover content or controls.

### Live verification

After merge and deployment:

- Re-fetch production HTML rather than relying on a successful build alone.
- Verify production canonical, hreflang, structured data, sitemap, and robots output.
- Verify contact actions on the live site.
- Confirm GA4 events in DebugView after a Measurement ID is configured.
- Request indexing for the homepage, hosting page, repair hub, and repair service pages in Search Console.

## 14. Rollout and Measurement

Development occurs on `codex/geo-two-pillar`. Changes will be presented in a pull request before merge. Deployment success means the production site visibly serves and persists the intended changes; a commit or deployment-start signal alone is not sufficient.

Measurement checkpoints are day 0, 30, 60, and 90. The review will compare:

- Contact clicks by method, intent, locale, placement, and page.
- Hosting versus repair conversion interest.
- Search Console impressions, clicks, and query themes.
- Indexed page coverage and canonical selection.
- A fixed set of ChatGPT and Gemini discovery prompts for brand mention, factual accuracy, and source citation.

AI recommendation tests are directional observations, not guaranteed or deterministic ranking measurements.

## 15. Success Criteria

The implementation is successful when:

- All intended pages are independently indexable with correct locale metadata.
- Hosting and mechanical repair have distinct, useful, evidence-backed content paths.
- Direct contact actions remain one step and are consistently measurable after GA4 configuration.
- Company facts are consistent across visible content, metadata, and structured data.
- The production site passes the defined technical, visual, and interaction checks.
- The business has a concrete external-profile correction checklist and a 90-day measurement baseline.
