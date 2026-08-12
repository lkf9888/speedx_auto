# GEO measurement baseline

Baseline date: 2026-08-11

Deployment status: implementation complete locally; production deployment and live analytics verification pending.

## Configuration state

- Contact event: `contact_click`.
- Dimensions: `method`, `intent`, `locale`, `placement`, and `page_path`.
- Methods: WhatsApp, phone, WeChat copy, and email.
- Intents: hosting, auto repair, and general.
- Consent Mode v2 defaults analytics and advertising storage to denied.
- Existing Google Ads destination: `AW-625073096`.
- GA4 status: code-ready but not live. A valid `NEXT_PUBLIC_GA_MEASUREMENT_ID` and production DebugView or Realtime proof are still required.
- A click is an intent signal, not proof of a conversation, qualified lead, booking, repair order, or signed management agreement.

## Funnel definitions

| Stage | Definition | Evidence source |
| --- | --- | --- |
| Discover | Search impression, AI referral, direct visit, or external-profile visit | Search Console, Bing Webmaster Tools, GA4 after configuration, profile dashboards |
| Engage | Hosting or repair landing-page view | GA4 after configuration |
| Contact intent | `contact_click` event | Google tag / GA4 after consent and live verification |
| Qualified lead | Team confirms a relevant vehicle-owner or repair inquiry | Actual lead log or CRM |
| Customer | Signed hosting agreement or paid repair order | Business records |

The primary conversion is a qualified vehicle-owner lead. The secondary conversion is a qualified mechanical-repair lead. Keep the two intents separate.

## Day 0 / 30 / 60 / 90 scorecard

Use `Pending` when a property is not configured and `0` only when a configured source proves zero. Break down contact clicks by every listed dimension; do not report only a combined total.

| Source | Metric and required dimensions | Day 0 | Day 30 | Day 60 | Day 90 |
| --- | --- | --- | --- | --- | --- |
| Contact events | Clicks by method × intent × locale × placement × page path | Pending |  |  |  |
| Contact events | Hosting clicks by WhatsApp / phone / WeChat / email | Pending |  |  |  |
| Contact events | Auto-repair clicks by WhatsApp / phone / WeChat / email | Pending |  |  |  |
| Google Search Console | Impressions | Pending |  |  |  |
| Google Search Console | Clicks | Pending |  |  |  |
| Google Search Console | CTR | Pending |  |  |  |
| Google Search Console | Average position | Pending |  |  |  |
| Google Search Console | Indexed-page count | Pending |  |  |  |
| Bing Webmaster Tools | Impressions | Pending |  |  |  |
| Bing Webmaster Tools | Clicks | Pending |  |  |  |
| Bing Webmaster Tools | CTR | Pending |  |  |  |
| Bing Webmaster Tools | Average position | Pending |  |  |  |
| Bing Webmaster Tools | Indexed-page count | Pending |  |  |  |
| Analytics | AI-assistant referral sessions where a referrer is available | Pending |  |  |  |
| Manual AI observation | Prompt, assistant, date, locale, response summary, SPEEDX mention, citations, signed-in/personalization context | Pending |  |  |  |
| Business records | Qualified hosting leads by source, locale, page, and contact method | Pending |  |  |  |
| Business records | Qualified repair leads by source, locale, page, and contact method | Pending |  |  |  |
| Business records | Signed hosting customers | Pending |  |  |  |
| Business records | Paid repair customers | Pending |  |  |  |

## Day 0 actions

- Save the deployment URL and commit SHA.
- Run `npm run verify:production -- https://speedxrental.com` and retain the output.
- Configure GA4 only after a property ID is supplied; verify granted and denied consent paths separately.
- In a marked test session, click each method on hosting and repair pages and verify the event name plus all five dimensions.
- Record Search Console and Bing ownership, sitemap submission, indexed-page count, and coverage errors.
- Start an actual lead log with date, intent, source if known, method, qualification result, and final outcome. Do not send identity or vehicle details in analytics events.

## Day 30 actions

- Compare impressions, clicks, CTR, position, indexed pages, landing pages, AI referrals, and contact clicks by locale and intent.
- Reconcile click signals against actual qualified leads to calculate click-to-qualified-lead rate.
- Add concise FAQs only for real prospect questions the business can answer factually.
- Resolve indexing or structured-data errors before adding more pages.
- Recheck external profiles for consistent facts and valid status values.

## Day 60 actions

- Improve titles and descriptions on pages with impressions but weak CTR without adding unsupported claims.
- Improve answer summaries, qualification details, and contact placement on engaged pages with few contacts.
- Split hosting results by vehicle fit and repair results by service category.
- Publish a case study only after facts, figures, customer permission, and the review date are documented.

## Day 90 actions

- Compare the full period with Day 0 and the previous 30 days.
- Report qualified leads and customers by intent, language, landing page, source, and contact method.
- Repeat the same recorded prompts in ChatGPT, Gemini, Google AI experiences, and other relevant assistants. Treat responses as dated observations, not rankings.
- Expand content only where actual qualified-lead questions reveal a gap.
- Refresh dated public evidence and lower or remove any claim that is no longer verifiable.
