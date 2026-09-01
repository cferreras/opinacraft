import type { Metadata } from "next";

type OpenGraphImages = NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;

// The default share card, used by every route that has no image of its own.
// Metadata declared in code -- not an `opengraph-image` file convention -- on
// purpose: file-based metadata outranks config-based metadata in Next, so a
// file here would silently override each blog post's own cover.
//
// Next merges `openGraph` shallowly, so a page that declares the object at all
// replaces the one it inherits. Every page with its own `openGraph` therefore
// has to spread these images back in.
export const OG_IMAGES: OpenGraphImages = [
  {
    url: "/brand/og-default.jpg",
    width: 1200,
    height: 630,
    alt: "OpinaCraft: descubre y compara servidores de Minecraft con opiniones reales de jugadores.",
  },
];
