import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireServerSession(callbackURL = "/dashboard/servers") {
  const session = await getServerSession();

  if (!session) {
    redirect(`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`);
  }

  return session;
}
