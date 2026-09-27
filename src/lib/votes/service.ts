import { createHmac, hkdfSync } from "node:crypto";

import { and, desc, eq, gt, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { serverEnv } from "@/env/server";
import { serverMonthlyVotes, servers, serverVotes, serverVotifierSettings } from "@/schema";
import { decryptVotifierSecret } from "@/lib/votes/votifier-secret";
import { sendVotifierVote, type VotifierResult } from "@/lib/votes/votifier";
import { previousVotingMonth, startOfVotingDay, VOTE_COOLDOWN_MS, VOTE_IP_RETENTION_DAYS, votingMonth } from "./month";
import { monthlyVotesSql, rankedServerConditions, rankingOrderSql } from "./ranking";

/** What the server's Votifier plugin sees as the voting site. */
export const VOTIFIER_SERVICE_NAME = "OpinaCraft";

/**
 * The voter's address is not passed on: the plugins accept any string, and sharing it would hand
 * every server owner the visitor's IP. The placeholder is what NuVotifier's own test votes use.
 */
const FORWARDED_ADDRESS = "127.0.0.1";

export type VoteDelivery = "delivered" | "failed" | "not_configured";

export type CastVoteResult =
  | { status: "ok"; votes: number; position: number | null; nextVoteAt: Date; delivery: VoteDelivery; linkedToAccount: boolean }
  | { status: "cooldown"; votedAt: Date; nextVoteAt: Date; nickname: string }
  | { status: "not-eligible" };

let ipKey: Buffer | null = null;

/** A keyed hash, so the stored value cannot be reversed by hashing every IPv4 address. */
export function hashVoterIp(ip: string) {
  ipKey ??= Buffer.from(hkdfSync("sha256", serverEnv.BETTER_AUTH_SECRET, "opinacraft", "vote-ip", 32));
  return createHmac("sha256", ipKey).update(ip.trim().toLowerCase(), "utf8").digest("hex");
}

export async function isVoteEligible(serverId: string) {
  const [row] = await db.select({ id: servers.id }).from(servers).where(and(eq(servers.id, serverId), rankedServerConditions())).limit(1);
  return Boolean(row);
}

/**
 * The most recent vote that still blocks this voter on this server. Any of the three keys is
 * enough: a new nickname from the same connection, or the same account from another network, is
 * still the same person inside the window.
 */
async function blockingVote(executor: Pick<typeof db, "select">, serverId: string, keys: { nicknameKey?: string; ipHash?: string; userId?: string | null }, now: Date) {
  const matches = [
    keys.nicknameKey ? eq(serverVotes.nicknameKey, keys.nicknameKey) : undefined,
    keys.ipHash ? eq(serverVotes.ipHash, keys.ipHash) : undefined,
    keys.userId ? eq(serverVotes.userId, keys.userId) : undefined,
  ].filter((condition) => condition !== undefined);
  if (matches.length === 0) return null;
  const [row] = await executor
    .select({ createdAt: serverVotes.createdAt, nickname: serverVotes.nickname })
    .from(serverVotes)
    .where(and(eq(serverVotes.serverId, serverId), gt(serverVotes.createdAt, new Date(now.getTime() - VOTE_COOLDOWN_MS)), or(...matches)))
    .orderBy(desc(serverVotes.createdAt))
    .limit(1);
  return row ? { votedAt: row.createdAt, nextVoteAt: new Date(row.createdAt.getTime() + VOTE_COOLDOWN_MS), nickname: row.nickname } : null;
}

/** For the vote page on load: whether this visitor already voted inside the window. */
export async function getVoterCooldown(serverId: string, visitor: { ip: string; userId?: string | null; now?: Date }) {
  return blockingVote(db, serverId, { ipHash: hashVoterIp(visitor.ip), userId: visitor.userId }, visitor.now ?? new Date());
}

export async function castVote(input: { serverId: string; nickname: string; nicknameKey: string; ip: string; userId?: string | null; now?: Date }): Promise<CastVoteResult> {
  const now = input.now ?? new Date();
  const month = votingMonth(now);
  const ipHash = hashVoterIp(input.ip);

  const outcome = await db.transaction(async (tx) => {
    // One voter at a time per server: two taps on "Votar" must not both pass the cooldown check.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`vote:${input.serverId}`}))`);
    const [eligible] = await tx.select({ id: servers.id }).from(servers).where(and(eq(servers.id, input.serverId), rankedServerConditions())).limit(1);
    if (!eligible) return { status: "not-eligible" } as const;

    const blocking = await blockingVote(tx, input.serverId, { nicknameKey: input.nicknameKey, ipHash, userId: input.userId }, now);
    if (blocking) return { status: "cooldown", ...blocking } as const;

    const [vote] = await tx.insert(serverVotes).values({
      serverId: input.serverId,
      nickname: input.nickname,
      nicknameKey: input.nicknameKey,
      userId: input.userId ?? null,
      ipHash,
      month,
      createdAt: now,
    }).returning({ id: serverVotes.id });
    const [total] = await tx.insert(serverMonthlyVotes)
      .values({ serverId: input.serverId, month, votes: 1, updatedAt: now })
      .onConflictDoUpdate({ target: [serverMonthlyVotes.serverId, serverMonthlyVotes.month], set: { votes: sql`${serverMonthlyVotes.votes} + 1`, updatedAt: now } })
      .returning({ votes: serverMonthlyVotes.votes });
    return { status: "inserted", voteId: vote.id, votes: total.votes } as const;
  });

  if (outcome.status !== "inserted") return outcome;

  const delivery = await deliverVote(outcome.voteId, input.serverId, input.nickname, now);
  const position = await getRankPosition(input.serverId, month).catch(() => null);
  return {
    status: "ok",
    votes: outcome.votes,
    position,
    nextVoteAt: new Date(now.getTime() + VOTE_COOLDOWN_MS),
    delivery,
    linkedToAccount: Boolean(input.userId),
  };
}

/** One attempt, a few seconds at most: the vote counts either way, and the result is recorded for the owner. */
async function deliverVote(voteId: string, serverId: string, nickname: string, now: Date): Promise<VoteDelivery> {
  const [settings] = await db.select().from(serverVotifierSettings).where(eq(serverVotifierSettings.serverId, serverId)).limit(1);
  if (!settings) return "not_configured";

  let result: VotifierResult;
  try {
    result = await sendVotifierVote(
      { host: settings.host, port: settings.port, keyType: settings.keyType, secret: decryptVotifierSecret(settings.secretCiphertext) },
      { serviceName: VOTIFIER_SERVICE_NAME, username: nickname, address: FORWARDED_ADDRESS, timestamp: now.getTime() },
      { timeoutMs: 3000 },
    );
  } catch (error) {
    console.error("[votes] votifier delivery crashed", error instanceof Error ? error.name : "unknown");
    result = { ok: false, code: "protocol", latencyMs: 0 };
  }
  const delivery: VoteDelivery = result.ok ? "delivered" : "failed";
  await db.update(serverVotes).set({ deliveryStatus: delivery, deliveryError: result.ok ? null : result.code }).where(eq(serverVotes.id, voteId));
  return delivery;
}

/** The server's place in the month's ranking, or null when it is not a ranked server. */
export async function getRankPosition(serverId: string, month = votingMonth()) {
  const ranked = db
    .select({ id: servers.id, position: sql<number>`row_number() over (order by ${sql.join(rankingOrderSql(month), sql`, `)})::int`.as("position") })
    .from(servers)
    .where(rankedServerConditions())
    .as("ranked");
  const [row] = await db.select({ position: ranked.position }).from(ranked).where(eq(ranked.id, serverId)).limit(1);
  return row?.position ?? null;
}

export type ServerVoteStats = {
  month: string;
  votes: number;
  position: number | null;
  previousVotes: number;
  previousPosition: number | null;
  votesToday: number;
  /** Votes to the next place up, or the lead over the second when first. */
  gap: { kind: "lead" | "behind"; votes: number } | null;
};

/** Everything the ficha's rank card and the owner's summary show, in a handful of indexed reads. */
export async function getServerVoteStats(serverId: string, now = new Date()): Promise<ServerVoteStats> {
  const month = votingMonth(now);
  const previousMonth = previousVotingMonth(month);
  const [neighbours, previous, today] = await Promise.all([
    rankNeighbourhood(serverId, month),
    rankNeighbourhood(serverId, previousMonth),
    db.select({ count: sql<number>`count(*)::int` }).from(serverVotes).where(and(eq(serverVotes.serverId, serverId), gte(serverVotes.createdAt, startOfVotingDay(now)))),
  ]);
  const self = neighbours.find((row) => row.id === serverId);
  const above = self ? neighbours.find((row) => row.position === self.position - 1) : undefined;
  const below = self ? neighbours.find((row) => row.position === self.position + 1) : undefined;
  const previousSelf = previous.find((row) => row.id === serverId);
  return {
    month,
    votes: self?.votes ?? 0,
    position: self?.position ?? null,
    previousVotes: previousSelf?.votes ?? 0,
    previousPosition: previousSelf && previousSelf.votes > 0 ? previousSelf.position : null,
    votesToday: today[0]?.count ?? 0,
    gap: !self ? null : above ? { kind: "behind", votes: above.votes - self.votes } : below ? { kind: "lead", votes: self.votes - below.votes } : null,
  };
}

async function rankNeighbourhood(serverId: string, month: string) {
  const ranked = db
    .select({
      id: servers.id,
      votes: monthlyVotesSql(month).as("votes"),
      position: sql<number>`row_number() over (order by ${sql.join(rankingOrderSql(month), sql`, `)})::int`.as("position"),
    })
    .from(servers)
    .where(rankedServerConditions())
    .as("ranked");
  const self = db.select({ position: ranked.position }).from(ranked).where(eq(ranked.id, serverId));
  return db
    .select({ id: ranked.id, votes: ranked.votes, position: ranked.position })
    .from(ranked)
    .where(sql`${ranked.position} between (${self}) - 1 and (${self}) + 1`);
}

/** Monthly totals for a page of servers, for the catalog rows. */
export async function getMonthlyVotes(serverIds: readonly string[], month = votingMonth()) {
  if (serverIds.length === 0) return new Map<string, number>();
  const rows = await db
    .select({ serverId: serverMonthlyVotes.serverId, votes: serverMonthlyVotes.votes })
    .from(serverMonthlyVotes)
    .where(and(inArray(serverMonthlyVotes.serverId, [...serverIds]), eq(serverMonthlyVotes.month, month)));
  return new Map(rows.map((row) => [row.serverId, row.votes]));
}

/** Which of these accounts ever voted for the server with their session on: the "Jugador verificado" set. */
export async function getVerifiedVoters(serverId: string, userIds: readonly string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set<string>();
  const rows = await db
    .selectDistinct({ userId: serverVotes.userId })
    .from(serverVotes)
    .where(and(eq(serverVotes.serverId, serverId), inArray(serverVotes.userId, ids)));
  return new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)));
}

/** The account's latest vote for the server, for the review form's notice. */
export async function getLatestAccountVote(serverId: string, userId: string) {
  const [row] = await db
    .select({ nickname: serverVotes.nickname, createdAt: serverVotes.createdAt })
    .from(serverVotes)
    .where(and(eq(serverVotes.serverId, serverId), eq(serverVotes.userId, userId)))
    .orderBy(desc(serverVotes.createdAt))
    .limit(1);
  return row ?? null;
}

/** Clears IP hashes past their retention. Runs from the daily cron. */
export async function purgeExpiredVoteIpHashes(now = new Date()) {
  const cutoff = new Date(now.getTime() - VOTE_IP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cleared = await db
    .update(serverVotes)
    .set({ ipHash: null })
    .where(and(isNotNull(serverVotes.ipHash), lt(serverVotes.createdAt, cutoff)))
    .returning({ id: serverVotes.id });
  return cleared.length;
}
