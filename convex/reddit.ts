import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

const SIX_HOURS_SEC  = 6 * 3600;
const SIX_HOURS_MS   = SIX_HOURS_SEC * 1000;

// Fetch helper — retries up to 2 times on network/5xx errors, skips on 429
async function fetchJSON(url: string): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "agentk/1.0 (web dashboard)" },
      });
      if (res.status === 429) return null;        // rate limited — skip silently
      if (res.status >= 500 && attempt < 2) continue; // server error — retry
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.data?.children) return null;     // malformed — skip
      return json;
    } catch {
      if (attempt < 2) continue;
      return null;
    }
  }
  return null;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const getResults = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;

    const allPosts = await ctx.db
      .query("redditResults")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (!settings) {
      return allPosts
        .filter((p) => p.createdUtc >= cutoffSec)
        .sort((a, b) => b.createdUtc - a.createdUtc)
        .slice(0, 25);
    }

    const allowedSubs   = new Set(settings.subreddits.map((s) => s.toLowerCase()));
    const excludedLower = settings.excluded.map((e) => e.toLowerCase());
    const keywordsLower = settings.keywords.map((k) => k.toLowerCase());

    return allPosts
      .filter((p) => {
        if (p.createdUtc < cutoffSec) return false;
        if (allowedSubs.size > 0 && !allowedSubs.has(p.subreddit.toLowerCase())) return false;
        const text = `${p.title ?? ""} ${p.body}`.toLowerCase();
        if (keywordsLower.length > 0 && !keywordsLower.some((k) => text.includes(k))) return false;
        if (p.ups < settings.minUpvotes) return false;
        if (p.numComments < settings.minComments) return false;
        if (excludedLower.some((e) => text.includes(e))) return false;
        return true;
      })
      .sort((a, b) => b.createdUtc - a.createdUtc)
      .slice(0, 25);
  },
});

export const getPostByUserPost = internalQuery({
  args: { userId: v.id("users"), postId: v.string() },
  handler: async (ctx, { userId, postId }) => {
    return await ctx.db
      .query("redditResults")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", postId))
      .first();
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

// Hourly cron: purge posts older than 6h across all users
export const deleteExpiredResults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    const expired = await ctx.db
      .query("redditResults")
      .filter((q) => q.lt(q.field("createdUtc"), cutoffSec))
      .collect();
    for (const doc of expired) await ctx.db.delete(doc._id);
  },
});

// Per-user expiry — runs at the start of every fetch cycle
export const deleteExpiredForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    const expired = await ctx.db
      .query("redditResults")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.lt(q.field("createdUtc"), cutoffSec))
      .collect();
    for (const doc of expired) await ctx.db.delete(doc._id);
  },
});

// Upsert posts; returns only the postIds that were newly inserted
export const upsertResults = internalMutation({
  args: {
    userId: v.id("users"),
    posts: v.array(v.object({
      postId:      v.string(),
      type:        v.string(),
      title:       v.optional(v.string()),
      body:        v.string(),
      author:      v.string(),
      subreddit:   v.string(),
      url:         v.string(),
      ups:         v.number(),
      numComments: v.number(),
      createdUtc:  v.number(),
    })),
  },
  handler: async (ctx, { userId, posts }) => {
    const now = Date.now();
    const newIds: string[] = [];
    for (const post of posts) {
      const existing = await ctx.db
        .query("redditResults")
        .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", post.postId))
        .first();
      if (!existing) {
        await ctx.db.insert("redditResults", { userId, ...post, fetchedAt: now });
        newIds.push(post.postId);
      }
    }
    return newIds;
  },
});

// ── triggerFetch — auth entry point ──────────────────────────────────────────

export const triggerFetch = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { status: "not_authenticated" as const };

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (!settings) return { status: "no_settings" as const };

    await ctx.db.patch(settings._id, { lastFetchAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.reddit.doFetch, { userId });
    return { status: "scheduled" as const };
  },
});

