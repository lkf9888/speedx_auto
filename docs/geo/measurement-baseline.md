# GEO measurement baseline

Baseline date: 2026-08-11  
Deployment status at baseline: code complete; production deployment and live analytics verification pending

## Current measurement state

- Contact interactions use one event name: `contact_click`.
- Event fields are `method`, `intent`, `locale`, `placement`, and `page_path`.
- Tracked methods are WhatsApp, phone, WeChat copy, and email.
- Consent Mode v2 starts with analytics and advertising storage denied and updates after the visitor chooses.
- The existing Google Ads destination `AW-625073096` remains in the site.
- GA4 support is implemented but is not live until `NEXT_PUBLIC_GA_MEASUREMENT_ID` contains a valid property ID and a production visit is verified in DebugView or Realtime.
- A contact click is an intent signal, not proof of a conversation, qualified lead, booking, repair order, or vehicle-management agreement.

## Funnel definitions

| Stage | Definition | Source |
| --- | --- | --- |
| Discover | Search impression, AI referral, direct visit, or external-profile visit | Search Console, Bing Webmaster Tools, GA4 when configured, external profile dashboards |
| Engage | Hosting or repair landing-page view | GA4 when configured |
| Contact intent | `contact_click` event | GA4 / Google tag after consent and live verification |
| Qualified lead | Team confirms a relevant vehicle-owner or repair inquiry | Manual lead log or CRM |
| Customer | Signed hosting agreement or paid repair order | Business records |

The primary GEO conversion is a qualified vehicle-owner lead. The secondary conversion is a qualified mechanical-repair lead. Report the two intents separately.

## Day 0 — deployment and instrumentation

- Save the production deployment URL and commit SHA.
- Run `npm run verify:production -- https://speedxrental.com` and save the output.
- Configure GA4 only after the property ID is supplied; verify consent granted and denied paths separately.
- Click each contact method once from hosting and repair pages in a test session; verify event name and all five fields.
- Mark test traffic so it is not counted as a real lead.
- Record Search Console and Bing verification status, sitemap submission status, indexed-page count, and any coverage errors.
- Start a lead log with date, intent, source if known, contact method, qualification result, and final outcome. Do not store sensitive vehicle or identity data in analytics events.

## Day 30 — first signal review

- Compare impressions, clicks, landing pages, AI/referral sessions, and contact clicks by locale and intent.
- Reconcile contact clicks against qualified leads to estimate click-to-qualified-lead rate.
- Review the actual questions prospects asked; add concise FAQ answers only when the business can support them factually.
- Inspect indexing and structured-data reports. Fix errors before adding more pages.
- Check external profiles for consistent NAP, categories, hours, website, and service descriptions.

## Day 60 — conversion improvement

- Identify pages with impressions but weak click-through rate; improve title and description without adding unsupported claims.
- Identify pages with engagement but few contacts; improve the answer summary, qualification details, and nearby contact options.
- Split hosting results by vehicle fit and repair results by service category.
- Publish one evidence-backed case study or operating explainer only after the customer facts, figures, and permission are documented.

## Day 90 — GEO outcome review

- Compare the 90-day period with the Day 0 baseline and the previous 30 days.
- Report qualified leads and customers by hosting vs repair, language, landing page, and contact method.
- Manually test representative prompts in ChatGPT, Gemini, Google AI experiences, and other relevant assistants. Record the exact prompt, date, response, whether SPEEDX was mentioned, and cited sources; do not treat one personalized answer as a ranking.
- Decide whether to expand content based on qualified-lead gaps, not raw pageview volume.
- Refresh all dated public evidence and remove or lower any claim that can no longer be verified.

## Suggested scorecard

| Metric | Day 0 | Day 30 | Day 60 | Day 90 |
| --- | ---: | ---: | ---: | ---: |
| Indexed pages | Pending |  |  |  |
| Search impressions | Pending |  |  |  |
| Organic clicks | Pending |  |  |  |
| AI/referral sessions | Pending |  |  |  |
| Hosting contact clicks | Pending |  |  |  |
| Repair contact clicks | Pending |  |  |  |
| Qualified hosting leads | Pending |  |  |  |
| Qualified repair leads | Pending |  |  |  |
| Signed hosting customers | Pending |  |  |  |
| Paid repair customers | Pending |  |  |  |

