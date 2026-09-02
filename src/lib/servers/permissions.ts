import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { serverMembers } from "@/schema";

export type ServerRole = "owner" | "admin" | "editor";

export type ServerCapability =
  | "identity:edit"
  | "content:edit"
  | "endpoint:edit"
  | "publication:edit"
  | "members:view"
  | "members:manage"
  | "verification:manage"
  | "server:delete";

const roleCapabilities: Record<ServerRole, readonly ServerCapability[]> = {
  owner: [
    "identity:edit",
    "content:edit",
    "endpoint:edit",
    "publication:edit",
    "members:view",
    "members:manage",
    "verification:manage",
    // Destructive lifecycle operation: never granted to admins or editors.
    "server:delete",
  ],
  admin: [
    "identity:edit",
    "content:edit",
    "endpoint:edit",
    "members:view",
  ],
  editor: ["content:edit"],
};

export class ServerPermissionError extends Error {
  constructor() {
    super("You do not have permission to manage this server.");
    this.name = "ServerPermissionError";
  }
}

type MembershipReader = Pick<typeof db, "select">;

export async function getServerRole(
  serverId: string,
  userId: string,
  reader: MembershipReader = db,
) {
  const [membership] = await reader
    .select({ role: serverMembers.role })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    )
    .limit(1);

  return membership?.role ?? null;
}

export async function requireServerRole(
  serverId: string,
  userId: string,
  allowedRoles: readonly ServerRole[],
  reader: MembershipReader = db,
) {
  const role = await getServerRole(serverId, userId, reader);

  if (!role || !allowedRoles.includes(role)) {
    throw new ServerPermissionError();
  }

  return role;
}

export async function requireServerCapability(
  serverId: string,
  userId: string,
  capability: ServerCapability,
  reader: MembershipReader = db,
) {
  const role = await getServerRole(serverId, userId, reader);

  if (!role || !roleCapabilities[role].includes(capability)) {
    throw new ServerPermissionError();
  }

  return role;
}

export function canRole(capability: ServerCapability, role: ServerRole) {
  return roleCapabilities[role].includes(capability);
}