// ── doFetch — core pipeline ───────────────────────────────────────────────────

export const doFetch = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const settings = await ctx.runQuery(internal.userSettings.getSettingsInternal, { userId });
    if (!settings) {
      console.log("[doFetch] no settings for userId:", userId);
      return;
    }

    const { keywords, excluded, subreddits, minUpvotes, minComments } = settings;
    console.log("[doFetch] start — userId:", userId, "| subreddits:", subreddits, "| keywords:", keywords, "| minUpvotes:", minUpvotes, "| minComments:", minComments);

    await ctx.runMutation(internal.reddit.deleteExpiredForUser, { userId });

    const allPosts: any[] = [];
    const seen = new Set<string>();

    if (subreddits.length > 0) {
      for (const sub of subreddits) {
        console.log("[doFetch] fetching r/" + sub);
        const json = await fetchJSON(
          `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=100`
        );
        if (!json) { console.warn("[doFetch] null response for r/" + sub); continue; }
        const children = json.data?.children ?? [];
        console.log("[doFetch] r/" + sub + " →", children.length, "posts");
        for (const child of children) {
          const p = child?.data;
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          allPosts.push(p);
        }
      }
    } else if (keywords.length > 0) {
      for (const keyword of keywords) {
        console.log("[doFetch] searching:", keyword);
        const json = await fetchJSON(
          `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=100&type=link,self`
        );
        if (!json) { console.warn("[doFetch] null response for keyword:", keyword); continue; }
        const children = json.data?.children ?? [];
        console.log("[doFetch] keyword '" + keyword + "' →", children.length, "posts");
        for (const child of children) {
          const p = child?.data;
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          allPosts.push(p);
        }
      }
    } else {
      console.log("[doFetch] no subreddits or keywords — skipping");
      return;
    }

    console.log("[doFetch] raw posts collected:", allPosts.length);

    if (allPosts.length === 0) {
      console.log("[doFetch] 0 raw posts — nothing to store");
      return;
    }

    const cutoffSec      = (Date.now() / 1000) - SIX_HOURS_SEC;
    const excludedLower  = excluded.map((e) => e.toLowerCase());
    const keywordsLower  = keywords.map((k) => k.toLowerCase());
    const allowedSubsSet = new Set(subreddits.map((s) => s.toLowerCase()));

    const posts = allPosts
      .sort((a, b) => (b.created_utc ?? 0) - (a.created_utc ?? 0))
      .filter((p) => {
        if ((p.created_utc ?? 0) < cutoffSec) return false;
        if (allowedSubsSet.size > 0 && !allowedSubsSet.has((p.subreddit ?? "").toLowerCase())) return false;
        if (keywordsLower.length > 0) {
          const text = `${p.title ?? ""} ${p.selftext ?? ""}`.toLowerCase();
          if (!keywordsLower.some((k) => text.includes(k))) return false;
        }
        if ((p.ups ?? 0) < minUpvotes) return false;
        if ((p.num_comments ?? 0) < minComments) return false;
        const text = `${p.title ?? ""} ${p.selftext ?? ""}`.toLowerCase();
        if (excludedLower.some((e) => text.includes(e))) return false;
        return true;
      })
      .map((p) => ({
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
      }));

    console.log("[doFetch] after filters:", posts.length, "/", allPosts.length, "passed");

    if (posts.length === 0) {
      console.log("[doFetch] 0 posts after filtering — cutoff:", new Date(cutoffSec * 1000).toISOString());
      return;
    }

    const newPostIds = await ctx.runMutation(internal.reddit.upsertResults, { userId, posts });
    console.log("[doFetch] inserted", newPostIds.length, "new posts");

    if (newPostIds.length > 0) {
      await ctx.scheduler.runAfter(0, internal.telegram.sendAlerts, { userId, postIds: newPostIds });
    }
  },
});
