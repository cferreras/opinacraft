import { connection } from "next/server";

import { HomeCard, type HomeCardData } from "@/lib/og/cards";
import { serverLogoDataUri } from "@/lib/og/logo";
import { dynamicCardCacheControl, formatCount, formatRating, homeCardTitle } from "@/lib/og/model";
import { renderOgCard } from "@/lib/og/render";
import { getCachedPublishedServerPage } from "@/lib/servers/cached-queries";
import { votesEnabled } from "@/lib/votes/cached";
import { monthlyReset } from "@/lib/votes/month";

/**
 * The home page's card, with the month's top three beside the headline. While votes are off the
 * list is the best rated instead; an empty catalog drops the list and lets the headline fill in.
 */
async function topEntries(): Promise<Pick<HomeCardData, "listLabel" | "entries">> {
  const reset = monthlyReset();
  if (votesEnabled()) {
    const page = await getCachedPublishedServerPage({ sort: "votes", month: reset.month, page: 1 });
    const ranked = page.servers
      .map((server) => ({ server, votes: page.ranking?.[server.id]?.votes ?? 0 }))
      .filter(({ votes }) => votes > 0)
      .slice(0, 3);
    if (ranked.length) {
      return {
        listLabel: `MÁS VOTADOS · ${reset.monthName.toUpperCase()}`,
        entries: await Promise.all(ranked.map(async ({ server, votes }) => ({ name: server.name, logo: await serverLogoDataUri(server.media, 48), value: formatCount(votes), star: false }))),
      };
    }
  }
  const page = await getCachedPublishedServerPage({ sort: "rating", page: 1 });
  const rated = page.servers.filter((server) => server.reviewCount > 0 && server.reviewAverage !== null).slice(0, 3);
  return {
    listLabel: "MEJOR VALORADOS",
    entries: await Promise.all(rated.map(async (server) => ({ name: server.name, logo: await serverLogoDataUri(server.media, 48), value: formatRating(server.reviewAverage) ?? "", star: true }))),
  };
}

export async function GET() {
  await connection();
  const list = await topEntries().catch((error: unknown) => {
    console.error("[og] home ranking unavailable", error instanceof Error ? error.name : "unknown");
    return { listLabel: "", entries: [] };
  });
  return renderOgCard(<HomeCard title={homeCardTitle} {...list} />, { cacheControl: dynamicCardCacheControl });
}
