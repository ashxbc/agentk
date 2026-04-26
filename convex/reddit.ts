import { action, httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { matchPostsToQueries } from "./postMatcher";

// ── Proxy helpers ─────────────────────────────────────────────────────────────

function proxyBase(): string | undefined {
  return process.env.REDDIT_PROXY_URL?.replace(/\/$/, "");
}

function proxyHeaders(): Record<string, string> {
  const key = process.env.REDDIT_PROXY_SECRET;
  return key ? { "X-Api-Key": key } : { "User-Agent": "agentk/1.0" };
}

// Accepts up to 3 subs (Reddit multi-sub syntax: r/sub1+sub2+sub3)
function subredditUrl(subs: string[]): string {
  const base = proxyBase();
  const path = subs.map(encodeURIComponent).join("+");
  return base
    ? `${base}/r/${path}/new?limit=100`
    : `https://www.reddit.com/r/${path}/new.json?limit=100`;
}

function karmaUrl(author: string): string {
  const base = proxyBase();
  return base
    ? `${base}/user/${encodeURIComponent(author)}/about`
    : `https://www.reddit.com/user/${encodeURIComponent(author)}/about.json`;
}

function searchUrl(q: string): string {
  const base = proxyBase();
  return base
    ? `${base}/search/subreddits?query=${encodeURIComponent(q)}`
    : `https://www.reddit.com/api/subreddit_autocomplete_v2.json?query=${encodeURIComponent(q)}&limit=6&include_over_18=false&include_profiles=false`;
}

const FETCH_TIMEOUT_MS = 25_000; // 25s per attempt — prevents hung connections

// Fetch helper — retries up to 2 times on network/5xx errors, skips on 429
async function fetchJSON(subs: string[]): Promise<{ json: any; proxyHost: string } | null> {
  const url     = subredditUrl(subs);
  const headers = proxyHeaders();
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res       = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      const proxyHost = res.headers.get("X-Proxy-Host") ?? proxyBase() ?? "direct";
      if (res.status === 429) return null;
      if (res.status >= 500 && attempt < 2) continue;
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.data?.children) return null;
      return { json, proxyHost };
    } catch {
      clearTimeout(timer);
      if (attempt < 2) continue;
      return null;
    }
  }
  return null;
}

// ── Karma cache ───────────────────────────────────────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const getKarmaCached = internalQuery({
  args: { author: v.string() },
  handler: async (ctx, { author }) =>
    ctx.db.query("karmaCache").withIndex("by_author", q => q.eq("author", author)).first(),
});

export const setKarmaCache = internalMutation({
  args: { author: v.string(), karma: v.number() },
  handler: async (ctx, { author, karma }) => {
    const existing = await ctx.db.query("karmaCache").withIndex("by_author", q => q.eq("author", author)).first();
    if (existing) await ctx.db.patch(existing._id, { karma, fetchedAt: Date.now() });
    else await ctx.db.insert("karmaCache", { author, karma, fetchedAt: Date.now() });
  },
});

export const fetchKarma = action({
  args: { author: v.string() },
  handler: async (ctx, { author }): Promise<number | null> => {
    const cached = await ctx.runQuery(internal.reddit.getKarmaCached, { author });
    if (cached && Date.now() - cached.fetchedAt < TWENTY_FOUR_HOURS_MS) return cached.karma;
    try {
      const res = await fetch(karmaUrl(author), { headers: proxyHeaders() });
      if (!res.ok) {
        console.warn(`[fetchKarma] ${author}: HTTP ${res.status}`);
        return null;
      }
      const json = await res.json();
      const karma = (json?.data?.link_karma ?? 0) + (json?.data?.comment_karma ?? 0);
      await ctx.runMutation(internal.reddit.setKarmaCache, { author, karma });
      return karma;
    } catch (e) {
      console.warn(`[fetchKarma] ${author}: ${e}`);
      return null;
    }
  },
});

export const searchSubreddits = action({
  args: { query: v.string() },
  handler: async (_ctx, { query }): Promise<string[]> => {
    try {
      const res = await fetch(searchUrl(query), { headers: proxyHeaders() });
      if (!res.ok) return [];
      const json = await res.json();
      return (json?.data?.children ?? []).map((c: any) => c.data.display_name as string);
    } catch { return []; }
  },
});

// ── Proxy health logging ──────────────────────────────────────────────────────

export const logProxyWarn = internalMutation({
  args: { subreddits: v.string(), message: v.string() },
  handler: async (ctx, { subreddits, message }) => {
    await ctx.db.insert("proxyHealth", {
      timestamp: Date.now(),
      type: "warn",
      subreddits,
      message,
    });
  },
});

export const logProxyOk = internalMutation({
  args: { subreddits: v.string(), message: v.string() },
  handler: async (ctx, { subreddits, message }) => {
    await ctx.db.insert("proxyHealth", {
      timestamp: Date.now(),
      type: "ok",
      subreddits,
      message,
    });
    // Prune entries older than 30 minutes to keep table lean
    const cutoff = Date.now() - 30 * 60 * 1000;
    const old = await ctx.db
      .query("proxyHealth")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
  },
});

export const getRecentWarnCount = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 5 * 60 * 1000; // last 5 minutes
    const rows = await ctx.db
      .query("proxyHealth")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", cutoff))
      .collect();
    const warns = rows.filter((r) => r.type === "warn");
    return {
      warns: warns.length,
      total: rows.length,
      recent: warns.slice(-10).map((r) => ({
        t: r.timestamp,
        subs: r.subreddits,
        msg: r.message,
      })),
    };
  },
});

// ── HTTP endpoint: GET /proxy-health ─────────────────────────────────────────

