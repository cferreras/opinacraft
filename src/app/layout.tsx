import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteFooter } from "@/components/site-footer";
import { OG_IMAGES } from "@/lib/brand/og";


export const metadata: Metadata = {
  // Social metadata needs absolute URLs. This resolves against the same base the
  // sitemap uses, so a preview deployment advertises itself, not production.
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "OpinaCraft",
  // Fallback for the routes that set no description of their own. Kept distinct
  // from the catalog's, which is the one that has to rank.
  description: "Descubre y comparte comunidades de Minecraft.",
  // Inherited by every route that declares no openGraph of its own. X reads
  // og:image when twitter:image is absent, so the card type is all that has to
  // be set here to get the wide layout instead of the small thumbnail.
  openGraph: { images: OG_IMAGES },
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
        {/* The theme provider stays outside the boundary: next-themes renders its anti-flash script,
            and React drops script tags rendered on the client. */}
        <ThemeProvider>
          <TooltipProvider>
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
