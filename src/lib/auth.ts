import { createHash } from "node:crypto";

import { after } from "next/server";
import { eq } from "drizzle-orm";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";

import * as authSchema from "@/auth-schema";
import { db } from "@/db";
import { serverEnv } from "@/env/server";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email";
import { notificationJobs } from "@/schema";

const discordClientId = serverEnv.DISCORD_CLIENT_ID;
const discordClientSecret = serverEnv.DISCORD_CLIENT_SECRET;
const trustedOrigins = serverEnv.BETTER_AUTH_TRUSTED_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: authSchema.user,
      session: authSchema.session,
      account: authSchema.account,
      verification: authSchema.verification,
      rateLimit: authSchema.rateLimit,
    },
  }),
  secret: serverEnv.BETTER_AUTH_SECRET,
  baseURL: serverEnv.BETTER_AUTH_URL,
  trustedOrigins,
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
      if (!email) return;

      const existingUser = await ctx.context.adapter.findOne({
        model: "user",
        where: [{ field: "email", value: email }],
      });

      if (!existingUser) return;

      throw new APIError("CONFLICT", {
        code: "USER_ALREADY_EXISTS",
        message: "Ya existe una cuenta con ese correo.",
      });
    }),
  },
  databaseHooks: {
    user: {
      update: {
        // Discord signs in with `overrideUserInfoOnSignIn`, which rewrites name and image from the
        // profile. Keep only the image, and only for accounts that never uploaded their own: a
        // Discord avatar hash goes stale (404) as soon as the user changes it on Discord.
        before: async (data, context) => {
          if (!context?.path?.startsWith("/callback/")) return;

          const email = typeof data.email === "string" ? data.email.toLowerCase() : null;
          const { name: _name, image, ...rest } = data;
          if (!email || typeof image !== "string") return { data: rest };

          const [account] = await db
            .select({ imageKey: authSchema.user.imageKey })
            .from(authSchema.user)
            .where(eq(authSchema.user.email, email))
            .limit(1);

          return { data: account?.imageKey ? rest : { ...rest, image } };
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  account: {
    encryptOAuthTokens: true,
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        const dedupeKey = `change-email:${createHash("sha256").update(`${user.id}:${url}`).digest("hex")}`;
        await db.insert(notificationJobs).values({
          dedupeKey,
          recipientUserId: user.id,
          recipientEmail: user.email,
          template: "change_email_confirmation",
          payload: { currentEmail: user.email, newEmail, url },
        }).onConflictDoNothing({ target: notificationJobs.dedupeKey });
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      after(async () => {
        try {
          await sendPasswordResetEmail({ to: user.email, url });
        } catch (error) {
          console.error(
            "Failed to send password reset email",
            error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
          );
        }
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      after(async () => {
        try {
          await sendVerificationEmail({ to: user.email, url });
        } catch (error) {
          console.error(
            "Failed to send email verification",
            error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
          );
        }
      });
    },
  },
  ...(discordClientId && discordClientSecret
    ? {
        socialProviders: {
          discord: {
            clientId: discordClientId,
            clientSecret: discordClientSecret,
            overrideUserInfoOnSignIn: true,
          },
        },
      }
    : {}),
});

export type Session = typeof auth.$Infer.Session;
