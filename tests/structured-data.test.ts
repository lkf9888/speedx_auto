import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StructuredData } from "@/components/StructuredData";
import {
  buildStructuredData,
  type JsonLdNode,
  type StructuredDataInput,
} from "@/lib/structured-data";

const hostingInput: StructuredDataInput = {
  locale: "en",
  route: "hosting",
  pageName: "Turo Car Hosting",
  pageDescription: "Full-service vehicle hosting for eligible owners.",
  service: {
    name: "Turo vehicle hosting and fleet management",
    description: "Vehicle hosting for Metro Vancouver and qualifying BC owners.",
    areaServed: ["Metro Vancouver", "British Columbia"],
  },
  breadcrumbs: [
    { name: "Home", url: "https://speedxrental.com/en" },
    { name: "Turo Car Hosting", url: "https://speedxrental.com/en/hosting" },
  ],
  faqs: [
    {
      question: "What kind of cars do you accept?",
      answer: "Contact SPEEDX AUTO with your vehicle details for an assessment.",
    },
  ],
};

function graphNodes(input: StructuredDataInput): JsonLdNode[] {
  return buildStructuredData(input)["@graph"];
}

describe("buildStructuredData", () => {
  it("connects the business, website, hosting page, and service with stable IDs", () => {
    const nodes = graphNodes(hostingInput);
    const business = nodes.find(
      (node) => node["@id"] === "https://speedxrental.com/#business",
    );
    const webPage = nodes.find(
      (node) =>
        node["@id"] === "https://speedxrental.com/en/hosting#webpage",
    );
    const service = nodes.find(
      (node) =>
        node["@id"] === "https://speedxrental.com/en/hosting#service",
    );

    expect(business).toMatchObject({
      "@type": ["LocalBusiness", "AutoRental", "AutoRepair"],
      name: "SPEEDX AUTO",
      telephone: "+1 (778) 917-0710",
    });
    expect(webPage).toMatchObject({
      url: "https://speedxrental.com/en/hosting",
      inLanguage: "en",
      about: { "@id": "https://speedxrental.com/#business" },
      mainEntity: {
        "@id": "https://speedxrental.com/en/hosting#service",
      },
    });
    expect(service).toMatchObject({
      name: "Turo vehicle hosting and fleet management",
      provider: { "@id": "https://speedxrental.com/#business" },
      areaServed: ["Metro Vancouver", "British Columbia"],
    });
  });

  it("uses the exact supplied visible FAQ and breadcrumb content", () => {
    const nodes = graphNodes(hostingInput);
    const faq = nodes.find((node) => node["@type"] === "FAQPage");
    const breadcrumb = nodes.find(
      (node) => node["@type"] === "BreadcrumbList",
    );

    expect(faq?.mainEntity).toEqual([
      {
        "@type": "Question",
        name: "What kind of cars do you accept?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Contact SPEEDX AUTO with your vehicle details for an assessment.",
        },
      },
    ]);
    expect(breadcrumb?.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://speedxrental.com/en",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Turo Car Hosting",
        item: "https://speedxrental.com/en/hosting",
      },
    ]);
  });

  it("omits optional graph nodes when a page does not supply them", () => {
    const nodes = graphNodes({
      locale: "en",
      route: "about",
      pageName: "About SPEEDX AUTO",
      pageDescription: "Company information.",
    });

    expect(nodes.some((node) => node["@type"] === "Service")).toBe(false);
    expect(nodes.some((node) => node["@type"] === "FAQPage")).toBe(false);
    expect(nodes.some((node) => node["@type"] === "VideoObject")).toBe(false);
  });

  it("escapes script-closing text in serialized JSON-LD", () => {
    const markup = renderToStaticMarkup(
      createElement(StructuredData, {
        ...hostingInput,
        pageDescription: "Safe text </script><script>alert(1)</script>",
      }),
    );

    expect(markup).not.toContain("</script><script>");
    expect(markup).toContain("\\u003c/script>");
  });
});
