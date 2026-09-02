"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { getServerSession } from "@/lib/session";
import {
  DuplicateMemberError,
  MemberNotFoundError,
  OwnerMembershipError,
  addServerMember,
  changeServerMemberRole,
  removeServerMember,
} from "@/lib/servers/members";
import {
  DuplicateEndpointError,
  NoVerifiedEndpointError,
  deleteServer,
  ServerNotFoundError,
  UnverifiedEmailError,
  updateServer,
} from "@/lib/servers/service";
import {
  checkServerVerification,
  EndpointAlreadyVerifiedError,
  NoJavaEndpointError,
  VerificationExpiredError,
  startServerVerification,
  NoBedrockEndpointError,
  VerificationAlreadyPendingError,
  VerificationRateLimitError,
  VerificationUnavailableError,
  type VerificationFailureCode,
} from "@/lib/servers/verification";
import { ServerPermissionError } from "@/lib/servers/permissions";
import { databaseConstraint, databaseErrorCode } from "@/lib/db-errors";
import {
  ServerInputError,
  type UpdateServerInput,
} from "@/lib/servers/validation";
import { parseEnabledPort } from "@/lib/servers/endpoint-fields";
import { serverValidationField } from "@/lib/servers/form-validation";
import { processMonitorSyncOutbox } from "@/lib/servers/monitor-sync";
import { invalidatePublicServerCache, invalidateReviewCache } from "@/lib/servers/cache-tags";

export type VerificationOutcome =
  | "started"
  | "verified"
  | "expired"
  | "stale"
  | "endpoint_changed"
  | "endpoint_taken"
  | VerificationFailureCode;
export type VerificationErrorReason = "already-verified" | "pending" | "no-endpoint" | "rate-limit" | "unavailable" | "unknown";
export type VerificationState = { outcome: VerificationOutcome } | { error: VerificationErrorReason } | null;

export type ManageState = {
  formError?: string;
  fieldErrors?: Partial<Record<"name" | "description" | "websiteUrl" | "storeUrl" | "discordUrl" | "accessType" | "accessFormUrl" | "accountMode" | "authMode" | "gameModes" | "country" | "endpoints" | "publicationStatus", string>>;
};

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function getServerInput(formData: FormData): UpdateServerInput {
  const javaEnabled = formData.get("javaEnabled") === "on";
  const bedrockEnabled = formData.get("bedrockEnabled") === "on";

  return {
    name: formValue(formData, "name") ?? "",
    description: formValue(formData, "description"),
    websiteUrl: formValue(formData, "websiteUrl"),
    storeUrl: formValue(formData, "storeUrl"),
    discordUrl: formValue(formData, "discordUrl"),
    accessType: formValue(formData, "accessType") as UpdateServerInput["accessType"],
    accessFormUrl: formValue(formData, "accessFormUrl"),
    accountMode: formValue(formData, "accountMode") as UpdateServerInput["accountMode"],
    authMode: formValue(formData, "authMode") as UpdateServerInput["authMode"],
    gameModes: formData.getAll("gameModes").filter((value) => typeof value === "string"),
    country: formValue(formData, "country"),
    host: formValue(formData, "host"),
    javaPort: parseEnabledPort(formValue(formData, "javaPort"), javaEnabled),
    bedrockPort: parseEnabledPort(formValue(formData, "bedrockPort"), bedrockEnabled),
  };
}

export async function updateServerAction(
  _previousState: ManageState | null,
  formData: FormData,
): Promise<ManageState | null> {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");

  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const publication = formValue(formData, "publicationStatus");
  const publicationStatus = z
    .enum(["draft", "published", "hidden"])
    .safeParse(publication);

  if (publication && !publicationStatus.success) {
    return { fieldErrors: { publicationStatus: "Choose a valid publication state." } };
  }

  try {
    await updateServer(
      session.user.id,
      serverId,
      getServerInput(formData),
      publicationStatus.success ? publicationStatus.data : undefined,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const field = serverValidationField(error.issues[0]?.path ?? []);
      return field
        ? { fieldErrors: { [field]: error.issues[0]?.message ?? "Invalid server details." } }
        : { formError: error.issues[0]?.message ?? "Invalid server details." };
    }
    if (error instanceof ServerInputError) {
      const field = error.field === "host" || error.field === "port" ? "endpoints" : error.field;
      return { fieldErrors: { [field]: error.message } };
    }
    if (error instanceof ServerPermissionError) {
      return { formError: error.message };
    }
    if (error instanceof ServerNotFoundError) {
      return { formError: "This server is no longer available." };
    }
    if (error instanceof UnverifiedEmailError) {
      return { formError: `${error.message} Revisa tu perfil para reenviar el enlace.` };
    }
    if (error instanceof NoVerifiedEndpointError) {
      return { formError: error.message };
    }
    if (error instanceof DuplicateEndpointError || (databaseErrorCode(error) === "23505" && databaseConstraint(error) === "server_endpoints_verified_edition_host_port_key")) {
      return { fieldErrors: { endpoints: "One of these addresses is already registered." } };
    }
    console.error("Failed to update server", error instanceof Error ? error.name : "unknown");
    return { formError: "Unable to update the server right now." };
  }

  await processMonitorSyncOutbox({ serverId, limit: 1 }).catch((error) => {
    console.error("Failed to dispatch monitor target sync", error instanceof Error ? error.name : "unknown");
  });
  invalidatePublicServerCache(serverId, slug);
  revalidatePath("/");
  revalidatePath("/dashboard/servers");
  revalidatePath(`/servers/${slug}`);
  revalidatePath(`/servers/${slug}/manage`);
  redirect(`/servers/${slug}/manage?updated=1`);
}