export const proxyHealthEndpoint = httpAction(async (ctx) => {
  // No secret configured → open (internal use only, not exposed publicly)
  const cutoff = Date.now() - 5 * 60 * 1000;
  const rows = await ctx.runQuery(internal.reddit.getRecentWarnCount, {});
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ── globalFetch — shared cron: batched fetch (≤3 subs per request), query-based LLM matching ─

const BATCH_SIZE = 25;
const CHUNK_SIZE = 3;
const jitter = () => Math.floor(Math.random() * 1000);

function mapRedditPost(p: any) {
  return {
    postId:      String(p.id),
    type:        p.is_self ? "self" : "link",
    title:       p.title ?? undefined,
    body:        p.selftext ?? "",
    author:      p.author ?? "",
    subreddit:   p.subreddit ?? "",
    url:         `https://www.reddit.com${p.permalink}`,
    ups:         p.ups ?? 0,
    numComments: p.num_comments ?? 0,
    createdUtc:  p.created_utc ?? 0,
  };
}

export const globalFetch = internalAction({
  args: { subsToFetch: v.optional(v.array(v.string())) },
  handler: async (ctx, { subsToFetch }) => {
    const allQueries = await ctx.runQuery(internal.userQueries.getAllActiveQueries);

    if (allQueries.length === 0) {
      console.log("[globalFetch] no active users — skipping");
      return;
    }

    const allUniqueSubs = subsToFetch ?? [
      ...new Set(allQueries.flatMap((q) => q.subreddits.map((s) => s.toLowerCase()))),
    ];

    const batchSubs    = allUniqueSubs.slice(0, BATCH_SIZE);
    const overflowSubs = allUniqueSubs.slice(BATCH_SIZE);

    if (overflowSubs.length > 0) {
      console.log(`[globalFetch] overflow: ${overflowSubs.length} subs scheduled in 90s`);
      await ctx.scheduler.runAfter(90_000, internal.reddit.globalFetch, { subsToFetch: overflowSubs });
    } else {
      console.log(`[globalFetch] users=${allQueries.length} | subs=${batchSubs.length}`);
    }

    // Fetch in chunks of ≤3 (Reddit multi-sub syntax)
    const allPosts: any[] = [];
    for (let i = 0; i < batchSubs.length; i += CHUNK_SIZE) {
      const chunk  = batchSubs.slice(i, i + CHUNK_SIZE);
      const result = await fetchJSON(chunk);
      if (result) {
        const posts = result.json.data?.children?.map((c: any) => c.data) ?? [];
        allPosts.push(...posts);
        console.log(`[globalFetch] r/${chunk.join("+")} → ${posts.length} posts via ${result.proxyHost}`);
        await ctx.runMutation(internal.reddit.logProxyOk, {
          subreddits: chunk.join("+"),
          message: `${posts.length} posts via ${result.proxyHost}`,
        });
      } else {
        console.warn(`[globalFetch] null for r/${chunk.join("+")}`);
        await ctx.runMutation(internal.reddit.logProxyWarn, {
          subreddits: chunk.join("+"),
          message: "null response",
        });
      }
      await new Promise((r) => setTimeout(r, 500 + jitter()));
    }

    // Global filter: last 24h, not deleted, title >30 chars, score ≥1
    const cutoffSec = Date.now() / 1000 - 24 * 3600;
    const seenIds   = new Set<string>();
    const filtered  = allPosts.filter((p) => {
      if (!p?.id || seenIds.has(p.id)) return false;
      if ((p.created_utc ?? 0) < cutoffSec) return false;
      if (!p.title || p.title.length <= 30) return false;
      if ((p.score ?? p.ups ?? 0) < 1) return false;
      const body = (p.selftext ?? "").toLowerCase().trim();
      if (body === "[deleted]" || body === "[removed]") return false;
      seenIds.add(p.id);
      return true;
    });

    console.log(`[globalFetch] after filter: ${filtered.length} posts`);
    if (filtered.length === 0) return;

    const apiKey = process.env.GROQ_API_KEY;

    for (const userQ of allQueries) {
      const { userId } = userQ;

      await ctx.runMutation(internal.feedPosts.deleteExpiredFeedPosts, { userId });

      if (!apiKey) {
        console.warn(`[globalFetch] no GROQ_API_KEY — skipping LLM for user ${userId}`);
        continue;
      }

      const allowedSubs = new Set(userQ.subreddits.map((s) => s.toLowerCase()));
      const candidates  = filtered
        .filter((p) => allowedSubs.has((p.subreddit ?? "").toLowerCase()))
        .map(mapRedditPost);

      if (candidates.length === 0) {
        console.log(`[globalFetch] user=${userId} | candidates=0`);
        continue;
      }

      const matches = await matchPostsToQueries(
        candidates.map((p) => ({ postId: p.postId, title: p.title ?? "", body: p.body })),
        userQ.queries,
        apiKey,
      );

      if (matches.length === 0) {
        console.log(`[globalFetch] user=${userId} | candidates=${candidates.length} | matched=0`);
        continue;
      }

      const matchMap    = new Map(matches.map((m) => [m.postId, m.matchedQueries]));
      const toInsert    = candidates
        .filter((p) => matchMap.has(p.postId))
        .map(({ type: _type, ...p }) => ({ ...p, matchedQueries: matchMap.get(p.postId)! }));

      const inserted: string[] = await ctx.runMutation(internal.feedPosts.upsertFeedPosts, {
        userId,
        posts: toInsert,
      });

      console.log(`[globalFetch] user=${userId} | candidates=${candidates.length} | matched=${matches.length} | inserted=${inserted.length} new`);
    }
  },
});

