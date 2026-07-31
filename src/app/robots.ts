import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const preview = process.env.VERCEL_ENV === "preview";
  return { rules: { userAgent: "*", allow: preview ? undefined : "/", disallow: preview ? ["/"] : ["/admin", "/api/", "/profile", "/dashboard"] }, sitemap: `${base}/sitemap.xml` };
}
