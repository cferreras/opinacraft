import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/auth-schema";
import { monitorSyncOutbox, notificationJobs, serverMembers, servers } from "@/schema";
import type { PendingMonitorEvent } from "./events";

function eventDate(event: PendingMonitorEvent) {
  const date = new Date(event.occurredAt);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid monitor event timestamp: ${event.id}`);
  return date;
}

function eventEdition(event: PendingMonitorEvent) {
  return event.payload.edition === "bedrock" ? "bedrock" : "java";
}

export async function processMonitorBusinessEventsInNeon(events: readonly PendingMonitorEvent[]) {
  if (events.length === 0) return;

  await db.transaction(async (tx) => {
    const serverIds = [...new Set(events.map((event) => event.serverId))];
    const owners = await tx
      .select({ serverId: serverMembers.serverId, userId: serverMembers.userId, email: user.email })
      .from(serverMembers)
      .innerJoin(user, eq(serverMembers.userId, user.id))
      .where(and(inArray(serverMembers.serverId, serverIds), eq(serverMembers.role, "owner")));
    const ownerByServer = new Map(owners.map((owner) => [owner.serverId, owner]));

    const availabilityEvents = events.filter((event) => event.type === "server.auto_hide");
    const hiddenIds = new Set<string>();
    for (const event of availabilityEvents) {
      const [changed] = await tx
        .update(servers)
        .set({ availabilityHiddenAt: eventDate(event) })
        .where(and(eq(servers.id, event.serverId), eq(servers.publicationStatus, "published"), isNull(servers.availabilityHiddenAt)))
        .returning({ id: servers.id });
      if (changed) hiddenIds.add(changed.id);
    }

    const restoredIds = new Set<string>();
    for (const event of events.filter((item) => item.type === "server.recovered")) {
      const [restored] = await tx
        .update(servers)
        .set({ availabilityHiddenAt: null })
        .where(and(eq(servers.id, event.serverId), eq(servers.publicationStatus, "published"), isNotNull(servers.availabilityHiddenAt)))
        .returning({ id: servers.id });
      if (restored) restoredIds.add(restored.id);
    }

    for (const serverId of new Set([...hiddenIds, ...restoredIds])) {
      await tx.insert(monitorSyncOutbox).values({
        dedupeKey: `server:${serverId}`,
        serverId,
        operation: "upsert",
        payload: {},
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
        processedAt: null,
      }).onConflictDoUpdate({
        target: monitorSyncOutbox.dedupeKey,
        set: {
          operation: "upsert",
          payload: {},
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          lastError: null,
          processedAt: null,
        },
      });
    }

    const notificationValues = [] as Array<{
      dedupeKey: string;
      recipientUserId: string;
      recipientEmail: string;
      template: string;
      payload: Record<string, unknown>;
    }>;

    for (const event of events) {
      const owner = ownerByServer.get(event.serverId);
      if (!owner?.email) continue;
      if (event.type === "server.down" || event.type === "server.recovered") {
        notificationValues.push({
          dedupeKey: `monitor-event:${event.id}`,
          recipientUserId: owner.userId,
          recipientEmail: owner.email,
          template: event.type === "server.down" ? "endpoint_down" : "endpoint_recovered",
          payload: { serverId: event.serverId, edition: eventEdition(event), transition: event.type === "server.down" ? "down" : "recovered" },
        });
      }
      if (event.type === "server.auto_hide" && hiddenIds.has(event.serverId)) {
        notificationValues.push({
          dedupeKey: `monitor-event:${event.id}`,
          recipientUserId: owner.userId,
          recipientEmail: owner.email,
          template: "availability_hidden",
          payload: { serverId: event.serverId, transition: "hidden" },
        });
      }
    }

    if (notificationValues.length) {
      await tx.insert(notificationJobs).values(notificationValues).onConflictDoNothing({ target: notificationJobs.dedupeKey });
    }
  });
}
