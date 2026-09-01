import { absoluteUrl, siteName, siteUrl } from "@/lib/seo/site-url";

/**
 * JSON-LD for the facts the pages already show as styled text.
 *
 * A directory's value to a search engine is its structured data: ratings, reviews, availability and
 * the trail through the catalogue. Everything here is built from what the page renders, never from
 * anything the visitor cannot see -- a rating in schema that is absent from the page is the exact
 * pattern Google's review-snippet policy calls self-serving.
 */
export type JsonLdNode = Record<string, unknown>;

const organizationId = `${siteUrl}/#organization`;
const websiteId = `${siteUrl}/#website`;

export function organizationSchema(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId,
    name: siteName,
    url: `${siteUrl}/`,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/brand/opinacraft-mark.svg"),
    },
    description:
      "Directorio independiente de servidores de Minecraft con estado en tiempo real y opiniones de jugadores.",
  };
}

export function webSiteSchema(): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId,
    name: siteName,
    url: `${siteUrl}/`,
    inLanguage: "es-ES",
    publisher: { "@id": organizationId },
    // The catalogue search the header already runs on ⌘K.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** The trail the page renders through `<Breadcrumbs>`, marked up so the crawler reads the same one. */
export function breadcrumbListSchema(items: readonly { name: string; path: string }[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export type ServerReviewNode = {
  rating: number;
  content: string;
  authorName: string;
  createdAt: Date;
};

/**
 * `Product` rather than `GameServer`: the semantically exact type sits under `Intangible` and
 * cannot carry `aggregateRating`, so it rides along as `additionalType` and the review snippet
 * stays eligible.
 */
export function serverSchema({
  name,
  slug,
  description,
  image,
  average,
  reviewCount,
  reviews,
}: {
  name: string;
  slug: string;
  description: string;
  image?: string | null;
  average: number | null;
  reviewCount: number;
  reviews: readonly ServerReviewNode[];
}): JsonLdNode {
  const url = absoluteUrl(`/servers/${slug}`);
  const node: JsonLdNode = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#server`,
    additionalType: "https://schema.org/GameServer",
    name,
    url,
    description,
    category: "Servidor de Minecraft",
    ...(image ? { image: absoluteUrl(image) } : {}),
  };

  // Only when the page itself shows a rating. `reviewCount` counts published reviews, which is what
  // the ficha renders beside the average.
  if (average !== null && reviewCount > 0) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(average.toFixed(2)),
      reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  if (reviews.length > 0) {
    node.review = reviews.map((review) => ({
      "@type": "Review",
      datePublished: review.createdAt.toISOString(),
      reviewBody: review.content,
      author: { "@type": "Person", name: review.authorName },
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
    }));
  }

  return node;
}

export function blogPostingSchema({
  title,
  description,
  path,
  cover,
  publishedAt,
  authorName,
  authorPath,
}: {
  title: string;
  description: string;
  path: string;
  cover: string;
  publishedAt: string;
  authorName: string;
  authorPath: string;
}): JsonLdNode {
  const url = absoluteUrl(path);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    headline: title,
    description,
    image: absoluteUrl(cover),
    datePublished: publishedAt,
    dateModified: publishedAt,
    inLanguage: "es-ES",
    author: { "@type": "Person", name: authorName, url: absoluteUrl(authorPath) },
    publisher: { "@id": organizationId },
  };
}

/** The catalogue page, as the ordered list it renders. */
export function itemListSchema(items: readonly { name: string; path: string }[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

/**
 * `<` is escaped rather than serialised raw: a review body containing `</script>` would otherwise
 * close the block and inject markup into the page. JSON keeps `<` as a plain character, so every
 * parser reads back the same string.
 */
export function serializeJsonLd(data: JsonLdNode | readonly JsonLdNode[]) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