export async function deleteServerAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  try {
    await deleteServer(session.user.id, serverId, formValue(formData, "confirmation") ?? "");
  } catch (error) {
    redirect(`/servers/${formValue(formData, "slug") ?? ""}/manage?deleteError=${encodeURIComponent(error instanceof Error ? error.message : "Unable to delete server.")}`);
  }
  await processMonitorSyncOutbox({ serverId, limit: 1 }).catch((error) => {
    console.error("Failed to dispatch monitor target deletion", error instanceof Error ? error.name : "unknown");
  });
  invalidatePublicServerCache(serverId, formValue(formData, "slug") ?? undefined);
  revalidatePath("/");
  revalidatePath("/dashboard/servers");
  redirect("/dashboard/servers?deleted=1");
}

export async function addMemberAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");

  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const email = formValue(formData, "email") ?? "";
  const role = z.enum(["admin", "editor"]).safeParse(formValue(formData, "role"));

  if (!role.success || !email.trim()) {
    redirect(`/servers/${slug}/manage?memberError=invalid`);
  }

  try {
    await addServerMember(serverId, session.user.id, email, role.data);
  } catch (error) {
    const reason =
      error instanceof DuplicateMemberError ? "duplicate" :
      error instanceof MemberNotFoundError ? "not-found" :
      error instanceof ServerNotFoundError ? "server-not-found" :
      error instanceof ServerPermissionError ? "forbidden" : "unknown";
    if (reason === "unknown") console.error("Failed to add server member", error);
    redirect(`/servers/${slug}/manage?memberError=${reason}`);
  }

  // Joining the team withholds the new member's own review, so the public
  // review list and rating average change with it.
  invalidateReviewCache(serverId);
  revalidatePath(`/servers/${slug}`);
  revalidatePath(`/servers/${slug}/manage`);
  redirect(`/servers/${slug}/manage?memberUpdated=1`);
}

export async function changeMemberRoleAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const targetUserId = formValue(formData, "targetUserId") ?? "";
  const role = z.enum(["admin", "editor"]).safeParse(formValue(formData, "role"));
  if (!role.success) redirect(`/servers/${slug}/manage?memberError=invalid`);

  try {
    await changeServerMemberRole(serverId, session.user.id, targetUserId, role.data);
  } catch (error) {
    const reason = error instanceof OwnerMembershipError ? "owner" : error instanceof MemberNotFoundError ? "not-found" : error instanceof ServerNotFoundError ? "server-not-found" : error instanceof ServerPermissionError ? "forbidden" : "unknown";
    if (reason === "unknown") console.error("Failed to change server member role", error);
    redirect(`/servers/${slug}/manage?memberError=${reason}`);
  }
  revalidatePath(`/servers/${slug}/manage`);
  redirect(`/servers/${slug}/manage?memberUpdated=1`);
}

export async function removeMemberAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const targetUserId = formValue(formData, "targetUserId") ?? "";
  try {
    await removeServerMember(serverId, session.user.id, targetUserId);
  } catch (error) {
    const reason = error instanceof OwnerMembershipError ? "owner" : error instanceof MemberNotFoundError ? "not-found" : error instanceof ServerNotFoundError ? "server-not-found" : error instanceof ServerPermissionError ? "forbidden" : "unknown";
    if (reason === "unknown") console.error("Failed to remove server member", error);
    redirect(`/servers/${slug}/manage?memberError=${reason}`);
  }
  // Leaving the team restores any review that was withheld on joining.
  invalidateReviewCache(serverId);
  revalidatePath(`/servers/${slug}`);
  revalidatePath(`/servers/${slug}/manage`);
  redirect(`/servers/${slug}/manage?memberUpdated=1`);
}

// Both verification actions answer in place instead of redirecting: the panel sits at the bottom of
// a long page, and a redirect sent the owner back to the top, away from the code they were reading.
export async function startVerificationAction(_previousState: VerificationState, formData: FormData): Promise<VerificationState> {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const edition = formValue(formData, "edition") === "bedrock" ? "bedrock" : "java";
  try {
    await startServerVerification(serverId, session.user.id, edition);
  } catch (error) {
    const reason: VerificationErrorReason = error instanceof EndpointAlreadyVerifiedError ? "already-verified" :
      error instanceof VerificationAlreadyPendingError ? "pending" :
      error instanceof NoJavaEndpointError || error instanceof NoBedrockEndpointError ? "no-endpoint" :
      error instanceof VerificationRateLimitError ? "rate-limit" :
      error instanceof VerificationUnavailableError ? "unavailable" : "unknown";
    if (reason === "unknown") console.error("Failed to start server verification", error);
    return { error: reason };
  }
  revalidatePath(`/servers/${slug}/manage`);
  return { outcome: "started" };
}

export async function checkVerificationAction(_previousState: VerificationState, formData: FormData): Promise<VerificationState> {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const verificationId = formValue(formData, "verificationId") ?? "";
  let result: Awaited<ReturnType<typeof checkServerVerification>>;
  try {
    result = await checkServerVerification(verificationId, serverId, session.user.id);
  } catch (error) {
    if (error instanceof VerificationExpiredError) return { outcome: "expired" };
    if (error instanceof VerificationRateLimitError) return { error: "rate-limit" };
    if (error instanceof VerificationUnavailableError) return { error: "unavailable" };
    console.error("Failed to check server verification", error);
    return { error: "unknown" };
  }
  revalidatePath(`/servers/${slug}/manage`);
  if (result.result === "verified") {
    revalidatePath("/");
    revalidatePath(`/servers/${slug}`);
  }
  return { outcome: result.result };
}
