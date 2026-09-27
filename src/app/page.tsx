import type { Metadata } from "next";

import PublicServersPage, { catalogDescription, catalogTitle } from "@/app/servers/page";
import { homeCardPath, ogCardImage } from "@/lib/og/model";
import { buildOpenGraph } from "@/lib/seo/open-graph";

export const metadata: Metadata = {
  title: catalogTitle,
  description: catalogDescription,
  alternates: { canonical: "/" },
  openGraph: buildOpenGraph({ title: catalogTitle, description: catalogDescription, path: "/", images: ogCardImage(homeCardPath, "OpinaCraft: servidores de Minecraft en español y los más votados del mes.") }),
};

export default PublicServersPage;
