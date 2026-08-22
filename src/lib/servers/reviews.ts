import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { user } from "@/auth-schema";
import { db } from "@/db";
import { consumeRateLimit, isUniqueViolation } from "@/lib/rate-limit";
import { type ServerRole } from "@/lib/servers/permissions";
export { canPublishOfficialReply } from "@/lib/servers/review-permissions";
import {
  moderationEvents,
  notificationJobs,
  reviewReplies,
  serverMembers,
  serverReviewReports,
  serverReviews,
  servers,
} from "@/schema";
import {
  reviewInputSchema,
  reviewContentSchema,
  reviewReportInputSchema,
  normalizeReviewContent,
  type ReviewInput,
} from "@/lib/servers/review-validation";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DatabaseReader = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export const REVIEW_PAGE_SIZE = 10;

export class ReviewNotFoundError extends Error {
  constructor() {
    super("La opinión ya no está disponible.");
    this.name = "ReviewNotFoundError";
  }
}

export class ReviewNotEligibleError extends Error {
  constructor(message = "Este servidor no admite opiniones ahora mismo.") {
    super(message);
    this.name = "ReviewNotEligibleError";
  }
}

export class ReviewPermissionError extends Error {
  constructor() {
    super("No tienes permiso para realizar esta acción sobre la opinión.");
    this.name = "ReviewPermissionError";
  }
}

export class ReviewAlreadyExistsError extends Error {
  constructor() {
    super("Ya has publicado una opinión sobre este servidor.");
    this.name = "ReviewAlreadyExistsError";
  }
}

export class ReviewStateError extends Error {
  constructor(message = "Esta opinión no se puede editar en su estado actual.") {
    super(message);
    this.name = "ReviewStateError";
  }
}

export class OfficialReplyAlreadyExistsError extends Error {
  constructor() {
    super("Esta opinión ya tiene una respuesta oficial.");
    this.name = "OfficialReplyAlreadyExistsError";
  }
}

export class OfficialReplyNotFoundError extends Error {
  constructor() {
    super("La respuesta oficial ya no está disponible.");
    this.name = "OfficialReplyNotFoundError";
  }
}

export class OfficialReplyPermissionError extends Error {
  constructor() {
    super("Solo el propietario o un administrador del servidor puede gestionar respuestas oficiales.");
    this.name = "OfficialReplyPermissionError";
  }
}

export class ReviewReportAlreadyOpenError extends Error {
  constructor() {
    super("Ya tienes un reporte abierto para esta opinión.");
    this.name = "ReviewReportAlreadyOpenError";
  }
}

export class ReviewReportSelfError extends Error {
  constructor() {
    super("No puedes reportar tu propia opinión.");
    this.name = "ReviewReportSelfError";
  }
}

function parseReviewInput(input: ReviewInput) {
  return reviewInputSchema.parse({
    rating: input.rating,
    content: normalizeReviewContent(input.content),
  });
}

async function requireVerifiedEmail(userId: string, reader: DatabaseReader = db) {
  const [account] = await reader
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!account?.emailVerified) {
    throw new ReviewPermissionError();
  }
}

async function requireReviewableServer(
  tx: DatabaseTransaction,
  serverId: string,
  userId: string,
) {
  await requireVerifiedEmail(userId, tx);
  const [server] = await tx
    .select({
      id: servers.id,
      publicationStatus: servers.publicationStatus,
      verificationStatus: servers.verificationStatus,
      moderationStatus: servers.moderationStatus,
      availabilityHiddenAt: servers.availabilityHiddenAt,
    })
    .from(servers)
    .where(eq(servers.id, serverId))
    .for("update")
    .limit(1);

  if (!server) throw new ReviewNotFoundError();
  if (server.publicationStatus !== "published" || server.verificationStatus !== "verified") {
    throw new ReviewNotEligibleError("El servidor debe estar publicado y verificado para opinar.");
  }
  if (server.moderationStatus !== "active" || server.availabilityHiddenAt) {
    throw new ReviewNotEligibleError();
  }

  const [membership] = await tx
    .select({ role: serverMembers.role })
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);

  if (membership) {
    throw new ReviewPermissionError();
  }
}

