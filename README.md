# SPEEDX AUTO website

Localized Next.js website for SPEEDX AUTO's Turo fleet management and automotive repair services.

## Getting Started

Install dependencies and run the development server:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

`NEXT_PUBLIC_GA_MEASUREMENT_ID` is optional. Leave it empty until a real GA4 web data stream is created. Google Ads destination `AW-625073096` remains configured independently.

Website WhatsApp, telephone, and WeChat clicks also send their own Google Ads `conversion` event, using labels verified in the SpeedX Ads account on 2026-10-02. These are **secondary observation actions**, not confirmed inquiries, connected calls, or sales. Keep them outside custom bidding goals. They use no monetary value, count once per ad interaction, and have a 30-day click attribution window; Ads totals are therefore not the raw count of every visitor's button clicks. Existing `contact_click` events remain unchanged.

The Ads conversion event is sent only after the visitor grants the existing consent choice, without replaying earlier clicks. Its payload contains only the public destination label, zero value, CAD currency, and beacon transport; no customer contact data, chat contents, or enhanced-conversion data is added. Email clicks do not send these Ads conversions. Confirm deployment separately from receipt of events in Google Ads; a passing test or an emitted browser request does not prove an attributed lead.

## Verification

```bash
npm test
npm run lint
npm run build
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

The site defaults Consent Mode v2 storage to denied. Visitors can accept or decline measurement in the localized consent banner; the privacy page documents the event fields and stored preference.
