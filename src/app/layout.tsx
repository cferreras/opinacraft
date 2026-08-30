import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteFooter } from "@/components/site-footer";


export const metadata: Metadata = {
  title: "OpinaCraft",
  description: "Discover and share Minecraft communities.",
  icons: {
    icon: [
      {
        url: "/brand/opinacraft-server-mark.webp",
        type: "image/webp",
        sizes: "256x256",
      },
    ],
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
