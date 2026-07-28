import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";

import * as authSchema from "@/auth-schema";
import { db } from "@/db";
import { sendPasswordResetEmail } from "@/lib/email";
import * as appSchema from "@/schema";

const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...appSchema,
      user: authSchema.user,
      session: authSchema.session,
      account: authSchema.account,
      verification: authSchema.verification,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      void sendPasswordResetEmail({ to: user.email, url }).catch((error) => {
        console.error("Failed to send password reset email", error);
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
