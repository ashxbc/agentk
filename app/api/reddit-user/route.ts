import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  if (!u) return NextResponse.json({ karma: 0 });
  try {
    const res = await fetch(
      `https://www.reddit.com/user/${encodeURIComponent(u)}/about.json`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
      }
    );
    if (!res.ok) return NextResponse.json({ karma: 0 });
    const text = await res.text();
    if (!text.startsWith("{")) return NextResponse.json({ karma: 0 });
    const json = JSON.parse(text);
    const karma = (json?.data?.link_karma ?? 0) + (json?.data?.comment_karma ?? 0);
    return NextResponse.json({ karma });
  } catch {
    return NextResponse.json({ karma: 0 });
  }
}
