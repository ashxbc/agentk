import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  redditResults: defineTable({
    userId:      v.id("users"),
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
    fetchedAt:   v.number(),
    // Keywords from the user's active group that matched this post's title/body
    // at insert time. Denormalized for auditability.
    matchedKeywords: v.optional(v.array(v.string())),
  })
    .index("by_user",         ["userId"])
    .index("by_user_post",    ["userId", "postId"])
    .index("by_user_created", ["userId", "createdUtc"])
    .index("by_user_fetched", ["userId", "fetchedAt"]),

  // Isolated storage for AI-mode candidate posts. Separate from redditResults
  // so normal-flow (keyword-matched) posts never leak into the AI feed.
  redditResultsAi: defineTable({
    userId:      v.id("users"),
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
    fetchedAt:   v.number(),
    // Normalized intent queries from aiModeSettings.intents that the
    // classifier tagged this post with. Union-merged across cycles if the
    // same post gets re-matched by another intent.
    matchedIntents: v.optional(v.array(v.string())),
  })
    .index("by_user",         ["userId"])
    .index("by_user_post",    ["userId", "postId"])
    .index("by_user_created", ["userId", "createdUtc"]),

  userSettings: defineTable({
    userId:        v.id("users"),
    keywords:      v.array(v.string()),
    excluded:      v.array(v.string()),
    subreddits:    v.array(v.string()),
    minUpvotes:    v.number(),
    minComments:   v.number(),
    lastFetchAt:   v.number(),
    keywordGroups:  v.optional(v.array(v.object({ name: v.string(), keywords: v.array(v.string()) }))),
    activeGroupIdx: v.optional(v.number()),
    minKarma:       v.optional(v.number()),
    alertsPerHour:  v.optional(v.number()),
    tourCompleted:  v.optional(v.boolean()),
    firstSetupAt:   v.optional(v.number()),
  }).index("by_user", ["userId"]),

  agentTokens: defineTable({
    userId:            v.id("users"),
    token:             v.string(),
    telegramChatId:    v.optional(v.string()),
    telegramUsername:  v.optional(v.string()),
    discordUserId:     v.optional(v.string()),
    discordChannelId:  v.optional(v.string()),
    discordUsername:   v.optional(v.string()),
    paused:            v.optional(v.boolean()),
  })
    .index("by_user",    ["userId"])
    .index("by_token",   ["token"])
    .index("by_chat",    ["telegramChatId"])
    .index("by_discord", ["discordUserId"]),

  userDevices: defineTable({
    userId:       v.id("users"),
    ip:           v.string(),
    userAgent:    v.string(),
    registeredAt: v.number(),
    lastSeenAt:   v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_ip",   ["ip"]),

  alertedPosts: defineTable({
    userId:    v.id("users"),
    postId:    v.string(),
    platform:  v.optional(v.string()),
    alertedAt: v.number(),
  })
    .index("by_user_post",            ["userId", "postId"])
    .index("by_user_post_platform",   ["userId", "postId", "platform"])
    .index("by_user_platform_alerted",["userId", "platform", "alertedAt"]),

  karmaCache: defineTable({
    author:    v.string(),
    karma:     v.number(),
    fetchedAt: v.number(),
  }).index("by_author", ["author"]),

  // User-owned lists. A user starts with an auto-created "Inbox" list.
  leadLists: defineTable({
    userId:    v.id("users"),
    name:      v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  // One lead per (list, post). Metadata snapshotted at add time so rows stay
  // stable even after the source post ages out of redditResults(Ai).
  leads: defineTable({
    userId:      v.id("users"),
    listId:      v.id("leadLists"),
    postId:      v.string(),
    source:      v.string(), // "normal" | "ai"
    title:       v.string(),
    url:         v.string(),
    subreddit:   v.string(),
    author:      v.string(),
    ups:         v.number(),
    numComments: v.number(),
    createdUtc:  v.number(),
    query:       v.string(), // matched keywords OR intents, joined with ", "
    addedAt:     v.number(),
  })
    .index("by_user",      ["userId"])
    .index("by_list",      ["listId"])
    .index("by_list_post", ["listId", "postId"])
    .index("by_user_post", ["userId", "postId"]),

  userVerification: defineTable({
    userId:      v.id("users"),
    verified:    v.boolean(),
    verifiedAt:  v.optional(v.number()),
  }).index("by_user", ["userId"]),

  emailVerificationTokens: defineTable({
    userId:    v.id("users"),
    token:     v.string(),
    expiresAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_user",  ["userId"]),

  aiModeSettings: defineTable({
    userId:         v.id("users"),
    intents:        v.array(v.string()),
    subreddits:     v.array(v.string()),
    // Each entry pairs a matched postId with the specific intent (normalized)
    // that matched it. The client filters by the current intent set, so
    // removing an intent from the toolbar instantly hides its posts.
    matchedPosts:   v.optional(v.array(v.object({ postId: v.string(), intent: v.string() }))),
    // Legacy: kept optional for backward-compat with old rows. Not written anymore.
    matchedPostIds: v.optional(v.array(v.string())),
    // Maps normalized intent → lead list ID for autopilot saving.
    intentListMap:  v.optional(v.array(v.object({ intent: v.string(), listId: v.string() }))),
  }).index("by_user", ["userId"]),

});
