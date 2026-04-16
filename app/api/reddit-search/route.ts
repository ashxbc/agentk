import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const EMPTY = { data: { children: [] } };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q) return NextResponse.json(EMPTY);

  const urls = [
    `https://www.reddit.com/api/subreddit_autocomplete_v2.json?query=${encodeURIComponent(q)}&limit=6&include_over_18=false&include_profiles=false`,
    `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(q)}&limit=6`,
  ];

  const log: string[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        redirect: "follow",
        cache: "no-store",
      });
      log.push(`${url.slice(0, 60)} → status:${res.status}`);
      if (!res.ok) continue;
      const text = await res.text();
      log.push(`body_start:${text.slice(0, 80)}`);
      if (!text.startsWith("{")) continue;
      const json = JSON.parse(text);
      const children = json?.data?.children ?? [];
      if (children.length > 0) return NextResponse.json(json);
    } catch (e: any) {
      log.push(`error:${e?.message}`);
      continue;
    }
  }

  return NextResponse.json({ ...EMPTY, _debug: log });
}
