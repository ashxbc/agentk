# Dodo Payments Pricing Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Dodo Payments subscriptions end-to-end — schema, Convex billing module, checkout route, webhook handler, plan enforcement on X features, billing history page, and plan badge.

**Architecture:** Next.js API routes handle Dodo SDK calls (checkout, invoice redirect). A Convex HTTP action (`convex/webhookDodo.ts`) handles Dodo webhooks directly, verifying signatures and writing state via internal mutations in `convex/billing.ts`. Plan status is read from a `userBilling` table by all enforcement checks.

**Tech Stack:** TypeScript, Convex (HTTP actions + queries/mutations), Next.js 15 App Router, `dodopayments` npm package, `standardwebhooks` npm package, `@convex-dev/auth/nextjs`, Tailwind CSS.

---

## File Map

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `userBilling`, `subscriptions`, `payments` tables |
| `convex/billing.ts` | New — all Convex billing queries and internal mutations |
| `convex/webhookDodo.ts` | New — Dodo webhook HTTP action (`"use node"`) |
| `convex/http.ts` | Register `/webhooks/dodo` route; add plan enforcement to X paths |
| `app/api/billing/checkout/route.ts` | New — checkout session creation via Dodo SDK |
| `app/api/billing/invoice/[paymentId]/route.ts` | New — invoice PDF redirect |
| `components/PlanBadge.tsx` | New — plan tier badge component |
| `components/Pricing.tsx` | Wire CTA buttons to checkout; gate with auth |
| `components/Navbar.tsx` | Add `<PlanBadge />` next to avatar |
| `app/billing/page.tsx` | New — billing history page |

---

## Task 1: Install dependencies and set up environment

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.local` (local only, not committed)

- [ ] **Step 1: Install Dodo Payments and Standard Webhooks packages**

```bash
npm install dodopayments standardwebhooks
```

Expected: both appear in `package.json` dependencies.

- [ ] **Step 2: Create Dodo test products (manual)**

Log into the Dodo Payments test dashboard and create four recurring subscription products:
- **Pro Monthly** — $19.00 / month
- **Pro Yearly** — $168.00 / year
- **Ultra Monthly** — $49.00 / month
- **Ultra Yearly** — $444.00 / year

Copy each product ID.

- [ ] **Step 3: Add env vars to `.env.local`**

```bash
# .env.local  (already gitignored, do not commit)
DODO_API_KEY=sk_test_...
DODO_WEBHOOK_SECRET=whsec_...
DODO_PRO_MONTHLY_ID=prod_...
DODO_PRO_YEARLY_ID=prod_...
DODO_ULTRA_MONTHLY_ID=prod_...
DODO_ULTRA_YEARLY_ID=prod_...
```

Also add the same keys to your Convex deployment environment (Convex dashboard → Settings → Environment Variables), since `convex/webhookDodo.ts` reads them at runtime:

```
DODO_WEBHOOK_SECRET
DODO_PRO_MONTHLY_ID
DODO_PRO_YEARLY_ID
DODO_ULTRA_MONTHLY_ID
DODO_ULTRA_YEARLY_ID
```

- [ ] **Step 4: Commit package changes**

```bash
git add package.json package-lock.json
git commit -m "chore: add dodopayments and standardwebhooks dependencies"
```

---

## Task 2: Schema additions

**Files:**
- Modify: `convex/schema.ts`

No automated tests exist for Convex schema changes. Verification is done by running `npx convex dev` and confirming no type errors.

- [ ] **Step 1: Read the current schema to understand its structure**

Read `convex/schema.ts` before editing. The file currently defines `redditResults`, `twitterResults`, `extensionSessions`, and `brandContexts` tables, plus `...authTables`.

- [ ] **Step 2: Add the three new tables**

Replace the full contents of `convex/schema.ts` with:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  redditResults: defineTable({
    deviceId:    v.string(),
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
    .index("by_device",      ["deviceId"])
    .index("by_device_post", ["deviceId", "postId"]),

  twitterResults: defineTable({
    deviceId:       v.string(),
    tweetId:        v.string(),
    url:            v.string(),
    text:           v.string(),
    name:           v.string(),
    handle:         v.string(),
    profilePicture: v.optional(v.string()),
    verified:       v.boolean(),
    followers:      v.number(),
    likes:          v.number(),
    reposts:        v.number(),
    replies:        v.number(),
    views:          v.number(),
    score:          v.number(),
    createdAt:      v.string(),
    fetchedAt:      v.number(),
  })
    .index("by_device",       ["deviceId"])
    .index("by_device_tweet", ["deviceId", "tweetId"]),

  extensionSessions: defineTable({
    token:     v.string(),
    userId:    v.id("users"),
    createdAt: v.number(),
  }).index("by_token", ["token"])
    .index("by_user",  ["userId"]),

  brandContexts: defineTable({
    deviceId:   v.string(),
    url:        v.string(),
    what:       v.string(),
    who:        v.string(),
    icp:        v.string(),
    painPoints: v.string(),
    features:   v.string(),
    pricing:    v.string(),
    replyHint:  v.string(),
    createdAt:  v.number(),
  }).index("by_device_url", ["deviceId", "url"]),

  // ── Billing ──────────────────────────────────────────────────

  userBilling: defineTable({
    userId:         v.id("users"),
    plan:           v.union(v.literal("free"), v.literal("pro"), v.literal("ultra")),
    dodoCustomerId: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  subscriptions: defineTable({
    userId:             v.id("users"),
    dodoSubscriptionId: v.string(),
    dodoProductId:      v.string(),
    plan:               v.union(v.literal("pro"), v.literal("ultra")),
    interval:           v.union(v.literal("monthly"), v.literal("yearly")),
    status:             v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd:   v.number(),
    cancelAtPeriodEnd:  v.boolean(),
    updatedAt:          v.number(),
  })
    .index("by_user",              ["userId"])
    .index("by_dodo_subscription", ["dodoSubscriptionId"]),

  payments: defineTable({
    userId:         v.id("users"),
    dodoPaymentId:  v.string(),
    subscriptionId: v.optional(v.string()),
    amount:         v.number(),
    currency:       v.string(),
    status:         v.string(),
    plan:           v.optional(v.union(v.literal("pro"), v.literal("ultra"))),
    interval:       v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    invoiceUrl:     v.optional(v.string()),
    paidAt:         v.number(),
  })
    .index("by_user",         ["userId"])
    .index("by_user_paid_at", ["userId", "paidAt"])
    .index("by_dodo_payment", ["dodoPaymentId"]),
});
```

