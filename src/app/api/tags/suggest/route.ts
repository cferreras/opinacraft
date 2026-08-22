import { NextResponse } from "next/server";

import { suggestTags } from "@/lib/servers/tags";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.length > 80) {
    return NextResponse.json({ tags: [] }, { status: 400 });
  }
  return NextResponse.json({ tags: await suggestTags(query) }, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
  });
}
