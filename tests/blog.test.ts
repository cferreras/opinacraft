import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  blogCategories,
  blogCategoryBySlug,
  blogCategoryHref,
  blogCategoryMeta,
  blogPath,
  blogPosts,
  blogPostPath,
  blogSectionId,
  findBlogPost,
  formatBlogDate,
  formatBlogDateLong,
  latestBlogPosts,
  otherBlogPosts,
  postsInCategory,
} from "@/lib/blog/posts";

const readProjectFile = (filePath: string) => readFileSync(path.resolve(filePath), "utf8");

test("every post has a unique slug, an ISO date and a known category", () => {
  assert.ok(blogPosts.length > 0);
  assert.equal(new Set(blogPosts.map((post) => post.slug)).size, blogPosts.length);

  for (const post of blogPosts) {
    assert.match(post.slug, /^[a-z0-9-]+$/, `slug: ${post.slug}`);
    assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}$/, `date: ${post.slug}`);
    assert.ok(blogCategories.includes(post.category), `category: ${post.category}`);
    assert.ok(post.title.length > 0 && post.excerpt.length > 0, `copy: ${post.slug}`);
    assert.ok(post.readingMinutes > 0, `reading time: ${post.slug}`);
    assert.ok(post.sections.length > 0, `sections: ${post.slug}`);
    for (const section of post.sections) assert.ok(section.paragraphs.length > 0, `paragraphs: ${post.slug}`);
  }
});

