/**
 * One host for every absolute URL the site publishes.
 *
 * Canonicals, the sitemap, the `Sitemap:` line in robots.txt and Open Graph all have to name the
 * host that actually answers 200. Production is served from `www.opinacraft.com` and the apex
 * 308-redirects to it, so a base URL taken straight from `BETTER_AUTH_URL` (which names the apex)
 * makes every page declare a canonical that redirects away from itself.
 *
 * The alias table is the fix: the deployment keeps whatever origin its auth flow needs, and the
 * public URLs are normalised to the host that serves them. `SITE_URL` overrides everything when a
 * deployment needs to say something different.
 */
const canonicalHostAliases: Record<string, string> = {
  "opinacraft.com": "www.opinacraft.com",
};

/** Normalises a base URL to the origin that serves a 200, with no trailing slash. */
export function canonicalSiteUrl(rawBase: string | undefined): string {
  let url: URL;
  try {
    url = new URL(rawBase ?? "http://localhost:3000");
  } catch {
    url = new URL("http://localhost:3000");
  }
  const alias = canonicalHostAliases[url.hostname];
  if (alias) url.hostname = alias;
  return url.origin;
}

export const siteUrl = canonicalSiteUrl(process.env.SITE_URL ?? process.env.BETTER_AUTH_URL);

/** Absolute URL for a site-relative path, for schema `@id`/`url` and `og:url`. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export const siteName = "OpinaCraft";
export const siteLocale = "es_ES";