- [ ] **Step 3: Deploy schema to verify no errors**

```bash
npx convex dev
```

Expected: Convex CLI reports no type errors and pushes the schema. Check the Convex dashboard to confirm the three new tables (`userBilling`, `subscriptions`, `payments`) appear.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add userBilling, subscriptions, payments tables to schema"
```

---

## Task 3: Convex billing module

**Files:**
- Create: `convex/billing.ts`

- [ ] **Step 1: Create `convex/billing.ts`**

```typescript
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

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
 * Returns the authenticated user's active subscription, or null.
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

// ── Internal query (called from Convex HTTP actions) ───────────

/**
 * Looks up plan for a device ID via extensionSessions.
 * Used by http.ts to enforce X feature access.
 */
export const getUserPlanForDevice = internalQuery({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }) => {
    // extensionSessions links deviceId (stored as token) to userId
    const session = await ctx.db
      .query("extensionSessions")
      .withIndex("by_token", (q) => q.eq("token", deviceId))
      .unique();

    if (!session) return "free";

    const billing = await ctx.db
      .query("userBilling")
      .withIndex("by_user", (q) => q.eq("userId", session.userId))
      .unique();

    return billing?.plan ?? "free";
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
    status:             v.string(),
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
      });
    }
  },
});

export const recordPayment = internalMutation({
  args: {
    userId:         v.id("users"),
    dodoPaymentId:  v.string(),
    subscriptionId: v.optional(v.string()),
    amount:         v.number(),
    currency:       v.string(),
    status:         v.string(),
    plan:           v.optional(v.union(v.literal("pro"), v.literal("ultra"))),
    interval:       v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    invoiceUrl:     v.optional(v.string()),
    paidAt:         v.number(),
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

export const setUserPlan = internalMutation({
  args: {
    userId: v.id("users"),
    plan:   v.union(v.literal("free"), v.literal("pro"), v.literal("ultra")),
  },
  handler: async (ctx, { userId, plan }) => {
    const existing = await ctx.db
      .query("userBilling")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { plan });
    } else {
      await ctx.db.insert("userBilling", { userId, plan });
    }
  },
});

export const setDodoCustomerId = internalMutation({
  args: {
    userId:         v.id("users"),
    dodoCustomerId: v.string(),
  },
  handler: async (ctx, { userId, dodoCustomerId }) => {
    const existing = await ctx.db
      .query("userBilling")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { dodoCustomerId });
    } else {
      await ctx.db.insert("userBilling", {
        userId,
        plan: "free",
        dodoCustomerId,
      });
    }
  },
});

