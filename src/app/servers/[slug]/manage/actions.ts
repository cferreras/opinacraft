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
} from "@/lib/servers/verification";
import { ServerPermissionError } from "@/lib/servers/permissions";
import { databaseConstraint, databaseErrorCode } from "@/lib/db-errors";
import {
  minecraftEditions,
  ServerInputError,
  type UpdateServerInput,
} from "@/lib/servers/validation";
import { TagBlockedError, TagInputError } from "@/lib/servers/tags";

export type ManageState = {
  formError?: string;
  fieldErrors?: Partial<Record<"name" | "description" | "websiteUrl" | "discordUrl" | "tags" | "endpoints" | "publicationStatus", string>>;
};

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function optionalPort(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const port = Number(trimmed);
  return Number.isInteger(port) ? port : Number.NaN;
}

function getServerInput(formData: FormData): UpdateServerInput {
  const endpoints: UpdateServerInput["endpoints"] = [];
  for (const edition of minecraftEditions) {
    if (formData.get(`${edition}Enabled`) !== "on") continue;
    endpoints.push({
      edition,
      host: formValue(formData, `${edition}Host`) ?? "",
      port: optionalPort(formValue(formData, `${edition}Port`)),
    });
  }

  return {
    name: formValue(formData, "name") ?? "",
    description: formValue(formData, "description"),
    websiteUrl: formValue(formData, "websiteUrl"),
    discordUrl: formValue(formData, "discordUrl"),
    tags: (formValue(formData, "tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
    endpoints,
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
      return { formError: error.issues[0]?.message ?? "Invalid server details." };
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
    if (error instanceof TagInputError || error instanceof TagBlockedError) {
      return { fieldErrors: { tags: error.message } };
    }
    if (error instanceof DuplicateEndpointError || (databaseErrorCode(error) === "23505" && databaseConstraint(error) === "server_endpoints_verified_edition_host_port_key")) {
      return { fieldErrors: { endpoints: "One of these addresses is already registered." } };
    }
    console.error("Failed to update server", error instanceof Error ? error.name : "unknown");
    return { formError: "Unable to update the server right now." };
  }

  revalidatePath("/servers");
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
  revalidatePath("/servers");
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
  revalidatePath(`/servers/${slug}/manage`);
  redirect(`/servers/${slug}/manage?memberUpdated=1`);
}

export async function startVerificationAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const edition = formValue(formData, "edition") === "bedrock" ? "bedrock" : "java";
  try {
    await startServerVerification(serverId, session.user.id, edition);
  } catch (error) {
    const reason = error instanceof EndpointAlreadyVerifiedError ? "already-verified" :
      error instanceof VerificationAlreadyPendingError ? "pending" :
      error instanceof NoJavaEndpointError || error instanceof NoBedrockEndpointError ? `no-${edition}` :
      error instanceof VerificationRateLimitError ? "rate-limit" :
      error instanceof VerificationUnavailableError ? "unavailable" : "unknown";
    if (reason === "unknown") console.error("Failed to start server verification", error);
    redirect(`/servers/${slug}/manage?verificationError=${reason}`);
  }
  revalidatePath(`/servers/${slug}/manage`);
  redirect(`/servers/${slug}/manage?verification=started`);
}

export async function checkVerificationAction(formData: FormData) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in?callbackURL=/dashboard/servers");
  const serverId = formValue(formData, "serverId") ?? "";
  const slug = formValue(formData, "slug") ?? "";
  const verificationId = formValue(formData, "verificationId") ?? "";
  const edition = formValue(formData, "edition") === "bedrock" ? "bedrock" : "java";
  let result: Awaited<ReturnType<typeof checkServerVerification>>;
  try {
    result = await checkServerVerification(verificationId, serverId, session.user.id, edition);
  } catch (error) {
    if (error instanceof VerificationExpiredError) {
      redirect(`/servers/${slug}/manage?verification=expired`);
    }
    if (error instanceof VerificationRateLimitError) {
      redirect(`/servers/${slug}/manage?verificationError=rate-limit`);
    }
    if (error instanceof VerificationUnavailableError) {
      redirect(`/servers/${slug}/manage?verificationError=unavailable`);
    }
    console.error("Failed to check server verification", error);
    redirect(`/servers/${slug}/manage?verificationError=unknown`);
  }
  revalidatePath(`/servers/${slug}/manage`);
  if (result.result === "verified") {
    revalidatePath("/servers");
    revalidatePath(`/servers/${slug}`);
  }
  redirect(`/servers/${slug}/manage?verification=${result.result}`);
}
