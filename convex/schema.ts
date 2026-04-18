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

});
