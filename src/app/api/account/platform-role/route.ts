import { NextResponse } from "next/server";

import { getPlatformRole } from "@/lib/admin";
import { getServerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  const role = session ? await getPlatformRole(session.user.id) : null;

  return NextResponse.json(
    { role },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
