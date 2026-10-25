/**
 * schema.org structured data (JSON-LD) for the public pages, so search engines can show
 * Proggaa as an organisation, its Missions as courses and the FAQ as expandable answers.
 * Pure builders: the pages render the result with <JsonLd>.
 */
import { CANONICAL_SITE_URL } from "@/lib/site-url";

export type JsonLdObject = Record<string, unknown>;

export const ORGANIZATION_ID = `${CANONICAL_SITE_URL}/#organization`;

/**
 * Serialise for a <script type="application/ld+json"> tag. "<" is escaped so text such as a
 * Mission title containing "</script>" can never close the tag early.
 */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function organizationJsonLd(siteName = "Proggaa"): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "@id": ORGANIZATION_ID,
    name: siteName,
    url: CANONICAL_SITE_URL,
    logo: `${CANONICAL_SITE_URL}/branding/proggaa-logo-512.png`,
    description:
      "Online learning for Bangladeshi students: HSC and university admission preparation as Missions with video lessons, notes, live classes, exams and certificates.",
    areaServed: { "@type": "Country", name: "Bangladesh" },
    availableLanguage: ["bn", "en"],
  };
}

export function websiteJsonLd(siteName = "Proggaa"): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${CANONICAL_SITE_URL}/#website`,
    name: siteName,
    url: CANONICAL_SITE_URL,
    inLanguage: ["en", "bn"],
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export function faqJsonLd(items: readonly { q: string; a: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbJsonLd(crumbs: readonly { name: string; path: string }[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${CANONICAL_SITE_URL}${c.path}`,
    })),
  };
}

export type CourseJsonLdInput = {
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  language: string | null;
  isFree: boolean;
  /** Price actually charged now (after any discount), in the smallest unit (paisa). */
  priceCents: number;
  currency: string | null;
  teacherNames: string[];
  category: string | null;
  rating?: { value: number; count: number };
  /** The site name from branding settings. */
  providerName: string;
};

export function courseJsonLd(c: CourseJsonLdInput): JsonLdObject {
  const url = `${CANONICAL_SITE_URL}/courses/${c.slug}`;
  const data: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: c.title,
    description: c.description || c.title,
    url,
    provider: { "@type": "EducationalOrganization", "@id": ORGANIZATION_ID, name: c.providerName, sameAs: CANONICAL_SITE_URL },
    offers: {
      "@type": "Offer",
      category: c.isFree ? "Free" : "Paid",
      price: c.isFree ? 0 : Math.round(c.priceCents) / 100,
      priceCurrency: (c.currency || "BDT").toUpperCase(),
      availability: "https://schema.org/InStock",
      url,
    },
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: "Online",
      courseWorkload: "Self-paced",
    },
  };
  if (c.thumbnailUrl) data.image = c.thumbnailUrl;
  if (c.language) data.inLanguage = c.language;
  if (c.category) data.about = c.category;
  if (c.teacherNames.length) data.instructor = c.teacherNames.map((name) => ({ "@type": "Person", name }));
  if (c.rating && c.rating.count > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Math.round(c.rating.value * 10) / 10,
      ratingCount: c.rating.count,
      bestRating: 5,
    };
  }
  return data;
}
