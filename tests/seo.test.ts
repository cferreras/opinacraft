import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { absoluteUrl, canonicalSiteUrl } from "@/lib/seo/site-url";
import {
  blogPostingSchema,
  breadcrumbListSchema,
  itemListSchema,
  organizationSchema,
  serializeJsonLd,
  serverSchema,
  webSiteSchema,
} from "@/lib/seo/structured-data";

function readProjectFile(filePath: string) {
  return readFileSync(path.resolve(filePath), "utf8");
}

// Production serves from www and the apex 308-redirects to it. A canonical, a sitemap entry or an
// og:url naming the apex points at a URL that redirects away from itself.
test("the canonical origin is the host that answers 200", () => {
  assert.equal(canonicalSiteUrl("https://opinacraft.com"), "https://www.opinacraft.com");
  assert.equal(canonicalSiteUrl("https://opinacraft.com/"), "https://www.opinacraft.com");
  assert.equal(canonicalSiteUrl("https://www.opinacraft.com"), "https://www.opinacraft.com");
  // Anything else is left alone: preview and local deployments must advertise themselves.
  assert.equal(canonicalSiteUrl("https://preview.opinacraft.com"), "https://preview.opinacraft.com");
  assert.equal(canonicalSiteUrl("http://localhost:3000"), "http://localhost:3000");
  assert.equal(canonicalSiteUrl(undefined), "http://localhost:3000");
  assert.equal(canonicalSiteUrl("not a url"), "http://localhost:3000");
});

