import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/session";
import {
  getManagedPlayerHistory,
  getPublicPlayerHistory,
  historyEditionFilters,
  historyPeriods,
  type HistoryEditionFilter,
  type HistoryPeriod,
} from "@/lib/servers/player-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ serverId: string }> };

export async function GET(request: Request, { params }: Props) {
  const { serverId } = await params;
  const query = new URL(request.url).searchParams;
  const periodValue = query.get("period") ?? "24h";
  const editionValue = query.get("edition") ?? "all";
  if (!historyPeriods.includes(periodValue as HistoryPeriod) || !historyEditionFilters.includes(editionValue as HistoryEditionFilter)) {
    return NextResponse.json({ error: "Invalid history parameters." }, { status: 400 });
  }
  const period = periodValue as HistoryPeriod;
  const edition = editionValue as HistoryEditionFilter;
  const session = await getServerSession();
  const publicData = await getPublicPlayerHistory(serverId, period, edition);
  const data = publicData ?? (session ? await getManagedPlayerHistory(serverId, session.user.id, period, edition) : null);
  if (!data) return NextResponse.json({ error: "Server not found." }, { status: 404 });

  const body = JSON.stringify(data);
  const stableData = { ...data, generatedAt: undefined };
  const etag = `"${createHash("sha256").update(JSON.stringify(stableData)).digest("hex").slice(0, 24)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ETag: etag,
      "cache-control": publicData ? "public, max-age=60, must-revalidate" : "private, no-store",
    },
  });
}
