import { cacheLife, cacheTag } from "next/cache";

import { fetchMonitorHistory, fetchMonitorStatuses } from "./monitor-api-client";
import {
  getPublishedServerCoreBySlug,
  listPublishedServersFromNeon,
  listPublishedServersWithMonitor,
  type PublishedServerListArgs,
  type PublicServer,
} from "./queries";
import { getReviewSummary, listServerReviews } from "./reviews";
import { publicServerSlugTag, publicServersTag, reviewListTag, reviewSummaryTag, userAvatarsTag } from "./cache-tags";
import { votesTag } from "@/lib/votes/cached";
import { getFeaturedOpinions, type FeaturedOpinion } from "@/lib/votes/featured-opinions";

export async function getCachedPublishedServer(slug: string): Promise<PublicServer | null> {
  "use cache";
  cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag(), publicServerSlugTag(slug));
  return getPublishedServerCoreBySlug(slug);
}

/**
 * `args.month` is part of the key, so the ranking starts over on the 1st instead of serving last
 * month's order. Ranked pages live as long as the vote figures do: an order older than the votes
 * printed beside it would show a row with fewer votes above one with more.
 */
export async function getCachedPublishedServerPage(args: PublishedServerListArgs) {
  "use cache";
  if (args.sort === "votes") cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  else cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag(), votesTag());
  return listPublishedServersFromNeon(args);
}

export async function getCachedMonitorCatalogPage(args: PublishedServerListArgs) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 45, expire: 120 });
  cacheTag("monitor:catalog", votesTag());
  return listPublishedServersWithMonitor({
    page: args.page ?? 1,
    query: args.query ?? "",
    mode: args.mode,
    country: args.country,
    version: args.version,
    access: args.access,
    edition: args.edition,
    status: args.status,
    sort: args.sort ?? "rating",
    tableSort: args.tableSort,
    tableDirection: args.tableDirection ?? "asc",
    month: args.month,
  });
}

export async function getCachedCatalogVersions() {
  "use cache";
  cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag());
  const { listCatalogVersions } = await import("./queries");
  return listCatalogVersions();
}

export async function getCachedPublishedServerCount() {
  "use cache";
  cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag());
  const { countPublishedServers } = await import("./queries");
  return countPublishedServers();
}

/**
 * The quote on each catalog row. Reviews already invalidate the public catalog, and the votes tag
 * covers the preference for voters' opinions; a Map does not survive the cache, so it is a record.
 */
export async function getCachedFeaturedOpinions(serverIds: readonly string[]): Promise<Record<string, FeaturedOpinion>> {
  "use cache";
  cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag(), votesTag());
  return Object.fromEntries(await getFeaturedOpinions(serverIds));
}

export async function getCachedReviewSummary(serverId: string) {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300, expire: 1_800 });
  cacheTag(reviewSummaryTag(serverId));
  return getReviewSummary(serverId);
}

export async function getCachedPublicReviews(serverId: string, page: number) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 180, expire: 900 });
  // Deliberately use one tag for every page so a mutation cannot leave a stale page behind.
  cacheTag(reviewListTag(serverId));
  cacheTag(userAvatarsTag());
  return listServerReviews(serverId, page);
}

export async function getCachedMonitorStatuses(serverIds: readonly string[]) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 45, expire: 120 });
  cacheTag("monitor:statuses");
  return fetchMonitorStatuses([...serverIds]);
}

export async function getCachedMonitorHistory(serverId: string, period: "24h" | "7d" | "30d" | "90d") {
  "use cache";
  cacheLife({ stale: 30, revalidate: 45, expire: 120 });
  cacheTag(`monitor:history:${serverId}`);
  return fetchMonitorHistory(serverId, period);
}
