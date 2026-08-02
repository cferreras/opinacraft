"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { getServerSession } from "@/lib/session";
import {
  createServer,
  DuplicateEndpointError,
  SlugGenerationError,
  UnverifiedEmailError,
} from "@/lib/servers/service";
import {
  ServerInputError,
  type CreateServerInput,
  minecraftEditions,
} from "@/lib/servers/validation";
import { TagBlockedError, TagInputError } from "@/lib/servers/tags";

export type CreateServerState = {
  formError?: string;
  fieldErrors?: Partial<Record<"name" | "description" | "websiteUrl" | "storeUrl" | "discordUrl" | "tags" | "endpoints", string>>;
  created?: { id: string; slug: string };
};

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function optionalPort(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const port = Number(trimmed);
  return Number.isInteger(port) ? port : Number.NaN;
}

function getInput(formData: FormData): CreateServerInput {
  const endpoints: CreateServerInput["endpoints"] = [];

  for (const edition of minecraftEditions) {
    if (formData.get(`${edition}Enabled`) !== "on") {
      continue;
    }

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
    storeUrl: formValue(formData, "storeUrl"),
    discordUrl: formValue(formData, "discordUrl"),
    tags: (formValue(formData, "tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
    endpoints,
  };
}

function zodFieldErrors(error: z.ZodError) {
  const fieldErrors: CreateServerState["fieldErrors"] = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      field === "name" ||
      field === "description" ||
      field === "websiteUrl" ||
      field === "storeUrl" ||
      field === "discordUrl" ||
      field === "tags" ||
      field === "endpoints"
    ) {
      fieldErrors[field] ??= issue.message;
    }
  }

  return fieldErrors;
}

export async function createServerAction(
  _previousState: CreateServerState | null,
  formData: FormData,
): Promise<CreateServerState | null> {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in?callbackURL=/servers/new");
  }

  let result: { id: string; slug: string };

  try {
    result = await createServer(session.user.id, getInput(formData));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { fieldErrors: zodFieldErrors(error) };
    }

    if (error instanceof ServerInputError) {
      const field =
        error.field === "host" || error.field === "port"
          ? "endpoints"
          : error.field;
      return { fieldErrors: { [field]: error.message } };
    }

    if (error instanceof DuplicateEndpointError) {
      return {
        fieldErrors: {
          endpoints: "One of these addresses is already registered.",
        },
      };
    }

    if (error instanceof SlugGenerationError) {
      return { formError: error.message };
    }

    if (error instanceof UnverifiedEmailError) {
      return { formError: `${error.message} Revisa tu perfil para reenviar el enlace.` };
    }
    if (error instanceof TagInputError || error instanceof TagBlockedError) {
      return { fieldErrors: { tags: error.message } };
    }

    console.error("Failed to create server", error instanceof Error ? error.name : "unknown");
    return { formError: "Unable to create the server right now." };
  }

  revalidatePath("/dashboard/servers");
  return { created: result };
}
