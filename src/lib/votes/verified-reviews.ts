import { cacheLife, cacheTag } from "next/cache";

import { reviewSummaryTag } from "@/lib/servers/cache-tags";
import { countVerifiedReviews } from "@/lib/servers/reviews";
import { voterTag } from "./cached";

/** Follows the review summary's lifetime; a new vote shows up through the voters tag. */
export async function getCachedVerifiedReviewCount(serverId: string) {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300, expire: 1_800 });
  cacheTag(reviewSummaryTag(serverId), voterTag(serverId));
  return countVerifiedReviews(serverId);
}
