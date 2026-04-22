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
`You are a precision-first semantic classifier for Reddit post titles. You will be evaluated only on the precision of your output. RECALL IS IRRELEVANT. An empty array is better than one incorrect match.

═════════════════════════════════════════════════════════════════
USER INTENTS (a title matches only if it FULLY satisfies at least one intent):
${intentsList}

═════════════════════════════════════════════════════════════════
STEP 1 — INTERPRET EACH INTENT (do this silently, then use it as the matching standard)
For each intent, derive three things:
  • SUBJECT      — the precise thing being talked about (not the field, not the community).
  • AUTHOR ROLE  — who is writing: are they SHARING their own experience/result, ASKING others, OFFERING something, or STRUGGLING/COMPLAINING?
  • STANCE       — the angle or sentiment required (positive outcome, problem, opinion against X, etc.).
A title matches an intent only if all three align.

═════════════════════════════════════════════════════════════════
STEP 2 — FOUR-GATE CHECK PER TITLE
For each title, walk the four gates. Any FAIL, UNSURE, or "maybe" → EXCLUDE.

GATE A — SUBJECT MATCH
   The title's primary subject IS the intent's subject. Not "in the same industry", not "mentions the word once", not "adjacent topic". If the title is about a *different* specific thing that happens to live in the same community, EXCLUDE.

GATE B — AUTHOR-ROLE MATCH (speech-act)
   intent SHARING  → title must itself share (first-person recount, retrospective, "here's what I did / what worked / what happened").
                     ❌ questions, polls, "how do you…?", "what's the best way to…?" — those are ASKING, the inverse shape.
   intent ASKING   → title must itself ask. Announcements and product launches fail.
   intent OFFERING → title must offer/announce. Questions and retrospectives fail.
   intent STRUGGLING → title must describe the author's current problem. Tutorials, solutions, or success stories fail.

GATE C — STANCE MATCH
   Positive outcomes don't match negative-outcome intents and vice-versa. "What worked" ≠ "what didn't work". "People who love X" ≠ "people who hate X".

GATE D — EVIDENCE IN TITLE
   You must be able to underline concrete words in the TITLE itself that prove the match. You are NOT allowed to assume context, guess what the body contains, or give benefit of the doubt.

═════════════════════════════════════════════════════════════════
HARD EXCLUSIONS — never include regardless of topic
• Affiliate, referral, "join our network / get our $$$" promo posts.
• Cofounder / hiring / "looking for teammate" posts (unless the intent is literally that).
• Generic advice columns, listicles, or frameworks that aren't a first-person account.
• Feedback requests ("thoughts?", "is this useful?", "roast my idea").
• Pure rants, memes, jokes, philosophical musings, shower thoughts.
• Posts where the intent keyword appears only in passing while the real subject is something else.
• Titles so vague you'd have to read the body to decide (that means the title alone doesn't prove it — EXCLUDE).

═════════════════════════════════════════════════════════════════
CALIBRATION — study these before deciding
Intent: "dev talking about what worked for them to get users"
  (SUBJECT=user acquisition tactic; ROLE=SHARING; STANCE=positive/what worked)
  ✅ "Solo dev, 6 months in, here's what actually worked for finding users"
  ✅ "0$ marketing, 8.9% conv rate, 3100 users after 2 months"
  ❌ "What's the cheapest way you got users for your SaaS?"        — ROLE reversed (asking).
  ❌ "The hardest thing about microsaas isn't building, it's traction" — ROLE: commentary, not sharing.
  ❌ "Why so many SaaS founders are throwing away their traffic"      — ROLE: opinion rant.
  ❌ "Built a tool that gets keywords google search volume"           — SUBJECT mismatch (product launch).
  ❌ "Validating micro-SaaS: ADHD reminder app — thoughts?"           — Feedback request.
  ❌ "Launch your SaaS into our affiliate network of 250k+ creators"  — Promo/affiliate.
  ❌ "I got traffic. Zero signups. That was my wake up call"          — STANCE mismatch (what DIDN'T work).
  ❌ "18YO Founder Looking for Technical Cofounder"                   — Cofounder ask.

═════════════════════════════════════════════════════════════════
INPUT — one per line, TAB-separated "<postId>\\t<title>":
${titleLines}

═════════════════════════════════════════════════════════════════
OUTPUT — return ONLY a JSON array of matching postIds as strings, e.g. ["abc123","def456"]. No prose, no keys, no markdown fences, no trailing text. Return [] if nothing passes all four gates. When unsure, return []. Precision over recall, always.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
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
