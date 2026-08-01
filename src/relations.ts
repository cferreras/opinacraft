import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";
import { user } from "./auth-schema";

export const relations = defineRelations({ ...schema, user }, (r) => ({
  servers: {
    endpoints: r.many.serverEndpoints(),
    members: r.many.serverMembers(),
    verifications: r.many.serverVerifications(),
    tags: r.many.serverTags(),
    media: r.many.serverMedia(),
    reviews: r.many.serverReviews(),
    reviewReports: r.many.serverReviewReports(),
  },
  serverEndpoints: {
    server: r.one.servers({
      from: r.serverEndpoints.serverId,
      to: r.servers.id,
    }),
  },
  serverMembers: {
    server: r.one.servers({
      from: r.serverMembers.serverId,
      to: r.servers.id,
    }),
    user: r.one.user({
      from: r.serverMembers.userId,
      to: r.user.id,
    }),
  },
  serverVerifications: {
    server: r.one.servers({
      from: r.serverVerifications.serverId,
      to: r.servers.id,
    }),
    requestedBy: r.one.user({
      from: r.serverVerifications.requestedByUserId,
      to: r.user.id,
    }),
  },
  serverTags: {
    server: r.one.servers({
      from: r.serverTags.serverId,
      to: r.servers.id,
    }),
    tag: r.one.tags({
      from: r.serverTags.tagId,
      to: r.tags.id,
    }),
  },
  tags: {
    servers: r.many.serverTags(),
  },
  serverMedia: {
    server: r.one.servers({
      from: r.serverMedia.serverId,
      to: r.servers.id,
    }),
  },
  serverReviews: {
    server: r.one.servers({
      from: r.serverReviews.serverId,
      to: r.servers.id,
    }),
    user: r.one.user({
      from: r.serverReviews.userId,
      to: r.user.id,
    }),
    reply: r.one.reviewReplies({
      from: r.serverReviews.id,
      to: r.reviewReplies.reviewId,
    }),
    reports: r.many.serverReviewReports(),
  },
  reviewReplies: {
    review: r.one.serverReviews({
      from: r.reviewReplies.reviewId,
      to: r.serverReviews.id,
    }),
    user: r.one.user({
      from: r.reviewReplies.userId,
      to: r.user.id,
    }),
  },
  serverReviewReports: {
    server: r.one.servers({
      from: r.serverReviewReports.serverId,
      to: r.servers.id,
    }),
    review: r.one.serverReviews({
      from: r.serverReviewReports.reviewId,
      to: r.serverReviews.id,
    }),
    reporter: r.one.user({
      from: r.serverReviewReports.reporterUserId,
      to: r.user.id,
    }),
    assignedTo: r.one.user({
      from: r.serverReviewReports.assignedToUserId,
      to: r.user.id,
    }),
  },
}));
