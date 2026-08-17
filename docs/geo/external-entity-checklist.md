# SPEEDX AUTO external entity checklist

Last reviewed: 2026-08-17

Allowed status values are `not checked`, `correction requested`, `updated`, and `verified live`. A submitted change remains `correction requested` until the public profile visibly reflects it.

## Canonical facts to use when an owner updates a profile

- Business name: SPEEDX AUTO
- Address: 2980 Number 3 Rd, Richmond, BC V6X 2B3
- Phone: +1 (778) 917-0710
- Website: https://speedxrental.com/en
- Primary category: Auto repair shop
- Secondary services/categories: Mechanic; Car repair and maintenance service; Car rental agency; Turo fleet management
- Hours: Monday-Saturday, 10:00 AM-6:30 PM; Sunday closed
- Service area: Richmond and Metro Vancouver; other British Columbia hosting vehicles only after qualification and logistics review

## Profile and source register

| Profile / source | Business name shown | Address / service area shown | Phone shown | Website shown | Primary / secondary categories shown | Hours shown | Status | Evidence URL | Verification date | Required follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SPEEDX AUTO website | SPEEDX AUTO | 2980 Number 3 Rd, Richmond, BC V6X 2B3; Richmond and Metro Vancouver | +1 (778) 917-0710 | https://speedxrental.com/en | Auto repair shop / Turo fleet management | Mon-Sat 10:00-18:30; Sun closed | updated | https://speedxrental.com/en | 2026-08-17 | Deploy commit `0f80eda`, run the production verifier, and confirm localized HTML plus JSON-LD before marking verified live. |
| Turo public profile / listing | SPEEDX | Richmond, BC | Not displayed in reviewed result | Turo listing | Car sharing host | Not applicable | verified live | https://turo.com/ca/en/car-rental/canada/richmond-bc/bmw/3-series/2636711 | 2026-08-11 | Public result showed a 4.8 host rating and 5,006 trips; website uses the conservative `5,000+` threshold. Refresh before raising the threshold. |
| Google Business Profile | Not checked | Not checked | Not checked | Not checked | Not checked | Not checked | not checked | Not recorded | Not checked | Owner must sign in, locate or create the profile, verify ownership, and compare every field with the canonical facts. |
| Bing Places | Not checked | Not checked | Not checked | Not checked | Not checked | Not checked | not checked | Not recorded | Not checked | Claim or create the listing and verify every canonical field. |
| Apple Business Connect | Not checked | Not checked | Not checked | Not checked | Not checked | Not checked | not checked | Not recorded | Not checked | Claim or create the place card and verify every canonical field. |
| BBB Business Profile | SpeedX Auto Repair & Rental | 2980 Number 3 Rd, Richmond, BC V6X 0A8 | (778) 383-0015 | Website link present | Car Rentals; no repair category shown in reviewed result | Not shown | verified live | https://www.bbb.org/ca/bc/richmond/profile/car-rental/speedx-auto-repair-rental-0037-2436817 | 2026-08-11 | Public name, postal code, phone, and categories differ from the canonical facts. No correction is recorded as requested; use owner access before changing status. |
| Yelp | Not checked | Not checked | Not checked | Not checked | Not checked | Not checked | not checked | Not recorded | Not checked | Search did not provide a reviewable controlled profile. Confirm whether a listing exists before claiming or updating it. |
| Yellow Pages / other local directories | Not checked | Not checked | Not checked | Not checked | Not checked | Not checked | not checked | Not recorded | Not checked | Search did not surface another brand directory in the reviewed results. Repeat the brand-and-address search after deployment and add each ranking directory as its own row. |
| WeChat public contact | SPEEDX2020 | Not applicable | Not applicable | Not applicable | Chinese-language direct contact | Not applicable | verified live | Website contact controls | 2026-08-11 | Keep the ID visible and copyable on every localized contact surface. |

## Search and AI discovery actions

- Add and verify the HTTPS domain property in Google Search Console.
- Submit `https://speedxrental.com/sitemap.xml`; inspect hosting, repair hub, and repair service URLs.
- Add and verify the site in Bing Webmaster Tools; submit the same sitemap.
- Confirm `robots.txt`, `sitemap.xml`, and `llms.txt` return HTTP 200 after deployment.
- Request indexing only after the production verifier passes.
- Verify English, Simplified Chinese, and Traditional Chinese pages separately.
- Keep business facts, service areas, evidence thresholds, and dates consistent across controlled profiles.

## Evidence rule for strong claims

Do not publish `#1`, `largest`, `lowest`, `fastest`, guaranteed earnings, guaranteed bookings, or fixed turnaround claims unless the comparison method, source, scope, and review date can be published beside the claim. Prefer auditable facts such as founding year, public trip threshold, address, current service area, and current service scope.
