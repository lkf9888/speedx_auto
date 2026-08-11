import {
  buildStructuredData,
  type StructuredDataInput,
} from "@/lib/structured-data";

function serializeJsonLd(data: object): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function StructuredData(input: StructuredDataInput) {
  const data = buildStructuredData(input);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
      key={`jsonld-${input.locale}-${input.route}`}
    />
  );
}
