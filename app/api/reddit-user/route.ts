import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  if (!u) return NextResponse.json({ karma: 0 });
  try {
    const res = await fetch(
      `https://www.reddit.com/user/${encodeURIComponent(u)}/about.json`,
      { headers: { "User-Agent": "agentk/1.0 (web dashboard)" }, next: { revalidate: 300 } }
    );
    if (!res.ok) return NextResponse.json({ karma: 0 });
    const json = await res.json();
    const karma = (json?.data?.link_karma ?? 0) + (json?.data?.comment_karma ?? 0);
    return NextResponse.json({ karma });
  } catch {
    return NextResponse.json({ karma: 0 });
  }
}
