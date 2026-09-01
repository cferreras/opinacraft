import type { MetadataRoute } from "next";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { servers } from "@/schema";
import { aboutPath } from "@/lib/site/about";
import { blogPath, blogPosts, blogPostPath } from "@/lib/blog/posts";
import { siteUrl } from "@/lib/seo/site-url";

export const revalidate = 3600;

// `changefreq` and `priority` are gone: Google ignores both and has said so. `lastModified` is the
// one signal it does read, so every entry carries one -- including the homepage, whose freshness is
// the freshness of the newest thing in the catalogue.
const staticPages = [aboutPath, "/contact", "/terms", "/privacy"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let rows: Array<{ slug: string; updatedAt: Date }> = [];
  try {
    rows = await db.select({ slug: servers.slug, updatedAt: servers.updatedAt }).from(servers).where(and(eq(servers.publicationStatus, "published"), eq(servers.moderationStatus, "active"), isNull(servers.availabilityHiddenAt)));
  } catch {
    // The build environment may not have database network access; the route
    // becomes complete on the first request in the deployed runtime.
  }
  const newestPost = blogPosts.reduce<Date | null>((newest, post) => {
    const published = new Date(post.publishedAt);
    return !newest || published > newest ? published : newest;
  }, null);
  const newestServer = rows.reduce<Date | null>((newest, row) => (!newest || row.updatedAt > newest ? row.updatedAt : newest), null);
  const catalogModified = [newestPost, newestServer].filter((value): value is Date => value !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? new Date();

  return [
    { url: siteUrl, lastModified: catalogModified },
    { url: `${siteUrl}${blogPath}`, lastModified: newestPost ?? catalogModified },
    ...blogPosts.map((post) => ({ url: `${siteUrl}${blogPostPath(post.slug)}`, lastModified: new Date(post.publishedAt) })),
    ...rows.map((row) => ({ url: `${siteUrl}/servers/${row.slug}`, lastModified: row.updatedAt })),
    // `/servers/new` and `/sign-up` stay out deliberately: they are interaction endpoints, not
    // content, and a sitemap is a claim about what there is to read.
    ...staticPages.map((path) => ({ url: `${siteUrl}${path}`, lastModified: catalogModified })),
  ];
}
