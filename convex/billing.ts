import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

// ── Public queries (called from web app via useQuery) ──────────

/**
 * Returns the authenticated user's current plan and Dodo customer ID.
 * Returns { plan: "free", dodoCustomerId: null } if no billing record exists.
 */
export const getUserPlan = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { plan: "free" as const, dodoCustomerId: null };

    const billing = await ctx.db
      .query("userBilling")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    return {
      plan: billing?.plan ?? ("free" as const),
      dodoCustomerId: billing?.dodoCustomerId ?? null,
    };
  },
});

/**
 * Returns the authenticated user's most recent subscription, or null.
 */
export const getSubscription = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

/**
 * Returns the authenticated user's last 50 payments, newest first.
 */
export const getBillingHistory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("payments")
      .withIndex("by_user_paid_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

// ── Internal queries ───────────────────────────────────────────

/**
 * Finds a userBilling record by Dodo customer ID.
 * Used by the webhook handler to resolve userId from a Dodo event.
 */
export const findUserByDodoCustomerId = internalQuery({
  args: { dodoCustomerId: v.string() },
  handler: async (ctx, { dodoCustomerId }) => {
    return await ctx.db
      .query("userBilling")
      .withIndex("by_dodo_customer", (q) =>
        q.eq("dodoCustomerId", dodoCustomerId)
      )
      .unique();
  },
});

/**
 * Finds a user by email address.
 * Fallback for webhook events where dodoCustomerId hasn't been stored yet
 * (i.e. the very first webhook after checkout).
 */
export const findUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .first();
  },
});

/**
 * Fetches a payment and verifies it belongs to the given user.
 * Used by the invoice redirect route.
 */
export const getPaymentForUser = internalQuery({
  args: {
    dodoPaymentId: v.string(),
    userId:        v.id("users"),
  },
  handler: async (ctx, { dodoPaymentId, userId }) => {
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_dodo_payment", (q) =>
        q.eq("dodoPaymentId", dodoPaymentId)
      )
      .unique();

    if (!payment || payment.userId !== userId) return null;
    return payment;
  },
});

// ── Internal mutations (called only from webhookDodo.ts) ───────

export const upsertSubscription = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_dodo_subscription", (q) =>
        q.eq("dodoSubscriptionId", args.dodoSubscriptionId)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status:             args.status,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd:   args.currentPeriodEnd,
        cancelAtPeriodEnd:  args.cancelAtPeriodEnd,
        updatedAt:          Date.now(),
      });
    } else {
      await ctx.db.insert("subscriptions", {
        ...args,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      });
    }
  },
});

export const recordPayment = internalMutation({
  args: {
    userId:            v.id("users"),
    dodoPaymentId:     v.string(),
    dodoSubscriptionId: v.optional(v.string()),
    amount:            v.number(),
    currency:          v.string(),
    status:            v.union(v.literal("succeeded"), v.literal("failed")),
    plan:              v.optional(v.union(v.literal("pro"), v.literal("ultra"))),
    interval:          v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    invoiceUrl:        v.optional(v.string()),
    paidAt:            v.number(),
  },
  handler: async (ctx, args) => {
    // Idempotent: skip if already recorded
    const existing = await ctx.db
      .query("payments")
      .withIndex("by_dodo_payment", (q) =>
        q.eq("dodoPaymentId", args.dodoPaymentId)
      )
      .unique();

    if (existing) return;
    await ctx.db.insert("payments", args);
  },
});

/**
 * Upserts the userBilling record for a user, updating whichever fields are provided.
 * Single atomic write — avoids race condition between plan and customerId updates.
 */
export const upsertUserBilling = internalMutation({
  args: {
    userId:         v.id("users"),
    plan:           v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("ultra"))),
    dodoCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, { userId, plan, dodoCustomerId }) => {
    const existing = await ctx.db
      .query("userBilling")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (plan           !== undefined) patch.plan           = plan;
    if (dodoCustomerId !== undefined) patch.dodoCustomerId = dodoCustomerId;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userBilling", {
        userId,
        plan:           plan           ?? "free",
        dodoCustomerId: dodoCustomerId,
        updatedAt:      Date.now(),
      });
    }
  },
});

