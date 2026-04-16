import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const EMPTY = { data: { children: [] } };

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`${id}:${secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "agentk/1.0",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const json = await res.json();
    cachedToken = json.access_token;
    tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;
    return cachedToken;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q) return NextResponse.json(EMPTY);

  const token = await getToken();
  if (!token) return NextResponse.json(EMPTY);

  try {
    const res = await fetch(
      `https://oauth.reddit.com/api/subreddit_autocomplete_v2?query=${encodeURIComponent(q)}&limit=6&include_over_18=false&include_profiles=false`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "agentk/1.0",
        },
      }
    );
    if (!res.ok) {
      cachedToken = null;
      return NextResponse.json(EMPTY);
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch {
    return NextResponse.json(EMPTY);
  }
}
