import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { serverMembers } from "@/schema";

export type ServerRole = "owner" | "admin" | "editor";

export class ServerPermissionError extends Error {
  constructor() {
    super("You do not have permission to manage this server.");
    this.name = "ServerPermissionError";
  }
}

export async function requireServerRole(
  serverId: string,
  userId: string,
  allowedRoles: readonly ServerRole[],
) {
  const [membership] = await db
    .select({ role: serverMembers.role })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
        inArray(serverMembers.role, allowedRoles),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new ServerPermissionError();
  }

  return membership.role;
}