test("absolute URLs keep a single slash and pass absolute inputs through", () => {
  assert.equal(absoluteUrl("/blog"), `${canonicalSiteUrl(process.env.SITE_URL ?? process.env.BETTER_AUTH_URL)}/blog`);
  assert.equal(absoluteUrl("blog"), absoluteUrl("/blog"));
  assert.equal(absoluteUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
});

test("every public route declares a canonical", () => {
  const routes = [
    "src/app/page.tsx",
    "src/app/servers/page.tsx",
    "src/app/servers/[slug]/page.tsx",
    "src/app/blog/page.tsx",
    "src/app/blog/[slug]/page.tsx",
    "src/app/quienes-somos/page.tsx",
    "src/app/contact/page.tsx",
    "src/app/terms/page.tsx",
    "src/app/privacy/page.tsx",
  ];

  for (const route of routes) {
    assert.match(readProjectFile(route), /alternates: \{ canonical/, `${route}: no rel=canonical`);
  }
});

// Next replaces `openGraph` wholesale instead of merging it, so a route that hand-rolls the object
// silently drops og:url, og:locale and og:site_name. Everything goes through the builder.
test("no route hand-rolls its Open Graph object", () => {
  const routes = [
    "src/app/page.tsx",
    "src/app/servers/page.tsx",
    "src/app/servers/[slug]/page.tsx",
    "src/app/blog/page.tsx",
    "src/app/blog/[slug]/page.tsx",
    "src/app/quienes-somos/page.tsx",
    "src/app/contact/page.tsx",
    "src/app/terms/page.tsx",
    "src/app/privacy/page.tsx",
  ];

  for (const route of routes) {
    const source = readProjectFile(route);
    assert.match(source, /openGraph: buildOpenGraph\(/, `${route}: build the card through buildOpenGraph`);
    assert.doesNotMatch(source, /openGraph: \{/, `${route}: a literal openGraph object drops og:url/og:locale/og:site_name`);
  }

  const layout = readProjectFile("src/app/layout.tsx");
  assert.match(layout, /siteName/);
  assert.match(layout, /locale: siteLocale|siteLocale/);
});

test("robots and the sitemap publish the canonical host", () => {
  const robots = readProjectFile("src/app/robots.ts");
  const sitemap = readProjectFile("src/app/sitemap.ts");

  assert.match(robots, /sitemap: `\$\{siteUrl\}\/sitemap\.xml`/);
  assert.doesNotMatch(robots, /BETTER_AUTH_URL/);
  assert.doesNotMatch(sitemap, /BETTER_AUTH_URL/);
  // Google reads lastmod and ignores changefreq and priority.
  assert.doesNotMatch(sitemap, /changeFrequency|priority:/);
  for (const staticPath of ["/contact", "/terms", "/privacy"]) {
    assert.ok(sitemap.includes(`"${staticPath}"`), `sitemap is missing ${staticPath}`);
  }
});

test("the sitewide schema names the organisation and the site search", () => {
  const organization = organizationSchema();
  const website = webSiteSchema();

  assert.equal(organization["@type"], "Organization");
  assert.deepEqual(website.publisher, { "@id": organization["@id"] });
  const action = website.potentialAction as { target: { urlTemplate: string } };
  assert.match(action.target.urlTemplate, /\?q=\{search_term_string\}$/);
});

test("the breadcrumb list numbers its items from one and uses absolute URLs", () => {
  const crumbs = breadcrumbListSchema([{ name: "Blog", path: "/blog" }, { name: "Post", path: "/blog/post" }]);
  const items = crumbs.itemListElement as Array<{ position: number; item: string }>;

  assert.deepEqual(items.map((item) => item.position), [1, 2]);
  assert.equal(items[1]?.item, absoluteUrl("/blog/post"));
});

test("a server carries its rating only when the page shows one", () => {
  const base = { name: "Ferreras SMP", slug: "ferreras-smp", description: "Un survival vanilla.", image: null };

  const unrated = serverSchema({ ...base, average: null, reviewCount: 0, reviews: [] });
  assert.equal(unrated.aggregateRating, undefined);
  assert.equal(unrated.review, undefined);
  // GameServer cannot legally carry aggregateRating, so it rides along instead of replacing Product.
  assert.equal(unrated["@type"], "Product");
  assert.equal(unrated.additionalType, "https://schema.org/GameServer");

  const rated = serverSchema({
    ...base,
    average: 5,
    reviewCount: 3,
    reviews: [{ rating: 5, content: "Buenísimo", authorName: "Ana", createdAt: new Date("2026-08-01T10:00:00Z") }],
  });
  const rating = rated.aggregateRating as { ratingValue: number; reviewCount: number };
  assert.equal(rating.ratingValue, 5);
  assert.equal(rating.reviewCount, 3);
  const reviews = rated.review as Array<{ datePublished: string; author: { name: string } }>;
  assert.equal(reviews[0]?.author.name, "Ana");
  assert.equal(reviews[0]?.datePublished, "2026-08-01T10:00:00.000Z");
});

test("an article names a real author and the site as publisher", () => {
  const article = blogPostingSchema({
    title: "Título",
    description: "Excerpt",
    path: "/blog/post",
    cover: "/blog/cover.webp",
    publishedAt: "2026-08-26",
    authorName: "Carlos Ferreras",
    authorPath: "/quienes-somos",
  });

  const author = article.author as { "@type": string; name: string; url: string };
  assert.equal(author["@type"], "Person");
  assert.equal(author.url, absoluteUrl("/quienes-somos"));
  assert.deepEqual(article.publisher, { "@id": organizationSchema()["@id"] });
  assert.equal(article.image, absoluteUrl("/blog/cover.webp"));
});

test("the catalogue list is numbered in render order", () => {
  const list = itemListSchema([{ name: "A", path: "/servers/a" }, { name: "B", path: "/servers/b" }]);
  const items = list.itemListElement as Array<{ position: number; url: string }>;

  assert.equal(list.numberOfItems, 2);
  assert.deepEqual(items.map((item) => item.position), [1, 2]);
  assert.equal(items[0]?.url, absoluteUrl("/servers/a"));
});

// A review body is user-submitted text that lands inside a <script> block.
test("serialising escapes anything that could close the script block", () => {
  const serialized = serializeJsonLd({ review: "</script><img onerror=alert(1)>" });

  assert.ok(!serialized.includes("</script>"));
  assert.equal(JSON.parse(serialized).review, "</script><img onerror=alert(1)>");
});

test("the pages that hold the site's facts render their schema", () => {
  assert.match(readProjectFile("src/app/layout.tsx"), /organizationSchema\(\), webSiteSchema\(\)/);
  assert.match(readProjectFile("src/app/servers/[slug]/page.tsx"), /serverSchema\(/);
  assert.match(readProjectFile("src/app/servers/[slug]/page.tsx"), /breadcrumbListSchema\(/);
  assert.match(readProjectFile("src/app/blog/[slug]/page.tsx"), /blogPostingSchema\(/);
  assert.match(readProjectFile("src/app/servers/page.tsx"), /itemListSchema\(/);
});
