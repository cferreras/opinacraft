"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { getServerSession } from "@/lib/session";
import { RateLimitExceededError } from "@/lib/rate-limit";
import {
  createOfficialReply,
  createReview,
  deleteOfficialReply,
  deleteReview,
  OfficialReplyAlreadyExistsError,
  OfficialReplyNotFoundError,
  OfficialReplyPermissionError,
  ReviewAlreadyExistsError,
  ReviewNotEligibleError,
  ReviewNotFoundError,
  ReviewPermissionError,
  ReviewStateError,
  reviewActionError,
  updateOfficialReply,
  updateReview,
} from "@/lib/servers/reviews";
import { reviewContentSchema, reviewInputSchema } from "@/lib/servers/review-validation";

export type ReviewActionState = {
  formError?: string;
  fieldErrors?: Partial<Record<"rating" | "content", string>>;
};

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function reviewFields(formData: FormData) {
  return reviewInputSchema.safeParse({
    rating: formValue(formData, "rating"),
    content: formValue(formData, "content"),
  });
}

function fieldErrors(error: z.ZodError) {
  const result: ReviewActionState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "rating" || field === "content") result[field] ??= issue.message;
  }
  return result;
}

function serverError(error: unknown) {
  if (error instanceof RateLimitExceededError) return error.message;
  const known = reviewActionError(error);
  if (known) return known;
  if (error instanceof ReviewAlreadyExistsError) return error.message;
  if (error instanceof ReviewNotEligibleError) return error.message;
  if (error instanceof ReviewNotFoundError) return error.message;
  if (error instanceof ReviewPermissionError) return error.message;
  if (error instanceof ReviewStateError) return error.message;
  if (error instanceof OfficialReplyAlreadyExistsError) return error.message;
  if (error instanceof OfficialReplyNotFoundError) return error.message;
  if (error instanceof OfficialReplyPermissionError) return error.message;
  return null;
}

function replyStateError(error: unknown) {
  if (error instanceof RateLimitExceededError) return error.message;
  const known = serverError(error);
  return known ?? "No se pudo guardar la respuesta oficial.";
}

export async function createReviewAction(
  _previousState: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState | null> {
  const session = await getServerSession();
  const slug = formValue(formData, "slug");
  if (!session) redirect(`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}`)}`);

  const parsed = reviewFields(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await createReview(session.user.id, formValue(formData, "serverId"), parsed.data);
  } catch (error) {
    const message = serverError(error);
    if (message) return { formError: message };
    console.error("Failed to create review", error instanceof Error ? error.name : "unknown");
    return { formError: "No se pudo publicar la opinión. Inténtalo de nuevo." };
  }

  revalidatePath(`/servers/${slug}`);
  revalidatePath("/servers");
  redirect(`/servers/${slug}?review=created#reviews`);
}

export async function updateReviewAction(
  _previousState: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState | null> {
  const session = await getServerSession();
  const slug = formValue(formData, "slug");
  if (!session) redirect(`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}`)}`);

  const parsed = reviewFields(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await updateReview(session.user.id, formValue(formData, "reviewId"), parsed.data);
  } catch (error) {
    const message = serverError(error);
    if (message) return { formError: message };
    console.error("Failed to update review", error instanceof Error ? error.name : "unknown");
    return { formError: "No se pudo actualizar la opinión. Inténtalo de nuevo." };
  }

  revalidatePath(`/servers/${slug}`);
  revalidatePath("/servers");
  redirect(`/servers/${slug}?review=updated#reviews`);
}

export async function deleteReviewAction(formData: FormData) {
  const session = await getServerSession();
  const slug = formValue(formData, "slug");
  if (!session) redirect(`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}`)}`);

  try {
    await deleteReview(session.user.id, formValue(formData, "reviewId"));
  } catch (error) {
    const message = serverError(error);
    if (message) redirect(`/servers/${slug}?reviewError=${encodeURIComponent(message)}#reviews`);
    console.error("Failed to delete review", error instanceof Error ? error.name : "unknown");
    redirect(`/servers/${slug}?reviewError=delete#reviews`);
  }

  revalidatePath(`/servers/${slug}`);
  revalidatePath("/servers");
  redirect(`/servers/${slug}?review=deleted#reviews`);
}

export async function createOfficialReplyAction(
  _previousState: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState | null> {
  const session = await getServerSession();
  const slug = formValue(formData, "slug");
  if (!session) redirect(`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}`)}`);

  const content = reviewContentSchema.safeParse(formValue(formData, "content"));
  if (!content.success) return { fieldErrors: { content: content.error.issues[0]?.message ?? "Escribe una respuesta." } };

  try {
    await createOfficialReply(session.user.id, formValue(formData, "reviewId"), content.data);
  } catch (error) {
    return { formError: replyStateError(error) };
  }

  revalidatePath(`/servers/${slug}`);
  redirect(`/servers/${slug}?reply=created#reviews`);
}

export async function updateOfficialReplyAction(formData: FormData) {
  const session = await getServerSession();
  const slug = formValue(formData, "slug");
  if (!session) redirect(`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}`)}`);

  const content = reviewContentSchema.safeParse(formValue(formData, "content"));
  if (!content.success) redirect(`/servers/${slug}?replyError=${encodeURIComponent(content.error.issues[0]?.message ?? "Respuesta inválida")}#reviews`);

  try {
    await updateOfficialReply(session.user.id, formValue(formData, "replyId"), content.data);
  } catch (error) {
    redirect(`/servers/${slug}?replyError=${encodeURIComponent(replyStateError(error))}#reviews`);
  }

  revalidatePath(`/servers/${slug}`);
  redirect(`/servers/${slug}?reply=updated#reviews`);
}

export async function deleteOfficialReplyAction(formData: FormData) {
  const session = await getServerSession();
  const slug = formValue(formData, "slug");
  if (!session) redirect(`/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}`)}`);

  try {
    await deleteOfficialReply(session.user.id, formValue(formData, "replyId"));
  } catch (error) {
    redirect(`/servers/${slug}?replyError=${encodeURIComponent(replyStateError(error))}#reviews`);
  }

  revalidatePath(`/servers/${slug}`);
  redirect(`/servers/${slug}?reply=deleted#reviews`);
}
