import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q) return NextResponse.json({ data: { children: [] } });

  const res = await fetch(
    `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(q)}&limit=6`,
    { headers: { "User-Agent": "agentk/1.0 (web dashboard)" } }
  );

  if (!res.ok) return NextResponse.json({ data: { children: [] } });
  const json = await res.json();
  return NextResponse.json(json);
}