async function getReviewForUpdate(tx: DatabaseTransaction, reviewId: string) {
  const [review] = await tx
    .select({
      id: serverReviews.id,
      serverId: serverReviews.serverId,
      userId: serverReviews.userId,
      status: serverReviews.status,
    })
    .from(serverReviews)
    .where(eq(serverReviews.id, reviewId))
    .for("update")
    .limit(1);

  if (!review) throw new ReviewNotFoundError();
  return review;
}

async function getReviewTarget(tx: DatabaseTransaction, reviewId: string) {
  const [review] = await tx
    .select({
      serverId: serverReviews.serverId,
      userId: serverReviews.userId,
      status: serverReviews.status,
    })
    .from(serverReviews)
    .where(eq(serverReviews.id, reviewId))
    .limit(1);

  if (!review) throw new ReviewNotFoundError();
  return review;
}

export async function createReview(userId: string, serverId: string, input: ReviewInput) {
  const parsed = parseReviewInput(input);

  try {
    return await db.transaction(async (tx) => {
      await consumeRateLimit(`review:create:${userId}`, 5, 60 * 60 * 1000);
      await requireReviewableServer(tx, serverId, userId);

      try {
        const [review] = await tx
          .insert(serverReviews)
          .values({ serverId, userId, rating: parsed.rating, content: parsed.content })
          .returning({ id: serverReviews.id });
        return review;
      } catch (error) {
        if (isUniqueViolation(error, "server_reviews_one_per_user")) {
          throw new ReviewAlreadyExistsError();
        }
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof ReviewAlreadyExistsError) throw error;
    throw error;
  }
}

export async function updateReview(userId: string, reviewId: string, input: ReviewInput) {
  const parsed = parseReviewInput(input);

  return db.transaction(async (tx) => {
    await consumeRateLimit(`review:edit:${userId}`, 10, 60 * 60 * 1000);
    const target = await getReviewTarget(tx, reviewId);
    if (target.userId !== userId) throw new ReviewPermissionError();
    if (target.status !== "published") throw new ReviewStateError();
    await requireReviewableServer(tx, target.serverId, userId);
    const review = await getReviewForUpdate(tx, reviewId);
    if (review.userId !== userId) throw new ReviewPermissionError();
    if (review.status !== "published") throw new ReviewStateError();

    const [updated] = await tx
      .update(serverReviews)
      .set({ rating: parsed.rating, content: parsed.content, updatedAt: new Date() })
      .where(eq(serverReviews.id, reviewId))
      .returning({ serverId: serverReviews.serverId });
    return updated;
  });
}

export async function deleteReview(userId: string, reviewId: string) {
  return db.transaction(async (tx) => {
    await consumeRateLimit(`review:edit:${userId}`, 10, 60 * 60 * 1000);
    const review = await getReviewForUpdate(tx, reviewId);
    if (review.userId !== userId) throw new ReviewPermissionError();
    if (review.status === "deleted") throw new ReviewStateError("Esta opinión ya está eliminada.");

    await tx
      .update(serverReviews)
      .set({ status: "deleted", content: "Opinión eliminada por el autor", updatedAt: new Date() })
      .where(eq(serverReviews.id, reviewId));
    await tx.delete(reviewReplies).where(eq(reviewReplies.reviewId, reviewId));
    return { serverId: review.serverId };
  });
}

export async function createOfficialReply(userId: string, reviewId: string, content: string) {
  const parsedContent = normalizeReviewContent(content);
  const parsed = reviewContentSchema.parse(parsedContent);

  return db.transaction(async (tx) => {
    await consumeRateLimit(`review:reply:${userId}`, 10, 60 * 60 * 1000);
    await requireVerifiedEmail(userId, tx);
    const [review] = await tx
      .select({
        id: serverReviews.id,
        serverId: serverReviews.serverId,
        status: serverReviews.status,
        authorId: serverReviews.userId,
      })
      .from(serverReviews)
      .innerJoin(servers, eq(serverReviews.serverId, servers.id))
      .where(
        and(
          eq(serverReviews.id, reviewId),
          eq(servers.publicationStatus, "published"),
          eq(servers.verificationStatus, "verified"),
          eq(servers.moderationStatus, "active"),
          isNull(servers.availabilityHiddenAt),
        ),
      )
      .for("update")
      .limit(1);

    if (!review) throw new ReviewNotFoundError();
    if (review.status !== "published") throw new ReviewStateError("Solo se puede responder a opiniones públicas.");
    const [author] = review.authorId
      ? await tx.select({ email: user.email }).from(user).where(eq(user.id, review.authorId)).limit(1)
      : [];

    const role = await getServerRoleForReply(tx, review.serverId, userId);
    if (role !== "owner" && role !== "admin") throw new OfficialReplyPermissionError();

    try {
      const [reply] = await tx
        .insert(reviewReplies)
        .values({ reviewId, userId, content: parsed })
        .returning({ id: reviewReplies.id, createdAt: reviewReplies.createdAt });

      if (author?.email && review.authorId !== userId && reply) {
        await tx
          .insert(notificationJobs)
          .values({
            dedupeKey: `review-reply:${reviewId}:${reply.id}`,
            recipientUserId: review.authorId,
            recipientEmail: author.email,
            template: "review_reply",
            payload: { reviewId, serverId: review.serverId },
          })
          .onConflictDoNothing({ target: notificationJobs.dedupeKey });
      }
      return reply ? { ...reply, serverId: review.serverId } : null;
    } catch (error) {
      if (isUniqueViolation(error, "review_replies_one_per_review")) {
        throw new OfficialReplyAlreadyExistsError();
      }
      throw error;
    }
  });
}

async function getServerRoleForReply(tx: DatabaseTransaction, serverId: string, userId: string): Promise<ServerRole | null> {
  const [membership] = await tx
    .select({ role: serverMembers.role })
    .from(serverMembers)
    .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
    .limit(1);
  return membership?.role ?? null;
}

export async function updateOfficialReply(userId: string, replyId: string, content: string) {
  const parsed = normalizeReviewContent(content);
  const validated = reviewContentSchema.parse(parsed);

  return db.transaction(async (tx) => {
    await consumeRateLimit(`review:reply:${userId}`, 10, 60 * 60 * 1000);
    const [reply] = await tx
      .select({ id: reviewReplies.id, serverId: serverReviews.serverId })
      .from(reviewReplies)
      .innerJoin(serverReviews, eq(reviewReplies.reviewId, serverReviews.id))
      .where(eq(reviewReplies.id, replyId))
      .for("update")
      .limit(1);
    if (!reply) throw new OfficialReplyNotFoundError();
    const role = await getServerRoleForReply(tx, reply.serverId, userId);
    if (role !== "owner" && role !== "admin") throw new OfficialReplyPermissionError();

    await tx
      .update(reviewReplies)
      .set({ content: validated, updatedAt: new Date() })
      .where(eq(reviewReplies.id, replyId));
    return { serverId: reply.serverId };
  });
}

export async function deleteOfficialReply(userId: string, replyId: string) {
  return db.transaction(async (tx) => {
    await consumeRateLimit(`review:reply:${userId}`, 10, 60 * 60 * 1000);
    const [reply] = await tx
      .select({ id: reviewReplies.id, serverId: serverReviews.serverId })
      .from(reviewReplies)
      .innerJoin(serverReviews, eq(reviewReplies.reviewId, serverReviews.id))
      .where(eq(reviewReplies.id, replyId))
      .for("update")
      .limit(1);
    if (!reply) throw new OfficialReplyNotFoundError();
    const role = await getServerRoleForReply(tx, reply.serverId, userId);
    if (role !== "owner" && role !== "admin") throw new OfficialReplyPermissionError();
    await tx.delete(reviewReplies).where(eq(reviewReplies.id, replyId));
    return { serverId: reply.serverId };
  });
}

export async function createReviewReport(
  userId: string,
  serverId: string,
  reviewId: string,
  input: { reason: string; details?: string },
) {
  const parsed = reviewReportInputSchema.parse(input);
  await requireVerifiedEmail(userId);

  try {
    return await db.transaction(async (tx) => {
      await consumeRateLimit(`review:report:${userId}`, 10, 60 * 60 * 1000);
      const [review] = await tx
        .select({
          id: serverReviews.id,
          serverId: serverReviews.serverId,
          authorId: serverReviews.userId,
          status: serverReviews.status,
          publicationStatus: servers.publicationStatus,
          verificationStatus: servers.verificationStatus,
          moderationStatus: servers.moderationStatus,
          availabilityHiddenAt: servers.availabilityHiddenAt,
        })
        .from(serverReviews)
        .innerJoin(servers, eq(serverReviews.serverId, servers.id))
        .where(and(eq(serverReviews.id, reviewId), eq(serverReviews.serverId, serverId)))
        .for("update")
        .limit(1);

      if (!review || review.status !== "published") throw new ReviewNotFoundError();
      if (
        review.publicationStatus !== "published" ||
        review.verificationStatus !== "verified" ||
        review.moderationStatus !== "active" ||
        review.availabilityHiddenAt
      ) throw new ReviewNotEligibleError();
      if (review.authorId === userId) throw new ReviewReportSelfError();

      try {
        const [report] = await tx
          .insert(serverReviewReports)
          .values({
            serverId,
            reviewId,
            reporterUserId: userId,
            reason: parsed.reason,
            details: parsed.details?.trim() || null,
          })
          .returning({ id: serverReviewReports.id });
        if (!report) throw new ReviewNotFoundError();
        await addReviewModerationEvent(tx, {
          serverId,
          reviewId,
          reviewReportId: report.id,
          actorUserId: userId,
          action: "report_created",
          details: parsed.reason,
        });
        return report;
      } catch (error) {
        if (isUniqueViolation(error, "server_review_reports_one_open_per_user_review")) {
          throw new ReviewReportAlreadyOpenError();
        }
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof ReviewReportAlreadyOpenError) throw error;
    throw error;
  }
}

export type ReviewSummary = {
  average: number | null;
  total: number;
  distribution: [number, number, number, number, number];
  latestAt: Date | null;
};

export async function getReviewSummary(serverId: string): Promise<ReviewSummary> {
  const [summary, distribution] = await Promise.all([
    db
      .select({
        average: sql<string | null>`round(avg(${serverReviews.rating})::numeric, 2)`,
        total: sql<number>`count(*)::int`,
        latestAt: sql<Date | null>`max(${serverReviews.createdAt})`,
      })
      .from(serverReviews)
      .where(and(eq(serverReviews.serverId, serverId), eq(serverReviews.status, "published"))),
    db
      .select({ rating: serverReviews.rating, count: sql<number>`count(*)::int` })
      .from(serverReviews)
      .where(and(eq(serverReviews.serverId, serverId), eq(serverReviews.status, "published")))
      .groupBy(serverReviews.rating)
      .orderBy(asc(serverReviews.rating)),
  ]);

  const [row] = summary;
  const buckets: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const item of distribution) {
    if (item.rating >= 1 && item.rating <= 5) buckets[item.rating - 1] = item.count;
  }
  return {
    average: row?.average === null || row?.average === undefined ? null : Number(row.average),
    total: row?.total ?? 0,
    distribution: buckets,
    latestAt: row?.latestAt ?? null,
  };
}

export type ReviewReplyView = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  authorName: string;
  isAnonymous: boolean;
};

export type ReviewView = {
  id: string;
  rating: number;
  content: string;
  status: "published" | "hidden" | "deleted";
  createdAt: Date;
  updatedAt: Date;
  authorName: string;
  isAnonymous: boolean;
  isMine: boolean;
  reply: ReviewReplyView | null;
};

export async function listServerReviews(serverId: string, page = 1, currentUserId?: string) {
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
  const rows = await db
    .select({
      id: serverReviews.id,
      rating: serverReviews.rating,
      content: serverReviews.content,
      status: serverReviews.status,
      createdAt: serverReviews.createdAt,
      updatedAt: serverReviews.updatedAt,
      authorId: serverReviews.userId,
      authorName: user.name,
    })
    .from(serverReviews)
    .leftJoin(user, eq(serverReviews.userId, user.id))
    .where(and(eq(serverReviews.serverId, serverId), eq(serverReviews.status, "published")))
    .orderBy(desc(serverReviews.createdAt), desc(serverReviews.id))
    .limit(REVIEW_PAGE_SIZE + 1)
    .offset((safePage - 1) * REVIEW_PAGE_SIZE);

  const hasNextPage = rows.length > REVIEW_PAGE_SIZE;
  const visibleRows = rows.slice(0, REVIEW_PAGE_SIZE);
  const reviewIds = visibleRows.map((row) => row.id);
  const replyRows = reviewIds.length
    ? await db
        .select({
          id: reviewReplies.id,
          reviewId: reviewReplies.reviewId,
          content: reviewReplies.content,
          createdAt: reviewReplies.createdAt,
          updatedAt: reviewReplies.updatedAt,
          authorId: reviewReplies.userId,
          authorName: user.name,
        })
        .from(reviewReplies)
        .leftJoin(user, eq(reviewReplies.userId, user.id))
        .where(inArray(reviewReplies.reviewId, reviewIds))
    : [];
  const repliesByReview = new Map(replyRows.map((reply) => [reply.reviewId, reply]));

  return {
    reviews: visibleRows.map((row): ReviewView => {
      const reply = repliesByReview.get(row.id);
      return {
        id: row.id,
        rating: row.rating,
        content: row.content,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        authorName: row.authorName ?? "Usuario anónimo",
        isAnonymous: !row.authorId,
        isMine: Boolean(currentUserId && row.authorId === currentUserId),
        reply: reply
          ? {
              id: reply.id,
              content: reply.content,
              createdAt: reply.createdAt,
              updatedAt: reply.updatedAt,
              authorName: reply.authorName ?? "Miembro anónimo del equipo",
              isAnonymous: !reply.authorId,
            }
          : null,
      };
    }),
    hasNextPage,
    page: safePage,
  };
}

export async function getReviewViewerState(serverId: string, userId: string) {
  const [account, membership, review] = await Promise.all([
    db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    db
      .select({ role: serverMembers.role })
      .from(serverMembers)
      .where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)))
      .limit(1),
    db
      .select({
        id: serverReviews.id,
        rating: serverReviews.rating,
        content: serverReviews.content,
        status: serverReviews.status,
        createdAt: serverReviews.createdAt,
        updatedAt: serverReviews.updatedAt,
      })
      .from(serverReviews)
      .where(and(eq(serverReviews.serverId, serverId), eq(serverReviews.userId, userId)))
      .orderBy(
        asc(sql`case when ${serverReviews.status} = 'deleted' then 1 else 0 end`),
        desc(serverReviews.createdAt),
        desc(serverReviews.id),
      )
      .limit(1),
  ]);

  return {
    emailVerified: account[0]?.emailVerified ?? false,
    membershipRole: membership[0]?.role ?? null,
    review: review[0] ?? null,
  };
}

