import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

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
  const u = req.nextUrl.searchParams.get("u") ?? "";
  if (!u) return NextResponse.json({ karma: 0 });

  const token = await getToken();
  if (!token) return NextResponse.json({ karma: 0 });

  try {
    const res = await fetch(
      `https://oauth.reddit.com/user/${encodeURIComponent(u)}/about`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "User-Agent": "agentk/1.0",
        },
      }
    );
    if (!res.ok) {
      cachedToken = null;
      return NextResponse.json({ karma: 0 });
    }
    const json = await res.json();
    const karma = (json?.data?.link_karma ?? 0) + (json?.data?.comment_karma ?? 0);
    return NextResponse.json({ karma });
  } catch {
    return NextResponse.json({ karma: 0 });
  }
}
