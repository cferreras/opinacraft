import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/seo/site-url";

export default function robots(): MetadataRoute.Robots {
  const preview = process.env.VERCEL_ENV === "preview";
  return { rules: { userAgent: "*", allow: preview ? undefined : "/", disallow: preview ? ["/"] : ["/admin", "/api/", "/profile", "/dashboard"] }, sitemap: `${siteUrl}/sitemap.xml` };
}
