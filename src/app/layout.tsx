import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpinaCraft",
  description: "Discover and share Minecraft communities.",
  icons: {
    icon: [
      {
        url: "/brand/opinacraft-mark-v2-faceted.svg",
        type: "image/svg+xml",
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
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
