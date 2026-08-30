import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import { reviewReplies, serverMembers, serverReviews, servers } from "@/schema";
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

    const reviewsToInvalidate = await tx
      .select({ id: serverReviews.id })
      .from(serverReviews)
      .where(
        and(
          eq(serverReviews.serverId, serverId),
          eq(serverReviews.userId, target.id),
          inArray(serverReviews.status, ["published", "hidden"]),
        ),
      )
      .for("update");
    if (reviewsToInvalidate.length) {
      const reviewIds = reviewsToInvalidate.map((review) => review.id);
      await tx
        .update(serverReviews)
        .set({ status: "deleted", content: "Opinión eliminada al unirse al equipo", updatedAt: new Date() })
        .where(inArray(serverReviews.id, reviewIds));
      await tx.delete(reviewReplies).where(inArray(reviewReplies.reviewId, reviewIds));
    }

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