export function reviewStatusLabel(status: ReviewView["status"]) {
  if (status === "hidden") return "Oculta por moderación";
  if (status === "deleted") return "Eliminada por el autor";
  return "Publicada";
}

export function reviewActionError(error: unknown) {
  if (error instanceof ReviewPermissionError) return error.message;
  if (error instanceof ReviewNotEligibleError) return error.message;
  if (error instanceof ReviewAlreadyExistsError) return error.message;
  if (error instanceof ReviewStateError) return error.message;
  if (error instanceof ReviewNotFoundError) return error.message;
  if (error instanceof OfficialReplyAlreadyExistsError) return error.message;
  if (error instanceof OfficialReplyNotFoundError) return error.message;
  if (error instanceof OfficialReplyPermissionError) return error.message;
  if (error instanceof ReviewReportAlreadyOpenError) return error.message;
  if (error instanceof ReviewReportSelfError) return error.message;
  return null;
}

export async function getReviewModerationContext(reviewId: string, reader: DatabaseReader = db) {
  const [review] = await reader
    .select({ serverId: serverReviews.serverId, status: serverReviews.status })
    .from(serverReviews)
    .where(eq(serverReviews.id, reviewId))
    .limit(1);
  return review ?? null;
}

export async function addReviewModerationEvent(
  tx: DatabaseTransaction,
  values: { serverId: string; reviewId?: string | null; reviewReportId?: string | null; actorUserId?: string | null; action: "report_created" | "dismissed" | "hidden" | "restored" | "reopened"; details?: string | null },
) {
  await tx.insert(moderationEvents).values({
    serverId: values.serverId,
    reviewId: values.reviewId ?? null,
    reviewReportId: values.reviewReportId ?? null,
    actorUserId: values.actorUserId ?? null,
    action: values.action,
    details: values.details ?? null,
  });
}

export const REVIEW_REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Acoso" },
  { value: "offensive", label: "Contenido ofensivo" },
  { value: "false_information", label: "Información falsa" },
  { value: "conflict_of_interest", label: "Conflicto de intereses" },
  { value: "other", label: "Otro" },
] as const;
