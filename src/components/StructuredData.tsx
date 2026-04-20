import { company } from "@/lib/company";

export function StructuredData({ locale }: { locale: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "AutoRental",
    name: company.name,
    alternateName: "SPEEDX AUTO 速驰汽车",
    url: "https://speedxrental.com",
    logo: "https://speedxrental.com/logo.png",
    image: "https://speedxrental.com/logo.png",
    description:
      "British Columbia's #1 Turo host and full-service auto care center. 100+ vehicles under management, 4,500+ trips completed since 2021.",
    telephone: company.phoneDisplay,
    email: company.email,
    foundingDate: `${company.foundedYear}-01-01`,
    address: {
      "@type": "PostalAddress",
      streetAddress: company.addressLine1,
      addressLocality: "Richmond",
      addressRegion: "BC",
      postalCode: "V6X 2B3",
      addressCountry: "CA",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 49.1631,
      longitude: -123.1336,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "10:00",
        closes: "18:00",
      },
    ],
    areaServed: {
      "@type": "AdministrativeArea",
      name: "British Columbia",
    },
    sameAs: [company.turoHostUrl],
    priceRange: "$$",
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
      key={`jsonld-${locale}`}
    />
  );
}