// ── Internal query for invoice auth check ─────────────────────

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
```

- [ ] **Step 2: Deploy and verify**

```bash
npx convex dev
```

Expected: no TypeScript errors, functions appear in Convex dashboard under `billing`.

- [ ] **Step 3: Commit**

```bash
git add convex/billing.ts
git commit -m "feat: add Convex billing module — queries and internal mutations"
```

---

## Task 4: Dodo webhook handler (Convex HTTP action)

**Files:**
- Create: `convex/webhookDodo.ts`
- Modify: `convex/http.ts` — register the route

The webhook runs as a Convex HTTP action with Node.js runtime (`"use node"`) so it can use the `standardwebhooks` package for signature verification.

- [ ] **Step 1: Create `convex/webhookDodo.ts`**

```typescript
"use node";

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "standardwebhooks";
import { Id } from "./_generated/dataModel";

// Maps a Dodo product ID to our plan/interval labels.
function productIdToPlanInterval(productId: string): {
  plan: "pro" | "ultra";
  interval: "monthly" | "yearly";
} | null {
  const map: Record<string, { plan: "pro" | "ultra"; interval: "monthly" | "yearly" }> = {
    [process.env.DODO_PRO_MONTHLY_ID   ?? ""]: { plan: "pro",   interval: "monthly" },
    [process.env.DODO_PRO_YEARLY_ID    ?? ""]: { plan: "pro",   interval: "yearly"  },
    [process.env.DODO_ULTRA_MONTHLY_ID ?? ""]: { plan: "ultra", interval: "monthly" },
    [process.env.DODO_ULTRA_YEARLY_ID  ?? ""]: { plan: "ultra", interval: "yearly"  },
  };
  return map[productId] ?? null;
}

