import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { OG_IMAGES } from "@/lib/brand/og";
import { siteLocale, siteName, siteUrl } from "@/lib/seo/site-url";
import { organizationSchema, webSiteSchema } from "@/lib/seo/structured-data";


export const metadata: Metadata = {
  // Social metadata needs absolute URLs, and a canonical has to name the host that answers 200.
  // `siteUrl` normalises the apex to the www host it redirects to; a preview deployment still
  // advertises itself, not production.
  metadataBase: new URL(siteUrl),
  title: "OpinaCraft",
  // Fallback for the routes that set no description of their own. Kept distinct
  // from the catalog's, which is the one that has to rank.
  description: "Descubre y comparte comunidades de Minecraft.",
  // Inherited by every route that declares no openGraph of its own. X reads
  // og:image when twitter:image is absent, so the card type is all that has to
  // be set here to get the wide layout instead of the small thumbnail. Routes that
  // do declare one build it through `buildOpenGraph`, which restores these fields --
  // Next replaces the object wholesale rather than merging into it.
  openGraph: { siteName, locale: siteLocale, type: "website", url: siteUrl, images: OG_IMAGES },
  twitter: { card: "summary_large_image" },
  icons: {
    // favicon.ico comes from the app-directory file convention; the SVG is what
    // modern browsers actually pick up, and it stays crisp at any density.
    icon: [{ url: "/brand/opinacraft-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/opinacraft-apple-touch-icon.png", sizes: "180x180" }],
  },
  robots:
    process.env.VERCEL_ENV === "preview"
      ? { index: false, follow: false }
      : undefined,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        {/* Sitewide identity: the publisher every BlogPosting points at, and the site search the
            header already runs on ⌘K. Rendered outside the streaming boundary so it is in the
            static shell of every route. */}
        <JsonLd data={[organizationSchema(), webSiteSchema()]} />
        {/* The theme provider stays outside the boundary: next-themes renders its anti-flash script,
            and React drops script tags rendered on the client. */}
        <ThemeProvider>
          <TooltipProvider>
            {/* The footer sits inside the boundary on purpose. Rendering it before the page content
                arrives puts it near the top of a short document and then shoves it down when the
                content streams in -- the layout shift that used to cost the server pages a failing
                CLS. Nothing renders until the content does, so nothing moves. */}
            <Suspense fallback={null}>
              <div className="flex min-h-screen flex-col">
                <div className="flex min-h-0 flex-1 flex-col">{children}</div>
                <SiteFooter />
              </div>
            </Suspense>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
