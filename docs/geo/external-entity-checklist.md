# SPEEDX AUTO external entity checklist

Last reviewed: 2026-08-11

This checklist separates facts that are publicly verified from profiles that still require owner access. A website update does not change an external profile by itself.

## Canonical business facts

Use these values consistently wherever the business is listed:

- Name: SPEEDX AUTO
- Address: 2980 Number 3 Rd, Richmond, BC V6X 2B3
- Phone: +1 (778) 917-0710
- Website: https://speedxrental.com/en
- WeChat ID: SPEEDX2020
- Hours: Monday-Friday, 10:00 AM-6:00 PM
- Primary category: Turo fleet management / vehicle hosting management
- Secondary category: auto repair shop
- Service area: Richmond and Metro Vancouver; other British Columbia hosting vehicles only after qualification and logistics review

## Public evidence register

| Entity | Status | Evidence / next action |
| --- | --- | --- |
| SPEEDX AUTO website | Implemented locally, not yet production-verified | Deploy the approved branch, then run `npm run verify:production -- https://speedxrental.com`. |
| Turo host identity | Publicly verified 2026-08-11 | The public SPEEDX-hosted BMW listing showed a 4.8 host rating and 5,006 trips when reviewed: https://turo.com/ca/en/car-rental/canada/richmond-bc/bmw/3-series/2636711. Website copy uses the conservative threshold `5,000+`. |
| Google Business Profile | Ownership and current fields not verified | Sign in as the business owner, confirm NAP, primary/secondary categories, hours, service descriptions, website URL, photos, and messaging. Record the profile URL and verification date here. |
| Apple Business Connect | Not verified | Search for the business, claim or create the place card, then match the canonical NAP and website. |
| Bing Places | Not verified | Claim or create the listing and match the canonical NAP, hours, categories, and website. |
| BBB profile | Public consistency not verified | Review the current profile for legal name, address, phone, website, and service description. Do not state that a correction was submitted until the portal confirms it. |
| Facebook / Instagram / LinkedIn | Not verified | Use the same business description, NAP, website, and two-pillar service positioning. Link only profiles controlled by SPEEDX AUTO. |

## Search and AI discovery actions

- Add and verify the HTTPS domain property in Google Search Console.
- Submit `https://speedxrental.com/sitemap.xml` and inspect the hosting and repair URLs.
- Add and verify the site in Bing Webmaster Tools; submit the same sitemap.
- Confirm `robots.txt`, `sitemap.xml`, and `llms.txt` return HTTP 200 after deployment.
- Request indexing for `/en/hosting`, `/en/auto-repair`, and the four English repair service pages after the deployment is stable.
- Repeat the same checks for `zh-CN` and `zh-TW`; do not assume translated pages are indexed because English is indexed.
- Keep dates, service areas, business facts, and public trip thresholds consistent across the website and controlled profiles.

## Evidence rule for strong claims

Do not publish `#1`, `largest`, `lowest`, `fastest`, guaranteed earnings, guaranteed bookings, or fixed turnaround claims unless the comparison method, source, scope, and review date can be published next to the claim. Prefer auditable facts such as founding year, public Turo trip threshold, address, service area, and current service scope.