test("posts are stored newest first, which is the order both surfaces render", () => {
  const dates = blogPosts.map((post) => post.publishedAt);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("formats dates in Spanish without depending on the runtime's ICU data", () => {
  assert.equal(formatBlogDate("2026-08-26"), "26 ago 2026");
  assert.equal(formatBlogDate("2026-08-04"), "4 ago 2026");
  assert.equal(formatBlogDateLong("2026-08-04"), "4 de agosto de 2026");
  assert.equal(formatBlogDate("no es una fecha"), "no es una fecha");
});

test("selects the newest posts for the rail card and resolves post routes", () => {
  assert.equal(latestBlogPosts().length, Math.min(4, blogPosts.length));
  assert.deepEqual(latestBlogPosts(2).map((post) => post.slug), blogPosts.slice(0, 2).map((post) => post.slug));
  assert.equal(blogPostPath("elegir-servidor"), "/blog/elegir-servidor");
  assert.equal(findBlogPost("elegir-servidor")?.slug, "elegir-servidor");
  assert.equal(findBlogPost("no-existe"), null);
  assert.equal(otherBlogPosts("elegir-servidor").some((post) => post.slug === "elegir-servidor"), false);
});

test("the catalog renders the blog module in the rail beside the results", () => {
  const catalogSource = readProjectFile("src/app/servers/page.tsx");

  assert.match(catalogSource, /import \{ BlogHighlightsCard \} from "@\/components\/blog-highlights-card";/);
  assert.match(catalogSource, /lg:grid-cols-\[minmax\(0,1fr\)_15rem\]/);
  assert.match(catalogSource, /<aside[^>]*aria-labelledby="blog-highlights-heading"[\s\S]*?<BlogHighlightsCard \/>/);
});

test("the rail card links to the index and to each post", () => {
  const cardSource = readProjectFile("src/components/blog-highlights-card.tsx");

  assert.match(cardSource, /href=\{blogPath\}/);
  assert.match(cardSource, /href=\{blogPostPath\(post\.slug\)\}/);
  assert.match(cardSource, /id="blog-highlights-heading"/);
});

test("every post ships a cover image that exists and stays small enough to serve", () => {
  for (const post of blogPosts) {
    assert.match(post.cover, /^\/blog\/[a-z0-9-]+\.webp$/, `cover path: ${post.slug}`);
    const file = path.resolve(`public${post.cover}`);
    assert.ok(existsSync(file), `missing cover for ${post.slug}: ${post.cover}`);
    assert.ok(statSync(file).size < 120 * 1024, `cover too heavy for ${post.slug}`);
  }

  assert.equal(new Set(blogPosts.map((post) => post.cover)).size, blogPosts.length, "each post needs its own cover");
});

test("category colour comes from tokens the stylesheet actually defines", () => {
  const styles = readProjectFile("src/app/globals.css");
  const slugs = blogCategories.map((category) => blogCategoryMeta[category].slug);

  assert.equal(new Set(slugs).size, slugs.length, "category slugs must be unique");
  for (const slug of slugs) {
    assert.match(styles, new RegExp(`--category-${slug}:`), `missing --category-${slug}`);
    assert.match(styles, new RegExp(`--category-${slug}-ink:`), `missing --category-${slug}-ink`);
    assert.match(styles, new RegExp(`--color-category-${slug}: var\\(--category-${slug}\\);`), `missing theme mapping for ${slug}`);
  }

  // Tailwind extracts class names statically, so a composed `bg-category-${slug}` would never
  // reach the stylesheet: the map has to spell each class out.
  for (const category of blogCategories) {
    const meta = blogCategoryMeta[category];
    assert.ok(meta.badge.includes(`bg-category-${meta.slug}/`), `badge tint: ${category}`);
    assert.ok(meta.badge.includes(`text-category-${meta.slug}-ink`), `badge ink: ${category}`);
    assert.equal(meta.dot, `bg-category-${meta.slug}`);
    assert.equal(meta.ink, `text-category-${meta.slug}-ink`);
  }

  const darkBlock = styles.slice(styles.indexOf(".dark {"));
  for (const slug of slugs) assert.match(darkBlock, new RegExp(`--category-${slug}-ink:`), `dark ink missing for ${slug}`);
});

test("filters the index by category and resolves category routes", () => {
  assert.equal(blogCategoryBySlug("rendimiento"), "Rendimiento");
  assert.equal(blogCategoryBySlug("no-existe"), undefined);
  assert.equal(blogCategoryBySlug(undefined), undefined);
  assert.equal(blogCategoryHref("Para admins"), "/blog?categoria=admins");
  assert.equal(blogCategoryHref(), blogPath);
  assert.deepEqual(postsInCategory("Guías").map((post) => post.category), ["Guías"]);
  assert.equal(postsInCategory(undefined).length, blogPosts.length);
});

test("section anchors drop accents so the table of contents links resolve", () => {
  assert.equal(blogSectionId("Decide qué quieres hacer las tres primeras horas"), "decide-que-quieres-hacer-las-tres-primeras-horas");
  assert.equal(blogSectionId("¿Java o Bedrock?"), "java-o-bedrock");

  for (const post of blogPosts) {
    const ids = post.sections.map((section) => blogSectionId(section.heading));
    assert.equal(new Set(ids).size, ids.length, `duplicate section anchor in ${post.slug}`);
    for (const id of ids) assert.match(id, /^[a-z0-9-]+$/, `bad anchor in ${post.slug}: ${id}`);
  }
});

test("the rail leads with the newest cover and keeps the rest as text rows", () => {
  const cardSource = readProjectFile("src/components/blog-highlights-card.tsx");

  assert.match(cardSource, /const \[featured, \.\.\.rest\] = latestBlogPosts\(\);/);
  assert.equal((cardSource.match(/<Image /g) ?? []).length, 1, "only the featured post carries an image in the rail");
  assert.match(cardSource, /src=\{featured\.cover\}/);
});

test("the article renders its cover, its anchors and the contents rail", () => {
  const articleSource = readProjectFile("src/app/blog/[slug]/page.tsx");
  const tocSource = readProjectFile("src/components/blog-article-toc.tsx");

  assert.match(articleSource, /src=\{post\.cover\}/);
  assert.match(articleSource, /id=\{entries\[index\]\?\.id\}/);
  assert.match(articleSource, /scroll-mt-24/);
  assert.match(articleSource, /<BlogArticleToc entries=\{entries\} \/>/);
  assert.match(articleSource, /aspect-square/, "related posts use square thumbnails");
  assert.match(tocSource, /^"use client";/);
  assert.match(tocSource, /observer\.disconnect\(\)/, "the observer must be torn down");
});

test("the article contents rail stays below the sticky site header", () => {
  const articleSource = readProjectFile("src/app/blog/[slug]/page.tsx");

  assert.match(articleSource, /lg:sticky lg:top-\[calc\(4rem\+1\.5rem\)\]/);
  assert.doesNotMatch(articleSource, /lg:sticky lg:top-6/);
});

test("detail pages share one breadcrumb instead of each drawing its own", () => {
  const articleSource = readProjectFile("src/app/blog/[slug]/page.tsx");
  const serverSource = readProjectFile("src/app/servers/[slug]/page.tsx");
  const breadcrumbSource = readProjectFile("src/components/breadcrumbs.tsx");

  assert.match(articleSource, /<Breadcrumbs trail=\{\[\{ label: "Blog", href: blogPath \}\]\} current=\{post\.title\} \/>/);
  assert.match(serverSource, /<Breadcrumbs trail=\{\[\{ label: "Servidores", href: "\/" \}\]\} current=\{server\.name\} \/>/);
  assert.match(breadcrumbSource, /aria-label="Ruta de navegación"/);

  for (const [name, source] of [["article", articleSource], ["server", serverSource]] as const) {
    assert.equal(source.includes('aria-label="Ruta de navegación"'), false, `${name} page must not hand-roll a breadcrumb`);
  }
});

test("the index offers every category as a filter", () => {
  const indexSource = readProjectFile("src/app/blog/page.tsx");

  assert.match(indexSource, /blogCategories\.map/);
  assert.match(indexSource, /href=\{blogCategoryHref\(category\)\}/);
  assert.match(indexSource, /aria-label="Categorías del blog"/);
  // A filtered view has no lead card: inside one category every post ranks the same.
  assert.match(indexSource, /const featured = category \? undefined : posts\[0\];/);
});

test("the blog routes and the sitemap cover every published post", () => {
  const sitemapSource = readProjectFile("src/app/sitemap.ts");

  assert.equal(blogPath, "/blog");
  assert.match(readProjectFile("src/app/blog/page.tsx"), /export default async function BlogIndexPage/);
  assert.match(readProjectFile("src/app/blog/[slug]/page.tsx"), /export function generateStaticParams/);
  assert.match(sitemapSource, /\$\{siteUrl\}\$\{blogPath\}/);
  assert.match(sitemapSource, /blogPostPath\(post\.slug\)/);
});
