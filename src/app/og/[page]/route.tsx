import { AboutCard, BlogCard, ContactCard, GenericCard, HomeCard, PublishCard } from "@/lib/og/cards";
import { homeCardTitle, isStaticCardKey, staticCards, type StaticCardKey } from "@/lib/og/model";
import { renderOgCard } from "@/lib/og/render";

function card(key: StaticCardKey) {
  const entry = staticCards[key];
  switch (entry.kind) {
    case "home":
      return <HomeCard title={homeCardTitle} listLabel="" entries={[]} />;
    case "blog":
      return <BlogCard />;
    case "about":
      return <AboutCard />;
    case "contact":
      return <ContactCard />;
    case "publish":
      return <PublishCard />;
    case "generic":
      return <GenericCard title={entry.title} path={entry.path} />;
  }
}

/**
 * Cards whose content never changes. Each is drawn on its first request and left to the CDN:
 * without a Cache-Control of our own, ImageResponse marks the PNG immutable, and a deploy is what
 * clears it.
 */
export async function GET(_request: Request, { params }: RouteContext<"/og/[page]">) {
  const { page } = await params;
  if (!isStaticCardKey(page)) return new Response("Not found", { status: 404 });
  return renderOgCard(card(page));
}
