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
    .index("by_user",      ["userId"])
    .index("by_user_post", ["userId", "postId"]),

  userSettings: defineTable({
    userId:       v.id("users"),
    keywords:     v.array(v.string()),
    excluded:     v.array(v.string()),
    subreddits:   v.array(v.string()),
    minUpvotes:   v.number(),
    minComments:  v.number(),
    lastFetchAt:  v.number(),
    fetchLoopId:  v.optional(v.id("_scheduled_functions")),
  }).index("by_user", ["userId"]),

  // ── Billing ──────────────────────────────────────────────────

  userBilling: defineTable({
    userId:         v.id("users"),
    plan:           v.union(v.literal("free"), v.literal("pro"), v.literal("ultra")),
    dodoCustomerId: v.optional(v.string()),
    updatedAt:      v.number(),
  })
    .index("by_user",          ["userId"])
    .index("by_dodo_customer", ["dodoCustomerId"]),

  subscriptions: defineTable({
    userId:             v.id("users"),
    dodoSubscriptionId: v.string(),
    dodoProductId:      v.string(),
    plan:               v.union(v.literal("pro"), v.literal("ultra")),
    interval:           v.union(v.literal("monthly"), v.literal("yearly")),
    status:             v.union(
      v.literal("active"),
      v.literal("on_hold"),
      v.literal("cancelled"),
      v.literal("expired"),
      v.literal("failed"),
    ),
    currentPeriodStart: v.number(),
    currentPeriodEnd:   v.number(),
    cancelAtPeriodEnd:  v.boolean(),
    updatedAt:          v.number(),
    createdAt:          v.number(),
  })
    .index("by_user",              ["userId"])
    .index("by_dodo_subscription", ["dodoSubscriptionId"]),

  payments: defineTable({
    userId:             v.id("users"),
    dodoPaymentId:      v.string(),
    dodoSubscriptionId: v.optional(v.string()),
    amount:             v.number(),
    currency:           v.string(),
    status:             v.union(v.literal("succeeded"), v.literal("failed")),
    plan:               v.optional(v.union(v.literal("pro"), v.literal("ultra"))),
    interval:           v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    invoiceUrl:         v.optional(v.string()),
    paidAt:             v.number(),
  })
    .index("by_user",         ["userId"])
    .index("by_user_paid_at", ["userId", "paidAt"])
    .index("by_dodo_payment", ["dodoPaymentId"]),

  agentTokens: defineTable({
    userId:           v.id("users"),
    token:            v.string(),
    telegramChatId:   v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
  })
    .index("by_user",   ["userId"])
    .index("by_token",  ["token"])
    .index("by_chat",   ["telegramChatId"]),

  alertedPosts: defineTable({
    userId:    v.id("users"),
    postId:    v.string(),
    alertedAt: v.number(),
  }).index("by_user_post", ["userId", "postId"]),

  karmaCache: defineTable({
    author:    v.string(),
    karma:     v.number(),
    fetchedAt: v.number(),
  }).index("by_author", ["author"]),

});
