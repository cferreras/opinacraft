import type { Metadata } from "next";

import { OG_IMAGES } from "@/lib/brand/og";
import { absoluteUrl, siteLocale, siteName } from "@/lib/seo/site-url";

type OpenGraph = NonNullable<Metadata["openGraph"]>;
type OpenGraphImages = NonNullable<OpenGraph["images"]>;

/**
 * Next merges `openGraph` shallowly: a page that declares the object at all replaces the one it
 * inherits from the root layout, which is how `og:url`, `og:locale` and `og:site_name` went missing
 * from every page that set a title of its own. Every route builds its card through here so the
 * three constants come back automatically, and `og:url` names the canonical URL rather than
 * whatever URL was shared -- without it, a share of `/?edition=java` propagates the filtered URL.
 */
export function buildOpenGraph({
  title,
  description,
  path,
  type = "website",
  images = OG_IMAGES,
  publishedTime,
}: {
  title: string;
  description?: string;
  path: string;
  type?: "website" | "article";
  images?: OpenGraphImages;
  publishedTime?: string;
}): OpenGraph {
  const base = {
    title,
    description,
    url: absoluteUrl(path),
    siteName,
    locale: siteLocale,
    images,
  };
  return type === "article" ? { ...base, type, publishedTime } : { ...base, type };
}
