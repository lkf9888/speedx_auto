# SPEEDX AUTO external entity checklist

Last reviewed: 2026-08-28

Allowed status values are `not checked`, `existing profile found`, `form filled but not submitted`, `correction requested`, `submitted for review`, `verification required`, `updated`, and `verified live`. A submitted change remains `correction requested` or `submitted for review` until the public profile visibly reflects it.

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
| SPEEDX AUTO website | SPEEDX AUTO | 2980 Number 3 Rd, Richmond, BC V6X 2B3; Richmond and Metro Vancouver | +1 (778) 917-0710 | https://speedxrental.com/en | Auto repair shop / Turo fleet management | Mon-Sat 10:00-18:30; Sun closed | verified live | https://speedxrental.com/en | 2026-08-17 | Render deployed `b48957c`; the production verifier passed 33 localized pages plus robots.txt, llms.txt, and sitemap.xml. English, Simplified Chinese, and Traditional Chinese contact pages all exposed the approved visible hours, phone, postal code, and `Mo-Sa 10:00-18:30` JSON-LD. |
| Turo public profile / listing | SPEEDX | Richmond, BC | Not displayed in reviewed result | Turo listing | Car sharing host | Not applicable | verified live | https://turo.com/ca/en/car-rental/canada/richmond-bc/bmw/3-series/2636711 | 2026-08-11 | Public result showed a 4.8 host rating and 5,006 trips; website uses the conservative `5,000+` threshold. Refresh before raising the threshold. |
| Google Business Profile | SPEEDX AUTO | 2980 Number 3 Rd, Richmond, BC V6X 2B3 | (778) 917-0710 | https://speedxrental.com/en | Auto repair shop; Mechanic; Car repair and maintenance service; Car rental agency | Mon-Sat 10:00-18:30; Sun closed | verified live | https://www.google.com/search?q=SPEEDX+AUTO+Richmond+BC | 2026-08-28 | Live owner view shows `You manage this Business Profile`, complete profile strength, editing/review/photo/post/service controls, Performance access, 893 customer interactions, and 644 search-result views last month. No verification-processing or `Get verified` prompt remains. |
| Bing Places | Not checked | Not checked | Not checked | Not checked | Not checked | Not checked | not checked | Not recorded | Not checked | Claim or create the listing and verify every canonical field. |
| Apple Business Connect | Not checked | Not checked | Not checked | Not checked | Not checked | Not checked | not checked | Not recorded | Not checked | Claim or create the place card and verify every canonical field. |
| BBB Business Profile | SPEEDX AUTO | 2980 Number 3 Rd, Richmond, BC V6X 2B3 | (778) 917-0710 | https://speedxrental.com/en | Auto Repairs; Car Rentals | Not shown; no hours field is exposed on the public profile | verified live | https://www.bbb.org/ca/bc/richmond/profile/car-rental/speedx-auto-0037-2436817 | 2026-08-28 | Public profile now matches the canonical name, address/postal code, phone, website, and categories; the former `speedx-auto-repair-rental` URL redirects to this canonical profile. Owner portal access is active and the account postal code was corrected to V6X 2B3. BBB rating remains D+ because complaint 23887308, filed 2025-09-15, was closed unanswered on 2025-10-12. On 2026-08-28, the BBB BC & Yukon contact form confirmed successful delivery of SPEEDX AUTO's request to reopen the complaint or accept a late business response. Await BBB instructions before submitting the substantive response. |
| Yelp | SPEEDX AUTO | 2980 No. 3 Road, Richmond, BC V6X 2B3 | (778) 917-0710 | https://speedxrental.com/en | Auto Repair; Car Rental; Body Shops | Mon-Sat 10:00-18:30; Sun closed | verification required | https://www.yelp.ca/biz/speedx-auto-richmond | 2026-08-28 | Public page remains live with canonical name, address, phone, website, categories, and hours, but visibly shows `Unclaimed`. Yelp now exposes the correct claim flow for business ID `392twOlMF8Ni1E95i7qVlg`, so no duplicate page is needed. A Yelp for Business password-reset email was successfully requested for `speedxrentalcar@gmail.com` on 2026-08-28; the owner must use that private email link to reset/login, after which the free claim and phone/email verification can continue. |
| Yellow Pages | SPEEDX AUTO free listing request | Submitted canonical Richmond details | Submitted canonical phone | Submitted canonical website | Submitted automotive categories/services | Submitted Mon-Sat 10:00-18:30; Sun closed | submitted for review | https://solutions.yp.ca/free-online-listing | 2026-08-17 | YellowPages displayed its success confirmation and says a representative will call to confirm details required to complete the profile. Do not mark verified live until the public listing appears with canonical facts. |
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
