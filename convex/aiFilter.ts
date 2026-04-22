import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

const MAX_MATCHED_IDS = 500;

const SIX_HOURS_SEC = 6 * 3600;

export const getAiSettingsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
});

export const getRecentPostsForUser = internalQuery({
  args: { userId: v.id("users"), subreddits: v.array(v.string()) },
  handler: async (ctx, { userId, subreddits }) => {
    // AI mode is strictly scoped to user's AI subreddits. Empty list → no candidates.
    if (subreddits.length === 0) return [];
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    const allowedSubs = new Set(subreddits.map((s) => s.toLowerCase()));
    // Read from the isolated AI table only — no leakage from normal-flow posts.
    const posts = await ctx.db
      .query("redditResultsAi")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdUtc", cutoffSec)
      )
      .collect();
    return posts.filter((p) => allowedSubs.has(p.subreddit.toLowerCase()));
  },
});

// Client query: every AI-candidate post for this user in the last 6h.
// No subreddit filter — the client intersects with aiSettings.matchedPostIds
// so results stay stable even when the user edits subreddits mid-cycle.
// The isolated redditResultsAi table already guarantees no normal-flow leakage.
export const getAiCandidatePosts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const cutoffSec = (Date.now() / 1000) - SIX_HOURS_SEC;
    return await ctx.db
      .query("redditResultsAi")
      .withIndex("by_user_created", (q) =>
        q.eq("userId", userId).gte("createdUtc", cutoffSec)
      )
      .collect();
  },
});

export const getAiSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const setAiSettings = mutation({
  args: {
    intents:    v.array(v.string()),
    subreddits: v.array(v.string()),
  },
  handler: async (ctx, { intents, subreddits }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const existing = await ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    // Preserve existing matches on settings change — they stay visible until
    // the next globalFetch cycle produces the new batch. No manual trigger.
    if (existing) {
      await ctx.db.patch(existing._id, { intents, subreddits });
    } else {
      await ctx.db.insert("aiModeSettings", { userId, intents, subreddits, matchedPostIds: [] });
    }
  },
});

// Merge new matches with existing, dedupe, cap.
export const appendMatchedPostIds = internalMutation({
  args: { userId: v.id("users"), postIds: v.array(v.string()) },
  handler: async (ctx, { userId, postIds }) => {
    const existing = await ctx.db
      .query("aiModeSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!existing) return;
    const merged = [...new Set([...(existing.matchedPostIds ?? []), ...postIds])];
    const capped = merged.slice(-MAX_MATCHED_IDS);
    await ctx.db.patch(existing._id, { matchedPostIds: capped });
  },
});

// All users with non-empty intents AND non-empty subreddits
export const getAllActiveAiSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("aiModeSettings").collect();
    return all.filter((s) => s.intents.filter(Boolean).length > 0 && s.subreddits.length > 0);
  },
});

// Shared helper: given candidate posts + intents, ask Gemini which match.
// Returns matched postIds.
export async function matchPostsToIntents(
  posts: { postId: string; title?: string; body: string }[],
  intents: string[],
  apiKey: string,
  logTag: string = "matchPostsToIntents",
): Promise<{ postIds: string[]; error: boolean }> {
  const cleanIntents = intents.filter(Boolean);
  if (cleanIntents.length === 0 || posts.length === 0) {
    return { postIds: [], error: false };
  }

  const intentsList = cleanIntents
    .map((intent, n) => `${n + 1}. ${intent}`)
    .join("\n");

  const candidates = posts.slice(0, 200);
  const titleLines = candidates
    .map((p) => `${p.postId}\t${p.title ?? p.body.slice(0, 80)}`)
    .join("\n");

  const prompt =
`You are a world-class semantic relevance classifier for Reddit post titles.

Your only job: decide which titles below genuinely match the user's stated intents.

USER INTENTS (a title matches if it truthfully satisfies ANY single intent):
${intentsList}

MATCHING RULES — follow strictly:
1. Judge by MEANING, not by keyword overlap. A title with the right keywords but the wrong meaning is NOT a match. A title with different wording but the same meaning IS a match.
2. The match must be unambiguous and specific. If you'd have to stretch, invent context, or assume — do not match.
3. Exclude titles that merely mention the topic in passing, are tangential, off-topic, joking, memes, rants, or unrelated discussion.
4. Exclude titles where the intent is reversed (e.g. intent is "people who need X"; title is "people who hate X").
5. Questions, help requests, problem descriptions, and first-person posts can match if their core subject aligns with the intent.
6. Case, punctuation, emoji, and subreddit don't matter — only meaning.
7. When in doubt, exclude. Precision over recall.

INPUT FORMAT: one title per line, TAB-separated as "<postId>\\t<title>".

TITLES:
${titleLines}

OUTPUT: return ONLY a valid JSON array of the matching postIds as strings, e.g. ["abc123","def456"]. No prose, no keys, no markdown fences. Return [] if nothing matches.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn(`[${logTag}] OpenRouter HTTP ${res.status}`);
      return { postIds: [], error: true };
    }

    const json = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.warn(`[${logTag}] Cannot parse response:`, text.slice(0, 200));
      return { postIds: [], error: true };
    }

    const postIds: string[] = JSON.parse(match[0]);
    return { postIds, error: false };
  } catch (e) {
    console.warn(`[${logTag}] error:`, e);
    return { postIds: [], error: true };
  }
}

export const runAiFilter = action({
  args: {
    intents:    v.array(v.string()),
    subreddits: v.array(v.string()),
  },
  handler: async (ctx, { intents, subreddits }): Promise<{ postIds: string[]; error: boolean }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { postIds: [], error: true };

    const cleanIntents = intents.filter(Boolean);
    if (cleanIntents.length === 0) {
      console.warn("[runAiFilter] no intents provided");
      return { postIds: [], error: false };
    }

    const posts = await ctx.runQuery(
      internal.aiFilter.getRecentPostsForUser,
      { userId, subreddits }
    );
    console.log(`[runAiFilter] intents: ${JSON.stringify(cleanIntents)} | subreddits: ${JSON.stringify(subreddits)} | candidate posts: ${posts.length}`);
    if (posts.length === 0) return { postIds: [], error: false };

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn("[runAiFilter] OPENROUTER_API_KEY not set");
      return { postIds: [], error: true };
    }

    return await matchPostsToIntents(
      posts.map((p) => ({ postId: p.postId, title: p.title, body: p.body })),
      cleanIntents,
      apiKey,
      "runAiFilter",
    );
  },
});
