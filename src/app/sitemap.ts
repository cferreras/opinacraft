import type { MetadataRoute } from "next";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { servers } from "@/schema";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  let rows: Array<{ slug: string; updatedAt: Date }> = [];
  try {
    rows = await db.select({ slug: servers.slug, updatedAt: servers.updatedAt }).from(servers).where(and(eq(servers.publicationStatus, "published"), eq(servers.moderationStatus, "active"), isNull(servers.availabilityHiddenAt)));
  } catch {
    // The build environment may not have database network access; the route
    // becomes complete on the first request in the deployed runtime.
  }
  return [{ url: base, changeFrequency: "daily", priority: 1 }, ...rows.map((row) => ({ url: `${base}/servers/${row.slug}`, lastModified: row.updatedAt, changeFrequency: "daily" as const, priority: .7 }))];
}
