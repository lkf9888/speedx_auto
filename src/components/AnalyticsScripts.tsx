import Script from "next/script";

const GOOGLE_ADS_ID = "AW-625073096";
const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

export function getGoogleDestinations(
  measurementId: string | undefined,
): string[] {
  return measurementId && GA_MEASUREMENT_ID_PATTERN.test(measurementId)
    ? [GOOGLE_ADS_ID, measurementId]
    : [GOOGLE_ADS_ID];
}

export function AnalyticsScripts() {
  const destinations = getGoogleDestinations(
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  );
  const configuration = destinations
    .map((destination) => `gtag('config', ${JSON.stringify(destination)});`)
    .join("\n");

  return (
    <>
      <script
        id="google-consent-default"
        dangerouslySetInnerHTML={{
          __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            ad_storage: 'denied',
            analytics_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            wait_for_update: 500
          });
        `,
        }}
      />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-measurement" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          window.gtag = window.gtag || function(){dataLayer.push(arguments);};
          gtag('js', new Date());
          ${configuration}
        `}
      </Script>
    </>
  );
}