export const dodoWebhookHandler = httpAction(async (ctx, request) => {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] DODO_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  // Read raw body for signature verification (must happen before JSON.parse)
  const body = await request.text();

  const wh = new Webhook(secret);
  try {
    wh.verify(body, {
      "webhook-id":        request.headers.get("webhook-id")        ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
    });
  } catch (err) {
    console.error("[webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  // Signature verified — always return 200 from here, log processing errors
  try {
    const event = JSON.parse(body);
    await processEvent(ctx, event);
  } catch (err) {
    console.error("[webhook] Processing error:", err);
  }

  return new Response("OK", { status: 200 });
});

async function processEvent(ctx: any, event: any) {
  const { type, data } = event;
  console.log(`[webhook] event: ${type}`);

  // ── Subscription events ──
  if (type.startsWith("subscription.")) {
    const sub = data;
    // Dodo webhook payload shape (verify against Dodo docs if field names differ):
    // sub.subscription_id, sub.customer.customer_id, sub.product_id,
    // sub.status, sub.current_period_start, sub.current_period_end,
    // sub.cancel_at_period_end
    const dodoSubscriptionId = sub.subscription_id as string;
    const dodoCustomerId     = sub.customer?.customer_id as string | undefined;
    const dodoProductId      = sub.product_id as string;
    const status             = sub.status as string;
    const cancelAtPeriodEnd  = sub.cancel_at_period_end as boolean ?? false;
    // Dodo timestamps may be ISO strings or Unix seconds — normalise to ms
    const toMs = (v: any) =>
      typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : new Date(v).getTime();
    const currentPeriodStart = toMs(sub.current_period_start ?? Date.now());
    const currentPeriodEnd   = toMs(sub.current_period_end   ?? Date.now());

    const planInterval = productIdToPlanInterval(dodoProductId);
    if (!planInterval) {
      console.warn(`[webhook] Unknown product ID: ${dodoProductId} — skipping`);
      return;
    }

    // Resolve userId from dodoCustomerId
    const userId = await resolveUserId(ctx, dodoCustomerId);
    if (!userId) {
      console.warn(`[webhook] No user found for customerId: ${dodoCustomerId}`);
      return;
    }

    // Persist customerId if we have it
    if (dodoCustomerId) {
      await ctx.runMutation(internal.billing.setDodoCustomerId, {
        userId,
        dodoCustomerId,
      });
    }

    await ctx.runMutation(internal.billing.upsertSubscription, {
      userId,
      dodoSubscriptionId,
      dodoProductId,
      plan:               planInterval.plan,
      interval:           planInterval.interval,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    });

    // Update user plan based on event type
    if (type === "subscription.active" || type === "subscription.plan_changed") {
      await ctx.runMutation(internal.billing.setUserPlan, {
        userId,
        plan: planInterval.plan,
      });
    } else if (type === "subscription.expired" || type === "subscription.failed") {
      await ctx.runMutation(internal.billing.setUserPlan, { userId, plan: "free" });
    } else if (type === "subscription.renewed") {
      // Record payment for renewal
      const payment = data.payment;
      if (payment?.payment_id) {
        await ctx.runMutation(internal.billing.recordPayment, {
          userId,
          dodoPaymentId:  payment.payment_id as string,
          subscriptionId: dodoSubscriptionId,
          amount:         Math.round((payment.amount ?? 0) * 100), // dollars → cents
          currency:       payment.currency ?? "USD",
          status:         "succeeded",
          plan:           planInterval.plan,
          interval:       planInterval.interval,
          invoiceUrl:     payment.invoice_url ?? undefined,
          paidAt:         Date.now(),
        });
      }
    }
  }

  // ── Payment events ──
  if (type === "payment.succeeded" || type === "payment.failed") {
    const payment = data;
    const dodoCustomerId = payment.customer?.customer_id as string | undefined;
    const userId = await resolveUserId(ctx, dodoCustomerId);
    if (!userId) return;

    // Derive plan/interval from product_id if available
    const productId    = payment.product_id as string | undefined;
    const planInterval = productId ? productIdToPlanInterval(productId) : null;

    await ctx.runMutation(internal.billing.recordPayment, {
      userId,
      dodoPaymentId:  payment.payment_id as string,
      subscriptionId: payment.subscription_id ?? undefined,
      amount:         Math.round((payment.amount ?? 0) * 100),
      currency:       payment.currency ?? "USD",
      status:         type === "payment.succeeded" ? "succeeded" : "failed",
      plan:           planInterval?.plan,
      interval:       planInterval?.interval,
      invoiceUrl:     payment.invoice_url ?? undefined,
      paidAt:         Date.now(),
    });
  }
}

/**
 * Finds the Convex userId for a Dodo customer ID.
 * Looks up userBilling by dodoCustomerId. Falls back to null.
 */
async function resolveUserId(ctx: any, dodoCustomerId: string | undefined): Promise<Id<"users"> | null> {
  if (!dodoCustomerId) return null;
  const billing = await ctx.runQuery(internal.billing.findUserByDodoCustomerId, {
    dodoCustomerId,
  });
  return billing?.userId ?? null;
}
```

- [ ] **Step 2: Add `findUserByDodoCustomerId` internal query to `convex/billing.ts`**

Append to the end of `convex/billing.ts`:

```typescript
export const findUserByDodoCustomerId = internalQuery({
  args: { dodoCustomerId: v.string() },
  handler: async (ctx, { dodoCustomerId }) => {
    return await ctx.db
      .query("userBilling")
      .filter((q) => q.eq(q.field("dodoCustomerId"), dodoCustomerId))
      .first();
  },
});
```

> Note: This uses `.filter()` rather than an index because `dodoCustomerId` is optional and rarely queried. For production scale, add a sparse index.

- [ ] **Step 3: Register the webhook route in `convex/http.ts`**

Add the import and route registration at the top of `convex/http.ts`, right after the existing imports:

```typescript
import { dodoWebhookHandler } from "./webhookDodo";
```

Then register the route after the last `http.route(...)` call and before `export default http`:

```typescript
http.route({
  path: "/webhooks/dodo",
  method: "POST",
  handler: dodoWebhookHandler,
});

http.route({
  path: "/webhooks/dodo",
  method: "OPTIONS",
  handler: httpAction(async () =>
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, webhook-id, webhook-timestamp, webhook-signature",
      },
    })
  ),
});
```

- [ ] **Step 4: Deploy and confirm the webhook route exists**

```bash
npx convex dev
```

Your Convex deployment URL is in `.env.local` as `NEXT_PUBLIC_CONVEX_URL`. The webhook path will be at `https://<your-deployment>.convex.site/webhooks/dodo`. Confirm in the Convex dashboard → Functions that `webhookDodo.ts` appears.

Set this URL as the webhook endpoint in the Dodo test dashboard.

- [ ] **Step 5: Commit**

```bash
git add convex/webhookDodo.ts convex/billing.ts convex/http.ts
git commit -m "feat: Dodo webhook handler as Convex HTTP action"
```

---

## Task 5: Checkout API route

**Files:**
- Create: `app/api/billing/checkout/route.ts`

The checkout route creates a Dodo subscription checkout session. The user must be authenticated (Convex auth). The plan name maps to a Dodo product ID server-side so product IDs never reach the client.

