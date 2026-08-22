import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { RateLimitExceededError } from "@/lib/rate-limit";
import {
  createReviewReport,
  ReviewNotFoundError,
  ReviewNotEligibleError,
  ReviewPermissionError,
  ReviewReportAlreadyOpenError,
  ReviewReportSelfError,
} from "@/lib/servers/reviews";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ serverId: string; reviewId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Inicia sesión para reportar una opinión." }, { status: 401 });

  const { serverId, reviewId } = await params;
  if (!uuidPattern.test(serverId) || !uuidPattern.test(reviewId)) {
    return NextResponse.json({ error: "La opinión indicada no existe." }, { status: 400 });
  }
  const body = await request.json().catch(() => null) as { reason?: string; details?: string } | null;
  try {
    const report = await createReviewReport(session.user.id, serverId, reviewId, {
      reason: body?.reason ?? "",
      details: body?.details,
    });
    return NextResponse.json({ ok: true, id: report.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewReportAlreadyOpenError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ReviewReportSelfError || error instanceof ReviewPermissionError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof ReviewNotFoundError || error instanceof ReviewNotEligibleError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof RateLimitExceededError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "El motivo del reporte no es válido." }, { status: 400 });
    console.error("Failed to create review report", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "No se pudo enviar el reporte." }, { status: 500 });
  }
}
