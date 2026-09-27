import { connection } from "next/server";

import { ServerCard } from "@/lib/og/cards";
import { serverLogoDataUri } from "@/lib/og/logo";
import { dynamicCardCacheControl, formatCount, formatRating } from "@/lib/og/model";
import { renderOgCard } from "@/lib/og/render";
import { getCachedMonitorStatuses, getCachedPublishedServer, getCachedReviewSummary } from "@/lib/servers/cached-queries";
import { editionLabel, formatEndpoint, primaryEndpoint } from "@/lib/servers/format";
import { gameModeLabel } from "@/lib/servers/game-modes";
import { monitorFromApi } from "@/lib/servers/queries";
import { getCachedServerVoteStats, votesEnabled } from "@/lib/votes/cached";

/** The ficha's share card: who the server is and how it is doing right now. */
export async function GET(_request: Request, { params }: RouteContext<"/og/servers/[slug]">) {
  await connection();
  const { slug } = await params;
  const core = await getCachedPublishedServer(slug);
  if (!core) return new Response("Not found", { status: 404 });

  const [server, summary, votes, logo] = await Promise.all([
    getCachedMonitorStatuses([core.id])
      .then((states) => (states ? monitorFromApi(core, states.find((state) => state.serverId === core.id) ?? null) : core))
      // The card still has everything else to say without the monitor.
      .catch(() => core),
    getCachedReviewSummary(core.id),
    votesEnabled() ? getCachedServerVoteStats(core.id).catch(() => null) : Promise.resolve(null),
    serverLogoDataUri(core.media, 120),
  ]);
  const endpoint = primaryEndpoint(server);
  const online = server.aggregateStatus === "online";

  return renderOgCard(
    <ServerCard
      name={server.name}
      logo={logo}
      address={endpoint ? formatEndpoint(endpoint) : null}
      status={server.aggregateStatus}
      rating={formatRating(summary.average)}
      reviewCount={summary.total}
      playersCurrent={online ? server.monitor.playersCurrent : null}
      playersMax={online ? server.monitor.playersMax : null}
      monthlyVotes={votes ? formatCount(votes.votes) : null}
      modes={server.gameModes.map((mode) => gameModeLabel(mode)).slice(0, 2).join(" · ") || null}
      editions={editionLabel(server)}
    />,
    { cacheControl: dynamicCardCacheControl },
  );
}
