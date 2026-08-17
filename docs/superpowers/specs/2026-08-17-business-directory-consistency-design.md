# SPEEDX AUTO Business Directory Consistency Design

## Objective

Make SPEEDX AUTO's website and owner-controlled business profiles use one factual identity, then establish missing Yelp and YellowPages listings so search engines and AI assistants receive consistent local-business signals.

## Canonical business facts

- Business name: `SPEEDX AUTO`
- Primary category: Auto Repair Shop
- Secondary services/categories when supported: Mechanic, Car Repair and Maintenance Service, Car Rental Agency, Turo Fleet Management
- Phone: `+1 (778) 917-0710`
- Address: `2980 Number 3 Rd, Richmond, BC V6X 2B3`
- Website: `https://speedxrental.com/en`
- Hours: Monday-Saturday, `10:00 AM-6:30 PM`; Sunday closed
- Email for public contact: `speedxrentalcar@gmail.com`

## Scope

### Website

Update the shared company data, English, Simplified Chinese, and Traditional Chinese copy, and LocalBusiness structured data so every visible or machine-readable hours value matches the canonical hours. Phone and postal code remain unchanged because the repository already contains the correct values.

### Google Business Profile

Read back the saved values. Keep the current Monday-Saturday `10:00 AM-6:30 PM` hours and verify the phone and postal code remain correct. Submit changes only if a field differs from the canonical facts.

### BBB

Locate the existing SPEEDX profile and use its correction or ownership workflow to replace the stale phone and postal code. Do not request removal or concealment of ratings, complaints, or other reputation information. Record whether the correction is saved, submitted for review, or publicly visible.

### Yelp and YellowPages

Search by exact business name, phone, and address before creating anything. If a matching profile exists, use the claim workflow instead of creating a duplicate. If no match exists, create one profile using the canonical facts.

Use Auto Repair Shop as the primary category. Add secondary categories only when the directory offers a truthful matching option. Describe Turo fleet management as a service, not as a separate fictitious location or business. Do not add prices, certifications, warranties, or service claims that have not been verified.

## External-account and verification boundaries

Use the user's currently authenticated business-management session when a directory supports it. Do not inspect or store passwords, cookies, recovery information, or verification codes. Stop and hand control to the user for CAPTCHA, email/SMS/phone verification, paid upgrades, acceptance of unexpected terms, or any request for evidence only the owner can provide.

## State tracking

For every external profile, report one of these states accurately:

1. Not started
2. Existing profile found
3. Form filled but not submitted
4. Submitted for review
5. Verification required
6. Publicly visible and verified

Creating or filling a form is not considered publication.

## Verification

- Run the repository test, lint, and production build commands after the website edit.
- Search the repository for every former Monday-Friday hours string and confirm no public copy or structured-data value remains.
- After deployment, fetch the live English, Simplified Chinese, and Traditional Chinese pages and inspect rendered hours and JSON-LD.
- Reopen Google Business Profile and read back hours, phone, and postal code.
- For Yelp, YellowPages, and BBB, capture the final visible or review/verification state and any public URL.

## Out of scope

This change does not purchase advertising, solicit or fabricate reviews, upload unprovided business photos, or alter unrelated Google Ads campaigns.