- [ ] **Step 1: Create `app/api/billing/checkout/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import DodoPayments from "dodopayments";

type PlanKey = "pro_monthly" | "pro_yearly" | "ultra_monthly" | "ultra_yearly";

function getPlanProductId(plan: PlanKey): string | undefined {
  const map: Record<PlanKey, string | undefined> = {
    pro_monthly:   process.env.DODO_PRO_MONTHLY_ID,
    pro_yearly:    process.env.DODO_PRO_YEARLY_ID,
    ultra_monthly: process.env.DODO_ULTRA_MONTHLY_ID,
    ultra_yearly:  process.env.DODO_ULTRA_YEARLY_ID,
  };
  return map[plan];
}

export async function POST(req: NextRequest) {
  // Auth: get Convex token from the request context
  const token = await convexAuthNextjsToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load authenticated user
  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse and validate body
  const body = await req.json().catch(() => null);
  const { plan, successUrl, cancelUrl } = body ?? {};

  if (!plan || !successUrl || !cancelUrl) {
    return NextResponse.json(
      { error: "plan, successUrl, and cancelUrl are required" },
      { status: 400 }
    );
  }

  const productId = getPlanProductId(plan as PlanKey);
  if (!productId) {
    return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
  }

  const apiKey = process.env.DODO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DODO_API_KEY not configured" }, { status: 500 });
  }

  try {
    const dodo = new DodoPayments({
      bearerToken: apiKey,
      environment: apiKey.startsWith("sk_test") ? "test_mode" : "live_mode",
    });

    // Create a subscription checkout session.
    // Verify exact method name and params against dodopayments SDK types.
    const session = await (dodo as any).subscriptions.create({
      billing: {
        city:    "",
        country: "US",
        state:   "",
        street:  "",
        zipcode: "",
      },
      customer: {
        create: true,
        email:  user.email ?? "",
        name:   user.name  ?? user.email ?? "",
      },
      product_id:   productId,
      quantity:     1,
      payment_link: true,
      return_url:   successUrl,
    });

    // The checkout URL is returned as payment_link in Dodo's response.
    // Adjust field name if Dodo SDK returns it differently.
    const checkoutUrl: string = session.payment_link ?? session.url ?? session.checkout_url;

    if (!checkoutUrl) {
      console.error("[checkout] Dodo response missing checkout URL:", session);
      return NextResponse.json({ error: "Failed to get checkout URL" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (err: any) {
    console.error("[checkout] Dodo error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
```

> **Important:** The exact Dodo SDK method (`subscriptions.create` vs `payments.create`) and response field name (`payment_link` vs `url`) must be verified against the `dodopayments` SDK's TypeScript types once installed. The `(dodo as any)` cast is a placeholder — replace with the typed call once confirmed.

- [ ] **Step 2: Verify the route compiles**

```bash
npx tsc --noEmit
```

Fix any type errors. The `(dodo as any)` cast suppresses SDK types until you've verified the correct method.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/checkout/route.ts
git commit -m "feat: Dodo checkout API route"
```

---

## Task 6: Invoice redirect route

**Files:**
- Create: `app/api/billing/invoice/[paymentId]/route.ts`

- [ ] **Step 1: Create `app/api/billing/invoice/[paymentId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { internal } from "@/convex/_generated/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;

  const token = await convexAuthNextjsToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the payment record, verifying ownership
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const payment = await client.query(api.billing.getBillingHistory, {}).then(
    (payments) => payments.find((p) => p.dodoPaymentId === paymentId && p.userId === user._id)
  );

  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!payment.invoiceUrl) {
    return NextResponse.json({ error: "No invoice available" }, { status: 404 });
  }

  return NextResponse.redirect(payment.invoiceUrl);
}
```

- [ ] **Step 2: Verify the route compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "app/api/billing/invoice/[paymentId]/route.ts"
git commit -m "feat: invoice PDF redirect route"
```

---

## Task 7: Plan enforcement in `convex/http.ts`

**Files:**
- Modify: `convex/http.ts` — add plan check to `fetchXResults` and the X branch of `generateReply`

Free users get a `403` with `{ error: "upgrade_required" }` when accessing X features. The check is done by looking up the `deviceId` via `extensionSessions` → `userBilling`.

- [ ] **Step 1: Add the import for the billing internal API**

`convex/internal` is already imported as `internal` in `http.ts`. No new import needed — `internal.billing.getUserPlanForDevice` will be available after Task 3.

- [ ] **Step 2: Add plan enforcement to `fetchXResults`**

