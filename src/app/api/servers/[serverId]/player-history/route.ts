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
import { isMonitorApiConfigured, isMonitorServerId } from "@/lib/servers/monitor-api-client";

type Props = { params: Promise<{ serverId: string }> };

export async function GET(request: Request, { params }: Props) {
  const { serverId } = await params;
  // The identifier reaches an internal service URL that carries the monitor
  // bearer token, so only a canonical UUID is ever forwarded.
  if (!isMonitorServerId(serverId)) return NextResponse.json({ error: "Server not found." }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const periodValue = query.get("period") ?? "24h";
  const editionValue = query.get("edition") ?? "all";
  if (!historyPeriods.includes(periodValue as HistoryPeriod) || !historyEditionFilters.includes(editionValue as HistoryEditionFilter)) {
    return NextResponse.json({ error: "Invalid history parameters." }, { status: 400 });
  }
  const period = periodValue as HistoryPeriod;
  const edition = editionValue as HistoryEditionFilter;
  const session = await getServerSession();
  let publicData;
  try {
    publicData = await getPublicPlayerHistory(serverId, period, edition);
  } catch (error) {
    if (isMonitorApiConfigured()) {
      return NextResponse.json({ error: "Monitor history is temporarily unavailable." }, { status: 503, headers: { "retry-after": "60" } });
    }
    throw error;
  }
  const data = publicData ?? (!isMonitorApiConfigured() && session ? await getManagedPlayerHistory(serverId, session.user.id, period, edition) : null);
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
