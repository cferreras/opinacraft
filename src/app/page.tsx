import type { Metadata } from "next";

import PublicServersPage from "@/app/servers/page";

export const metadata: Metadata = {
  title: "Servidores Minecraft | OpinaCraft",
  description: "Descubre, compara y únete a comunidades de Minecraft en OpinaCraft.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Servidores Minecraft | OpinaCraft",
    description: "Descubre, compara y únete a comunidades de Minecraft en OpinaCraft.",
    type: "website",
  },
};

export default PublicServersPage;
