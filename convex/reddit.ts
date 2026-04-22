import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { matchPostsToIntents, normalizeIntent } from "./aiFilter";

const SIX_HOURS_SEC  = 6 * 3600;
const SIX_HOURS_MS   = SIX_HOURS_SEC * 1000;

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

// Fetch helper — retries up to 2 times on network/5xx errors, skips on 429
async function fetchJSON(subs: string[]): Promise<{ json: any; proxyHost: string } | null> {
  const url     = subredditUrl(subs);
  const headers = proxyHeaders();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res       = await fetch(url, { headers });
      const proxyHost = res.headers.get("X-Proxy-Host") ?? proxyBase() ?? "direct";
      if (res.status === 429) return null;
      if (res.status >= 500 && attempt < 2) continue;
      if (!res.ok) return null;
      const json = await res.json();
      if (!json?.data?.children) return null;
      return { json, proxyHost };
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
      .withIndex("by_user_created", (q) => q.eq("userId", userId).gte("createdUtc", cutoffSec))
      .collect();

    if (!settings) {
      return allPosts
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
    // Also purge the isolated AI candidate pool for this user.
    const expiredAi = await ctx.db
      .query("redditResultsAi")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.lt(q.field("createdUtc"), cutoffSec))
      .collect();
    for (const doc of expiredAi) await ctx.db.delete(doc._id);
  },
});

// Merge matched intents onto redditResultsAi rows by postId. Each row
// accumulates the normalized intent queries it was classified under.
export const tagAiPostsWithIntents = internalMutation({
  args: {
    userId: v.id("users"),
    pairs:  v.array(v.object({ postId: v.string(), intent: v.string() })),
  },
  handler: async (ctx, { userId, pairs }) => {
    const byPost = new Map<string, Set<string>>();
    for (const { postId, intent } of pairs) {
      if (!byPost.has(postId)) byPost.set(postId, new Set());
      byPost.get(postId)!.add(intent);
    }
    for (const [postId, intents] of byPost) {
      const row = await ctx.db
        .query("redditResultsAi")
        .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", postId))
        .first();
      if (!row) continue;
      const merged = Array.from(new Set([...(row.matchedIntents ?? []), ...intents]));
      await ctx.db.patch(row._id, { matchedIntents: merged });
    }
  },
});

// Upsert AI-mode candidate posts into the isolated redditResultsAi table.
// Returns only postIds that were newly inserted.
export const upsertAiCandidates = internalMutation({
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
        .query("redditResultsAi")
        .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", post.postId))
        .first();
      if (!existing) {
        await ctx.db.insert("redditResultsAi", { userId, ...post, fetchedAt: now });
        newIds.push(post.postId);
      }
    }
    return newIds;
  },
});

// Upsert posts; returns only the postIds that were newly inserted.
// Each post carries the list of matchedKeywords that triggered its inclusion
// (denormalized from the user's active keyword list at insert time). When an
// existing row is re-matched in a later cycle we union-merge the keywords.
export const upsertResults = internalMutation({
  args: {
    userId: v.id("users"),
    posts: v.array(v.object({
      postId:          v.string(),
      type:            v.string(),
      title:           v.optional(v.string()),
      body:            v.string(),
      author:          v.string(),
      subreddit:       v.string(),
      url:             v.string(),
      ups:             v.number(),
      numComments:     v.number(),
      createdUtc:      v.number(),
      matchedKeywords: v.optional(v.array(v.string())),
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
      } else if (post.matchedKeywords && post.matchedKeywords.length > 0) {
        // Merge newly-matching keywords into the existing row so the audit
        // column reflects every keyword that ever caused a hit.
        const merged = Array.from(
          new Set([...(existing.matchedKeywords ?? []), ...post.matchedKeywords]),
        );
        await ctx.db.patch(existing._id, { matchedKeywords: merged });
      }
    }
    return newIds;
  },
});

// ── Karma cache ───────────────────────────────────────────────────────────────

const FIVE_MIN_MS = 24 * 60 * 60 * 1000;

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
    if (cached && Date.now() - cached.fetchedAt < FIVE_MIN_MS) return cached.karma;
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

// ── getAllActiveSettings — users with ≥1 keyword AND ≥1 subreddit ─────────────

export const getAllActiveSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("userSettings").collect();
    return all.filter((s) => s.keywords.length > 0 && s.subreddits.length > 0);
  },
});

// ── globalFetch — shared cron: batched fetch (≤3 subs per request), normal + AI fan-out ─

