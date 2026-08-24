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

export async function getCachedPublishedServer(slug: string): Promise<PublicServer | null> {
  "use cache";
  cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag(), publicServerSlugTag(slug));
  return getPublishedServerCoreBySlug(slug);
}

export async function getCachedPublishedServerPage(args: PublishedServerListArgs) {
  "use cache";
  cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag());
  return listPublishedServersFromNeon(args);
}

export async function getCachedMonitorCatalogPage(args: PublishedServerListArgs) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 45, expire: 120 });
  cacheTag("monitor:catalog");
  return listPublishedServersWithMonitor({
    page: args.page ?? 1,
    query: args.query ?? "",
    tagSlugs: args.tagSlugs ?? [],
    edition: args.edition,
    status: args.status,
    sort: args.sort ?? "rating",
    tableSort: args.tableSort,
    tableDirection: args.tableDirection ?? "asc",
  });
}

export async function getCachedPublishedServerCount() {
  "use cache";
  cacheLife({ stale: 180, revalidate: 300, expire: 900 });
  cacheTag(publicServersTag());
  const { countPublishedServers } = await import("./queries");
  return countPublishedServers();
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
