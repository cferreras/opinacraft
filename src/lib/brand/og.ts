import type { Metadata } from "next";

import { ogCardImage, staticCardPath } from "@/lib/og/model";

type OpenGraphImages = NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;

// The default share card, used by every route that has no image of its own: the static brand
// card drawn by /og/[page]. Metadata declared in code -- not an `opengraph-image` file
// convention -- on purpose: file-based metadata outranks config-based metadata in Next, so a
// file here would silently override each blog post's own cover.
//
// Next merges `openGraph` shallowly, so a page that declares the object at all
// replaces the one it inherits. Every page with its own `openGraph` therefore
// has to spread these images back in.
export const OG_IMAGES: OpenGraphImages = ogCardImage(
  staticCardPath("marca"),
  "OpinaCraft: descubre y compara servidores de Minecraft con opiniones reales de jugadores.",
);
