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
}));
