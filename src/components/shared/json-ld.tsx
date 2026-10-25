import { serializeJsonLd, type JsonLdObject } from "@/lib/seo/structured-data";

/** Structured data for search engines. Server-rendered; nothing is shown on the page. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
