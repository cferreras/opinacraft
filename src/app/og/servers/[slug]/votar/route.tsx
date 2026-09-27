import { connection } from "next/server";

import { VoteCard } from "@/lib/og/cards";
import { serverLogoDataUri } from "@/lib/og/logo";
import { dynamicCardCacheControl, formatCount } from "@/lib/og/model";
import { renderOgCard } from "@/lib/og/render";
import { getCachedPublishedServer } from "@/lib/servers/cached-queries";
import { getCachedServerVoteStats, votesEnabled } from "@/lib/votes/cached";
import { monthlyReset } from "@/lib/votes/month";

/** The vote page's share card: the call to vote, and where the server stands this month. */
export async function GET(_request: Request, { params }: RouteContext<"/og/servers/[slug]/votar">) {
  await connection();
  if (!votesEnabled()) return new Response("Not found", { status: 404 });
  const { slug } = await params;
  const server = await getCachedPublishedServer(slug);
  if (!server) return new Response("Not found", { status: 404 });

  const [stats, logo] = await Promise.all([getCachedServerVoteStats(server.id), serverLogoDataUri(server.media, 72)]);
  return renderOgCard(
    <VoteCard
      name={server.name}
      slug={server.slug}
      logo={logo}
      monthName={monthlyReset().monthName}
      position={stats.votes > 0 ? stats.position : null}
      votes={formatCount(stats.votes)}
    />,
    { cacheControl: dynamicCardCacheControl },
  );
}
