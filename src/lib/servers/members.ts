import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import { serverMembers, serverReviews, servers } from "@/schema";
import {
  requireServerCapability,
} from "@/lib/servers/permissions";
import { ServerNotFoundError } from "@/lib/servers/service";
import { databaseErrorCode } from "@/lib/db-errors";

export class MemberNotFoundError extends Error {
  constructor() {
    super("No account was found for that email.");
    this.name = "MemberNotFoundError";
  }
}

export class DuplicateMemberError extends Error {
  constructor() {
    super("That account is already a member of this server.");
    this.name = "DuplicateMemberError";
  }
}

export class OwnerMembershipError extends Error {
  constructor() {
    super("The server owner cannot be changed by this action.");
    this.name = "OwnerMembershipError";
  }
}

export async function listServerMembers(serverId: string, userId: string) {
  await requireServerCapability(serverId, userId, "members:view");

  return db
    .select({
      userId: serverMembers.userId,
      name: user.name,
      email: user.email,
      image: user.image,
      role: serverMembers.role,
      joinedAt: serverMembers.joinedAt,
    })
    .from(serverMembers)
    .innerJoin(user, eq(serverMembers.userId, user.id))
    .where(eq(serverMembers.serverId, serverId))
    .orderBy(sql`case when ${serverMembers.role} = 'owner' then 0 when ${serverMembers.role} = 'admin' then 1 else 2 end`, user.name);
}

export async function addServerMember(
  serverId: string,
  actorUserId: string,
  email: string,
  role: "admin" | "editor",
) {
  const normalizedEmail = email.trim().toLowerCase();

  return db.transaction(async (tx) => {
    await lockServer(tx, serverId);
    await requireServerCapability(serverId, actorUserId, "members:manage", tx);

    const [target] = await tx
      .select({ id: user.id })
      .from(user)
      .where(sql`lower(${user.email}) = ${normalizedEmail}`)
      .limit(1);

    if (!target) {
      throw new MemberNotFoundError();
    }

    try {
      await tx.insert(serverMembers).values({
        serverId,
        userId: target.id,
        role,
      });
    } catch (error) {
      if (databaseErrorCode(error) === "23505") {
        throw new DuplicateMemberError();
      }
      throw error;
    }

    // Team membership creates a conflict of interest, so the member's own
    // reviews stop being public. Granting membership is not consent from the
    // target to lose their content, so nothing is destroyed here: the reviews
    // and their replies are withheld and come back if the membership ends.
    await tx
      .update(serverReviews)
      .set({ withheldAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(serverReviews.serverId, serverId),
          eq(serverReviews.userId, target.id),
          inArray(serverReviews.status, ["published", "hidden"]),
          isNull(serverReviews.withheldAt),
        ),
      );

    return target.id;
  });
}

export async function changeServerMemberRole(
  serverId: string,
  actorUserId: string,
  targetUserId: string,
  role: "admin" | "editor",
) {
  return db.transaction(async (tx) => {
    await lockServer(tx, serverId);
    await requireServerCapability(serverId, actorUserId, "members:manage", tx);
    const [membership] = await tx
      .select({ role: serverMembers.role })
      .from(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, serverId),
          eq(serverMembers.userId, targetUserId),
        ),
      )
      .for("update")
      .limit(1);

    if (!membership) {
      throw new MemberNotFoundError();
    }
    if (membership.role === "owner") {
      throw new OwnerMembershipError();
    }

    await tx
      .update(serverMembers)
      .set({ role })
      .where(
        and(
          eq(serverMembers.serverId, serverId),
          eq(serverMembers.userId, targetUserId),
        ),
      );
  });
}

export async function removeServerMember(
  serverId: string,
  actorUserId: string,
  targetUserId: string,
) {
  return db.transaction(async (tx) => {
    await lockServer(tx, serverId);
    await requireServerCapability(serverId, actorUserId, "members:manage", tx);
    const [membership] = await tx
      .select({ role: serverMembers.role })
      .from(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, serverId),
          eq(serverMembers.userId, targetUserId),
        ),
      )
      .for("update")
      .limit(1);

    if (!membership) {
      throw new MemberNotFoundError();
    }
    if (membership.role === "owner") {
      throw new OwnerMembershipError();
    }

    await tx
      .delete(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, serverId),
          eq(serverMembers.userId, targetUserId),
        ),
      );

    // The conflict of interest ends with the membership, so the reviews that
    // were withheld on joining become public again.
    await tx
      .update(serverReviews)
      .set({ withheldAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(serverReviews.serverId, serverId),
          eq(serverReviews.userId, targetUserId),
          isNotNull(serverReviews.withheldAt),
        ),
      );
  });
}

async function lockServer(tx: Pick<typeof db, "select">, serverId: string) {
  const [server] = await tx
    .select({ id: servers.id })
    .from(servers)
    .where(eq(servers.id, serverId))
    .for("update")
    .limit(1);
  if (!server) throw new ServerNotFoundError();
}
