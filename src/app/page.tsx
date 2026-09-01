import type { Metadata } from "next";

import PublicServersPage from "@/app/servers/page";
import { OG_IMAGES } from "@/lib/brand/og";

export const metadata: Metadata = {
  title: "Servidores Minecraft | OpinaCraft",
  description: "Descubre, compara y únete a comunidades de Minecraft en OpinaCraft.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Servidores Minecraft | OpinaCraft",
    description: "Descubre, compara y únete a comunidades de Minecraft en OpinaCraft.",
    type: "website",
    images: OG_IMAGES,
  },
};

export default PublicServersPage;
