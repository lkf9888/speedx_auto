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

## Verification

```bash
npm test
npm run lint
npm run build
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

The site defaults Consent Mode v2 storage to denied. Visitors can accept or decline measurement in the localized consent banner; the privacy page documents the event fields and stored preference.
