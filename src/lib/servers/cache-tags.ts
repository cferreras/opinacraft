import { updateTag } from "next/cache";

export function publicServersTag() {
  return "servers:public";
}

export function publicServerTag(serverId: string) {
  return `server:public:${serverId}`;
}

export function publicServerSlugTag(slug: string) {
  return `server:public:slug:${slug}`;
}

export function reviewListTag(serverId: string) {
  return `reviews:list:${serverId}`;
}

export function reviewSummaryTag(serverId: string) {
  return `reviews:summary:${serverId}`;
}

export function userAvatarsTag() {
  return "users:avatars";
}

export function invalidateReviewCache(serverId: string) {
  updateTag(reviewListTag(serverId));
  updateTag(reviewSummaryTag(serverId));
  // Catalog cards include the public review average/count, so invalidate that
  // Neon-backed cache together with the review-specific pages.
  updateTag(publicServersTag());
}

export function invalidatePublicServerCache(serverId?: string, slug?: string) {
  updateTag(publicServersTag());
  if (serverId) updateTag(publicServerTag(serverId));
  if (slug) updateTag(publicServerSlugTag(slug));
}