In `convex/http.ts`, find the `fetchXResults` handler. Add this block right after the `deviceId` / `keywords` validation check and before the `TWITTER_API_KEY` check:

```typescript
// ── Plan enforcement: X features require paid plan ──
const xPlan = await ctx.runQuery(internal.billing.getUserPlanForDevice, { deviceId });
if (xPlan === "free") {
  return new Response(JSON.stringify({ error: "upgrade_required" }), {
    status: 403,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
```

The full handler beginning will look like:

```typescript
handler: httpAction(async (ctx, request) => {
  const body = await request.json();
  const { deviceId, keywords, excluded, verifiedOnly, ratioFilter } = body;

  if (!deviceId || !Array.isArray(keywords) || keywords.length === 0) {
    return new Response(JSON.stringify({ error: "invalid payload" }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // ── Plan enforcement: X features require paid plan ──
  const xPlan = await ctx.runQuery(internal.billing.getUserPlanForDevice, { deviceId });
  if (xPlan === "free") {
    return new Response(JSON.stringify({ error: "upgrade_required" }), {
      status: 403,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const apiKey = process.env.TWITTER_API_KEY;
  // ... rest of handler unchanged
```

- [ ] **Step 3: Add plan enforcement to the X branch of `generateReply`**

In the same file, find the `generateReply` handler. The platform is parsed from the JSON body. Add the enforcement after the `tweetText` validation and the `apiKey` check, but only for the X platform.

Find the block that begins after parsing body (`tweetText`, `deviceId`, `brandUrl`, `platform`, `subreddit`) and before the `platformLabel` computation. Add:

```typescript
// ── Plan enforcement: X generateReply requires paid plan ──
if (platform === "x" || platform === "twitter" || !platform) {
  const replyPlan = await ctx.runQuery(internal.billing.getUserPlanForDevice, {
    deviceId: deviceId ?? "",
  });
  if (replyPlan === "free") {
    return new Response(JSON.stringify({ error: "upgrade_required" }), {
      status: 403,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
```

- [ ] **Step 4: Deploy and test enforcement**

```bash
npx convex dev
```

With a free account (no userBilling record), trigger a `fetchXResults` call from the extension. Convex logs should show the query completing and the 403 returning. With a paid account the call should proceed.

- [ ] **Step 5: Commit**

```bash
git add convex/http.ts
git commit -m "feat: enforce paid plan on X fetchXResults and generateReply"
```

---

## Task 8: PlanBadge component + wire Pricing CTAs

**Files:**
- Create: `components/PlanBadge.tsx`
- Modify: `components/Navbar.tsx`
- Modify: `components/Pricing.tsx`

- [ ] **Step 1: Create `components/PlanBadge.tsx`**

```typescript
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useConvexAuth } from "convex/react";

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  free:  { bg: "#E5E1DB", text: "#62584F", label: "Free"  },
  pro:   { bg: "#DBEAFE", text: "#1D4ED8", label: "Pro"   },
  ultra: { bg: "#EDE9FE", text: "#6D28D9", label: "Ultra" },
};

export default function PlanBadge() {
  const { isAuthenticated } = useConvexAuth();
  const billing = useQuery(api.billing.getUserPlan, isAuthenticated ? {} : "skip");

  if (!isAuthenticated || !billing) return null;

  const style = BADGE_STYLES[billing.plan] ?? BADGE_STYLES.free;

  return (
    <span
      className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
```

- [ ] **Step 2: Add `<PlanBadge />` to `components/Navbar.tsx`**

In `Navbar.tsx`, add the import at the top:

```typescript
import PlanBadge from "@/components/PlanBadge";
```

Inside the `isAuthenticated` branch (next to the avatar div), add `<PlanBadge />`:

```tsx
{isAuthenticated ? (
  <div className="flex items-center gap-2">
    <PlanBadge />
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-default select-none"
      style={{ backgroundColor: "#DF849D" }}
      title={email}
    >
      {initial || "?"}
    </div>
  </div>
) : (
  <button
    onClick={() => setAuthOpen(true)}
    className="bg-on-surface text-surface px-6 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-all active:scale-95 duration-200 ease-in-out"
  >
    Login
  </button>
)}
```

- [ ] **Step 3: Wire up Pricing CTA buttons in `components/Pricing.tsx`**

At the top of `Pricing.tsx`, add imports:

```typescript
import { useConvexAuth } from "convex/react";
import { useState } from "react"; // already imported
import AuthModal from "@/components/AuthModal";
```

Inside the `Pricing` component function, add state and the checkout handler:

