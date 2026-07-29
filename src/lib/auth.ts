import { after } from "next/server";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";

import * as authSchema from "@/auth-schema";
import { db } from "@/db";
import { serverEnv } from "@/env/server";
import { sendPasswordResetEmail } from "@/lib/email";

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
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  account: {
    encryptOAuthTokens: true,
  },
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      after(async () => {
        try {
          await sendPasswordResetEmail({ to: user.email, url });
        } catch (error) {
          console.error("Failed to send password reset email", error instanceof Error ? error.name : "unknown");
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
          },
        },
      }
    : {}),
});

export type Session = typeof auth.$Infer.Session;
