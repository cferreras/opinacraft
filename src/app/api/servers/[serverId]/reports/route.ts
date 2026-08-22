import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { createServerReport, ReportAlreadyOpenError, ReportValidationError } from "@/lib/servers/reports";

export async function POST(request: Request, { params }: { params: Promise<{ serverId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Sign in to report a server." }, { status: 401 });
  const { serverId } = await params;
  const body = await request.json().catch(() => null) as { reason?: string; details?: string } | null;
  try {
    const report = await createServerReport(session.user.id, serverId, body?.reason ?? "", body?.details);
    return NextResponse.json({ ok: true, id: report?.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ReportAlreadyOpenError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ReportValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Failed to create server report", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Unable to submit report." }, { status: 500 });
  }
}