```typescript
export default function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const [authOpen, setAuthOpen]       = useState(false);
  const [loading, setLoading]         = useState<string | null>(null);
  const { isAuthenticated }           = useConvexAuth();

  async function handleCheckout(plan: "pro" | "ultra") {
    if (!isAuthenticated) {
      setAuthOpen(true);
      return;
    }
    const key = `${plan}_${billing}` as const; // e.g. "pro_monthly"
    setLoading(key);
    try {
      const res = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan:       key,
          successUrl: `${window.location.origin}/billing?success=1`,
          cancelUrl:  `${window.location.origin}/#pricing`,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
        alert("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(null);
    }
  }
```

Replace the Pro CTA button:

```tsx
<button
  onClick={() => handleCheckout("pro")}
  disabled={loading === `pro_${billing}`}
  className="w-full py-4 rounded-xl text-sm font-black shadow-lg shadow-pink-100 transition-all duration-300 active:scale-[0.98] hover:scale-[1.02] hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
  style={{ background: "linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%)", color: "#ffffff" }}
>
  {loading === `pro_${billing}` ? "Redirecting…" : "Go Pro"}
</button>
```

Replace the Ultra CTA button:

```tsx
<button
  onClick={() => handleCheckout("ultra")}
  disabled={loading === `ultra_${billing}`}
  className="w-full py-4 rounded-xl text-sm font-bold border transition-all duration-300 bg-white text-[#191918] border-[#191918] hover:bg-[#F2F2F2] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
>
  {loading === `ultra_${billing}` ? "Redirecting…" : "Go Ultra"}
</button>
```

Add `<AuthModal>` at the bottom of the component's return, before the closing `</section>`:

```tsx
<AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/PlanBadge.tsx components/Navbar.tsx components/Pricing.tsx
git commit -m "feat: PlanBadge component, Navbar badge, Pricing CTA wired to checkout"
```

---

## Task 9: Billing history page

**Files:**
- Create: `app/billing/page.tsx`

- [ ] **Step 1: Create `app/billing/page.tsx`**

```typescript
"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style:    "currency",
    currency: currency ?? "USD",
  }).format(cents / 100);
}

const PLAN_LABEL: Record<string, string> = {
  pro: "Pro", ultra: "Ultra", free: "Free",
};

const INTERVAL_LABEL: Record<string, string> = {
  monthly: "Monthly", yearly: "Yearly",
};

