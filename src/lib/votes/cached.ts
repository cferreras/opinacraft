import { cacheLife, cacheTag } from "next/cache";

import { clientEnv } from "@/env/client";
import { getMonthlyVotes, getServerVoteStats, getVerifiedVoters } from "./service";
import { votingMonth } from "./month";

export function votesEnabled() {
  return clientEnv.NEXT_PUBLIC_VOTES_ENABLED === "true";
}

/**
 * Vote figures are cached for a minute rather than invalidated per vote: a burst of votes from a
 * server's Discord must not turn into a burst of ranking queries. A voter's own confirmation comes
 * straight from the vote's transaction, so the lag only shows to everyone else.
 */
export function votesTag() {
  return "votes:ranking";
}

export function voterTag(serverId: string) {
  return `votes:voters:${serverId}`;
}

export async function getCachedServerVoteStats(serverId: string) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(votesTag());
  return getServerVoteStats(serverId);
}

export async function getCachedMonthlyVotes(serverIds: string[], month = votingMonth()) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(votesTag());
  return Object.fromEntries(await getMonthlyVotes(serverIds, month)) as Record<string, number>;
}

/** Serialised as a list: a Set does not survive the cache. */
export async function getCachedVerifiedVoters(serverId: string, userIds: string[]) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  cacheTag(voterTag(serverId));
  return [...await getVerifiedVoters(serverId, userIds)];
}
