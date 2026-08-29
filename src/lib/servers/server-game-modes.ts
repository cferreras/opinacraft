import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { serverGameModes } from "@/schema";
import { normalizeGameModeInputs } from "@/lib/servers/game-modes";
import { requireServerCapability } from "@/lib/servers/permissions";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Modes come from a closed list, so writing them is a plain replace: there is no vocabulary to
 * create, no usage counter to keep and no alias to follow. {@link normalizeGameModeInputs} has
 * already dropped anything unknown and capped the count, and `position` preserves the order the
 * catalog renders.
 */
export async function replaceServerGameModesForServer(
  tx: DatabaseTransaction,
  serverId: string,
  input: readonly string[] | undefined,
) {
  const modes = normalizeGameModeInputs(input);
  await tx.delete(serverGameModes).where(eq(serverGameModes.serverId, serverId));
  if (modes.length > 0) {
    await tx.insert(serverGameModes).values(modes.map((mode, position) => ({ serverId, mode, position })));
  }
  return modes;
}

export async function replaceServerGameModes(serverId: string, userId: string, input: readonly string[] | undefined) {
  await requireServerCapability(serverId, userId, "content:edit");
  return db.transaction((tx) => replaceServerGameModesForServer(tx, serverId, input));
}

export async function listServerGameModes(serverIds: readonly string[]) {
  if (serverIds.length === 0) return [];
  return db
    .select({ serverId: serverGameModes.serverId, mode: serverGameModes.mode })
    .from(serverGameModes)
    .where(inArray(serverGameModes.serverId, [...serverIds]))
    .orderBy(asc(serverGameModes.serverId), asc(serverGameModes.position));
}
