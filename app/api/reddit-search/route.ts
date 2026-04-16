import { NextRequest, NextResponse } from "next/server";

const EMPTY = { data: { children: [] } };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q) return NextResponse.json(EMPTY);

  try {
    const res = await fetch(
      `https://www.reddit.com/api/subreddit_autocomplete_v2.json?query=${encodeURIComponent(q)}&limit=6&include_over_18=false&include_profiles=false`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
        redirect: "follow",
      }
    );

    if (!res.ok) return NextResponse.json(EMPTY);
    const json = await res.json();
    // autocomplete_v2 returns same shape: data.children[].data.display_name
    return NextResponse.json(json);
  } catch {
    return NextResponse.json(EMPTY);
  }
}