export default function BillingPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  // Redirect unauthenticated users to home
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/?openLogin=true");
    }
  }, [isAuthenticated, isLoading, router]);

  const billing      = useQuery(api.billing.getUserPlan,      isAuthenticated ? {} : "skip");
  const subscription = useQuery(api.billing.getSubscription,  isAuthenticated ? {} : "skip");
  const payments     = useQuery(api.billing.getBillingHistory, isAuthenticated ? {} : "skip");

  if (isLoading || !isAuthenticated) {
    return null; // redirect happening
  }

  const plan = billing?.plan ?? "free";

  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1
        className="text-3xl font-normal mb-10"
        style={{ color: "#DF849D", fontFamily: "var(--font-cursive)" }}
      >
        billing
      </h1>

      {/* ── Current Plan Card ── */}
      <div
        className="rounded-2xl border p-8 mb-10"
        style={{ background: "#ffffff", borderColor: "rgba(0,0,0,0.08)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#B2A28C" }}>
              Current Plan
            </p>
            <p className="text-2xl font-bold" style={{ color: "#191918" }}>
              {PLAN_LABEL[plan] ?? "Free"}
              {subscription && (
                <span className="text-base font-normal ml-2" style={{ color: "#62584F" }}>
                  · {INTERVAL_LABEL[subscription.interval]}
                </span>
              )}
            </p>
          </div>
          {plan !== "free" && subscription && (
            <div className="text-right">
              <p className="text-xs font-medium" style={{ color: "#B2A28C" }}>
                {subscription.cancelAtPeriodEnd ? "Cancels on" : "Renews on"}
              </p>
              <p className="text-sm font-semibold" style={{ color: "#191918" }}>
                {formatDate(subscription.currentPeriodEnd)}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          {plan === "free" ? (
            <a
              href="/#pricing"
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #FF9A8B 0%, #DF849D 100%)" }}
            >
              Upgrade
            </a>
          ) : (
            <a
              href="/#pricing"
              className="px-5 py-2.5 rounded-xl text-sm font-bold border text-[#191918] border-[#191918] hover:bg-[#F2F2F2] transition-colors"
            >
              Change Plan
            </a>
          )}
        </div>
      </div>

      {/* ── Payment History ── */}
      <h2 className="text-lg font-bold mb-4" style={{ color: "#191918" }}>
        Payment History
      </h2>

      {!payments || payments.length === 0 ? (
        <p className="text-sm" style={{ color: "#B2A28C" }}>
          No payments yet.
        </p>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#FDF7EF", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "#62584F" }}>Date</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "#62584F" }}>Plan</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "#62584F" }}>Amount</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "#62584F" }}>Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p._id}
                  style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", background: "#ffffff" }}
                >
                  <td className="px-5 py-4" style={{ color: "#3D3A36" }}>
                    {formatDate(p.paidAt)}
                  </td>
                  <td className="px-5 py-4" style={{ color: "#3D3A36" }}>
                    {p.plan ? `${PLAN_LABEL[p.plan]}${p.interval ? ` · ${INTERVAL_LABEL[p.interval]}` : ""}` : "—"}
                  </td>
                  <td className="px-5 py-4 font-medium" style={{ color: "#191918" }}>
                    {formatAmount(p.amount, p.currency)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className="text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
                      style={{
                        background: p.status === "succeeded" ? "#DCFCE7" : "#FEE2E2",
                        color:      p.status === "succeeded" ? "#15803D" : "#DC2626",
                      }}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {p.invoiceUrl && (
                      <a
                        href={`/api/billing/invoice/${p.dodoPaymentId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold hover:underline"
                        style={{ color: "#DF849D" }}
                      >
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

```bash
npx tsc --noEmit
npm run build
```

Expected: no type errors, build succeeds.

- [ ] **Step 3: Add a billing link to the Navbar for authenticated users**

In `components/Navbar.tsx`, inside the `isAuthenticated` branch, add a link to `/billing` next to the plan badge:

```tsx
{isAuthenticated ? (
  <div className="flex items-center gap-3">
    <a
      href="/billing"
      className="text-sm font-medium hover:opacity-80 transition-opacity"
      style={{ color: "#62584F" }}
    >
      Billing
    </a>
    <PlanBadge />
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold cursor-default select-none"
      style={{ backgroundColor: "#DF849D" }}
      title={email}
    >
      {initial || "?"}
    </div>
  </div>
) : (
  /* ... login button ... */
)}
```

- [ ] **Step 4: Commit**

```bash
git add app/billing/page.tsx components/Navbar.tsx
git commit -m "feat: billing history page and Navbar billing link"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Schema: `userBilling`, `subscriptions`, `payments` — Task 2
- [x] Convex billing module: `getUserPlan`, `getSubscription`, `getBillingHistory` — Task 3
- [x] Convex billing module: `upsertSubscription`, `recordPayment`, `setUserPlan`, `setDodoCustomerId` — Task 3
- [x] Webhook handler with Standard Webhooks signature verification — Task 4
- [x] All 9 Dodo event types handled — Task 4 (`processEvent`)
- [x] Checkout API route — Task 5
- [x] Invoice redirect route — Task 6
- [x] Plan enforcement on `fetchXResults` — Task 7
- [x] Plan enforcement on X `generateReply` — Task 7
- [x] `<PlanBadge />` component (Free/Pro/Ultra with colour coding) — Task 8
- [x] Pricing CTA buttons wired to checkout — Task 8
- [x] Billing history page: current plan card + renewal date — Task 9
- [x] Billing history page: payment table with PDF download — Task 9
- [x] Billing link in Navbar — Task 9 Step 3
- [x] Env vars documented — Task 1
- [x] Test mode first (environment selected by key prefix) — Task 5

**Type consistency check:**
- `getUserPlanForDevice` defined in Task 3 → used in Task 7 as `internal.billing.getUserPlanForDevice` ✓
- `findUserByDodoCustomerId` defined in Task 4 Step 2 → used in `webhookDodo.ts` as `internal.billing.findUserByDodoCustomerId` ✓
- `dodoWebhookHandler` defined in Task 4 Step 1 → imported in `http.ts` Task 4 Step 3 ✓
- Payment table index `by_user_paid_at` defined in Task 2 → used in `getBillingHistory` Task 3 ✓
- `api.billing.getUserPlan` used in `PlanBadge.tsx` (Task 8) — defined as public query in Task 3 ✓
- `api.billing.getSubscription` used in billing page (Task 9) — defined as public query in Task 3 ✓
- `api.billing.getBillingHistory` used in billing page (Task 9) and invoice route (Task 6) — defined as public query in Task 3 ✓