const BATCH_SIZE = 25;         // max unique subs per run (overflow scheduled 90s later)
const CHUNK_SIZE = 3;          // max subs per single Reddit multi-sub request
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
    // 1. Users with normal settings + users with AI settings
    const allSettings   = await ctx.runQuery(internal.reddit.getAllActiveSettings);
    const allAiSettings = await ctx.runQuery(internal.aiFilter.getAllActiveAiSettings);

    if (allSettings.length === 0 && allAiSettings.length === 0) {
      console.log("[globalFetch] no active users — skipping");
      return;
    }

    // 2. Unique subreddits — combine normal + AI subs
    const normalSubs = allSettings.flatMap((s) => s.subreddits.map((r) => r.toLowerCase()));
    const aiSubs     = allAiSettings.flatMap((s) => s.subreddits.map((r) => r.toLowerCase()));
    const allUniqueSubs = subsToFetch ?? [...new Set([...normalSubs, ...aiSubs])];

    // 3. Batch split: BATCH_SIZE subs per run, overflow to 90s later
    const batchSubs    = allUniqueSubs.slice(0, BATCH_SIZE);
    const overflowSubs = allUniqueSubs.slice(BATCH_SIZE);

    if (overflowSubs.length > 0) {
      console.log(`[globalFetch] ${allUniqueSubs.length} subs — run 1: ${batchSubs.length}, overflow: ${overflowSubs.length} scheduled in 90s`);
      await ctx.scheduler.runAfter(90_000, internal.reddit.globalFetch, { subsToFetch: overflowSubs });
    } else {
      console.log(`[globalFetch] start — normal users: ${allSettings.length} | AI users: ${allAiSettings.length} | subreddits: ${batchSubs.length}`);
    }

    // 4. Fetch subs in chunks of ≤3 (Reddit multi-sub syntax: r/sub1+sub2+sub3)
    const allPosts: any[] = [];
    for (let i = 0; i < batchSubs.length; i += CHUNK_SIZE) {
      const chunk = batchSubs.slice(i, i + CHUNK_SIZE);
      const result = await fetchJSON(chunk);
      if (result) {
        const posts = result.json.data?.children?.map((c: any) => c.data) ?? [];
        allPosts.push(...posts);
        console.log(`[globalFetch] r/${chunk.join("+")} via ${result.proxyHost} → ${posts.length} posts`);
      } else {
        console.warn(`[globalFetch] null response for r/${chunk.join("+")}`);
      }
      await new Promise((r) => setTimeout(r, 1500 + jitter()));
    }

    // 5. Global post filter: last 6h, not deleted/removed, title >50 chars, score ≥1
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    const filteredPosts: any[] = [];
    const seenIds = new Set<string>();

    for (const p of allPosts) {
      if (!p?.id || seenIds.has(p.id)) continue;
      if ((p.created_utc ?? 0) < cutoffSec) continue;
      if (!p.title || p.title.length <= 50) continue;
      if ((p.score ?? p.ups ?? 0) < 1) continue;
      const selftext = (p.selftext ?? "").toLowerCase().trim();
      if (selftext === "[deleted]" || selftext === "[removed]") continue;
      seenIds.add(p.id);
      filteredPosts.push(p);
    }

    console.log(`[globalFetch] after global filter: ${filteredPosts.length} posts`);
    if (filteredPosts.length === 0) return;

    // 6. Unified fan-out: per user, run normal flow + AI flow, then fire alerts once
    const apiKey       = process.env.OPENROUTER_API_KEY;
    const normalByUser = new Map(allSettings.map((s) => [String(s.userId), s]));
    const aiByUser     = new Map(allAiSettings.map((s) => [String(s.userId), s]));
    const allUserIdStrs = new Set<string>([...normalByUser.keys(), ...aiByUser.keys()]);

    for (const userIdStr of allUserIdStrs) {
      const normalS = normalByUser.get(userIdStr);
      const aiS     = aiByUser.get(userIdStr);
      const userId  = (normalS?.userId ?? aiS!.userId);
      const tag     = `user=${userId}`;

      // Cleanup expired posts for this user (>6h) — both tables.
      await ctx.runMutation(internal.reddit.deleteExpiredForUser, { userId });

      const newPostIdsForAlerts = new Set<string>();

      // ═══ NORMAL FLOW ═══════════════════════════════════════════════
      if (normalS) {
        const { keywords, subreddits, excluded, minUpvotes, minComments } = normalS;
        const allowedSubs   = new Set(subreddits.map((s) => s.toLowerCase()));
        const keywordsLower = keywords.map((k) => k.toLowerCase());
        const excludedLower = excluded.map((e) => e.toLowerCase());

        // Keep the original keyword string (user's casing) paired with its
        // lowercase form so the stored matchedKeywords list reads naturally.
        const kwPairs = keywords.map((k) => ({ raw: k, lc: k.toLowerCase() }));

        const matched = filteredPosts
          .map((p) => {
            if (!allowedSubs.has((p.subreddit ?? "").toLowerCase())) return null;
            const title = (p.title ?? "").toLowerCase();
            const hits = kwPairs.filter((k) => title.includes(k.lc)).map((k) => k.raw);
            if (hits.length === 0) return null;
            if ((p.ups ?? 0) < minUpvotes) return null;
            if ((p.num_comments ?? 0) < minComments) return null;
            const text = `${p.title ?? ""} ${p.selftext ?? ""}`.toLowerCase();
            if (excludedLower.some((e) => text.includes(e))) return null;
            return { ...mapRedditPost(p), matchedKeywords: hits };
          })
          .filter((p): p is ReturnType<typeof mapRedditPost> & { matchedKeywords: string[] } => p !== null);

        if (matched.length === 0) {
          console.log(`[NORMAL] ${tag} | kw-matched=0 (no titles matched keywords)`);
        } else {
          const inserted: string[] = await ctx.runMutation(internal.reddit.upsertResults, {
            userId, posts: matched,
          });
          const duplicates = matched.length - inserted.length;
          console.log(
            `[NORMAL] ${tag} | kw-matched=${matched.length} | inserted=${inserted.length} new | duplicate=${duplicates}`,
          );
          for (const id of inserted) newPostIdsForAlerts.add(id);
        }
      } else {
        console.log(`[NORMAL] ${tag} | skipped (no keyword/subreddit settings)`);
      }

      // ═══ AI FLOW ═══════════════════════════════════════════════════
      if (aiS) {
        const { intents, subreddits } = aiS;
        const cleanIntents = intents.filter(Boolean);

        if (cleanIntents.length === 0 || subreddits.length === 0) {
          console.log(`[AI]     ${tag} | skipped (intents=${cleanIntents.length}, subs=${subreddits.length})`);
        } else if (!apiKey) {
          console.warn(`[AI]     ${tag} | skipped (OPENROUTER_API_KEY not set)`);
        } else {
          const allowedSubs = new Set(subreddits.map((s) => s.toLowerCase()));
          const aiCandidates = filteredPosts
            .filter((p) => allowedSubs.has((p.subreddit ?? "").toLowerCase()))
            .map(mapRedditPost);

          if (aiCandidates.length === 0) {
            console.log(`[AI]     ${tag} | candidates=0 (no posts in AI subs this cycle)`);
          } else {
            const insertedCandidates: string[] = await ctx.runMutation(internal.reddit.upsertAiCandidates, {
              userId, posts: aiCandidates,
            });
            const duplicates = aiCandidates.length - insertedCandidates.length;

            // ONE classifier call for all intents — the model tags each
            // matching post with the intent number(s) it satisfied. We map
            // those back to normalized intent keys to produce (postId, intent)
            // pairs for storage.
            const { postIds: uniqueMatchedIds, pairs, error } = await matchPostsToIntents(
              aiCandidates.map((p) => ({ postId: p.postId, title: p.title, body: p.body })),
              cleanIntents,
              apiKey,
              `AI ${tag}`,
            );

            // Per-intent breakdown for logging.
            const perIntentCounts = new Map<string, number>();
            for (const p of pairs) {
              perIntentCounts.set(p.intent, (perIntentCounts.get(p.intent) ?? 0) + 1);
            }
            const perIntentStr = cleanIntents
              .map((i) => {
                const k = normalizeIntent(i);
                return `"${k.slice(0, 28)}"=${perIntentCounts.get(k) ?? 0}`;
              })
              .join(", ");

            const insertedSet = new Set(insertedCandidates);
            const newMatches = uniqueMatchedIds.filter((id) => insertedSet.has(id));

            if (error) {
              console.warn(
                `[AI]     ${tag} | candidates=${aiCandidates.length} | inserted=${insertedCandidates.length} new | duplicate=${duplicates} | classifier=ERROR`,
              );
            } else {
              console.log(
                `[AI]     ${tag} | candidates=${aiCandidates.length} | inserted=${insertedCandidates.length} new | duplicate=${duplicates} | per-intent=[${perIntentStr}] | unique-matched=${uniqueMatchedIds.length} | new-matched=${newMatches.length} | pairs-written=${pairs.length}`,
              );
            }

            if (pairs.length > 0) {
              await ctx.runMutation(internal.aiFilter.appendMatchedPosts, {
                userId, entries: pairs,
              });
              // Denormalize onto each redditResultsAi row so the column shows
              // which intent queries matched that post.
              await ctx.runMutation(internal.reddit.tagAiPostsWithIntents, {
                userId, pairs,
              });
            }
            for (const id of newMatches) newPostIdsForAlerts.add(id);
          }
        }
      } else {
        console.log(`[AI]     ${tag} | skipped (no AI mode settings)`);
      }

      // --- Fire alerts once per user (combined normal + AI new posts) ---
      if (newPostIdsForAlerts.size > 0) {
        const idsArr = [...newPostIdsForAlerts];
        await ctx.scheduler.runAfter(0, internal.telegram.sendAlerts, { userId, postIds: idsArr });
        await ctx.scheduler.runAfter(0, internal.discord.sendDiscordAlerts, { userId, postIds: idsArr });
      }
    }
  },
});

