import type { Metadata } from "next";

import PublicServersPage, { catalogDescription, catalogTitle } from "@/app/servers/page";
import { buildOpenGraph } from "@/lib/seo/open-graph";

export const metadata: Metadata = {
  title: catalogTitle,
  description: catalogDescription,
  alternates: { canonical: "/" },
  openGraph: buildOpenGraph({ title: catalogTitle, description: catalogDescription, path: "/" }),
};

export default PublicServersPage;
