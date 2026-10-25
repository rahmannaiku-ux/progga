import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, courseJsonLd, faqJsonLd, serializeJsonLd } from "./structured-data";

describe("serializeJsonLd", () => {
  it("escapes < so a title can't close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("faqJsonLd", () => {
  it("maps each item to a Question with an accepted Answer", () => {
    const data = faqJsonLd([{ q: "Is it free?", a: "Free Missions are." }]);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toEqual([
      { "@type": "Question", name: "Is it free?", acceptedAnswer: { "@type": "Answer", text: "Free Missions are." } },
    ]);
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers crumbs from 1 with absolute URLs", () => {
    const data = breadcrumbJsonLd([
      { name: "Home", path: "" },
      { name: "Missions", path: "/courses" },
    ]);
    expect(data.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://prooggaa.com" },
      { "@type": "ListItem", position: 2, name: "Missions", item: "https://prooggaa.com/courses" },
    ]);
  });
});

describe("courseJsonLd", () => {
  const base = {
    slug: "hsc-physics",
    title: "HSC Physics",
    description: "Full syllabus",
    thumbnailUrl: null,
    language: "bn",
    isFree: false,
    priceCents: 150000,
    currency: "bdt",
    teacherNames: ["Rahim Uddin"],
    category: "Physics",
  };

  it("converts paisa to taka and upper-cases the currency", () => {
    const offers = courseJsonLd(base).offers as Record<string, unknown>;
    expect(offers.price).toBe(1500);
    expect(offers.priceCurrency).toBe("BDT");
    expect(offers.category).toBe("Paid");
  });

  it("prices free missions at 0", () => {
    const offers = courseJsonLd({ ...base, isFree: true }).offers as Record<string, unknown>;
    expect(offers.price).toBe(0);
    expect(offers.category).toBe("Free");
  });

  it("only adds a rating when there are reviews", () => {
    expect(courseJsonLd(base).aggregateRating).toBeUndefined();
    const rated = courseJsonLd({ ...base, rating: { value: 4.666, count: 3 } });
    expect(rated.aggregateRating).toMatchObject({ ratingValue: 4.7, ratingCount: 3 });
  });

  it("falls back to the title when there is no description", () => {
    expect(courseJsonLd({ ...base, description: null }).description).toBe("HSC Physics");
  });
});
