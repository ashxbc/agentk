# Dodo Payments Pricing Backend — Design Spec

**Date:** 2026-04-09
**Scope:** Full pricing backend for AgentK — subscription management, plan enforcement, billing history, and webhook handling using Dodo Payments. Test mode first.

---

## Overview

AgentK has two paid tiers (Pro, Ultra) each available monthly or yearly. Free users are gated from X feed and X reply generation. Paid users get full access. The system must handle plan selection → Dodo checkout → test payment → webhook → Convex plan update as one coherent flow.

---

## Plans

| Plan         | Price  | Product env var            |
|--------------|--------|----------------------------|
| Pro Monthly  | $19/mo | `DODO_PRO_MONTHLY_ID`      |
| Pro Yearly   | $168/yr| `DODO_PRO_YEARLY_ID`       |
| Ultra Monthly| $49/mo | `DODO_ULTRA_MONTHLY_ID`    |
| Ultra Yearly | $444/yr| `DODO_ULTRA_YEARLY_ID`     |

Free tier is the default. No product ID — just the absence of an active subscription.

---

## Architecture

**Dodo SDK calls live in Next.js API routes.** The Dodo Node SDK requires secrets and runs server-side. Next.js `app/api/` routes are the natural home.

**State lives in Convex.** Plan status, subscription records, and payment history are written to Convex by the webhook handler and read by the app and extension.

**Convex auth (`@convex-dev/auth`) is the identity system.** Plan fields are attached to the `users` table. The billing module reads user identity from `ctx.auth.getUserIdentity()` — never from client-supplied args.

---

## Environment Variables

```
DODO_API_KEY                 # Dodo Payments secret key (test mode first)
DODO_WEBHOOK_SECRET          # For Standard Webhooks signature verification
DODO_PRO_MONTHLY_ID          # Dodo product ID
DODO_PRO_YEARLY_ID
DODO_ULTRA_MONTHLY_ID
DODO_ULTRA_YEARLY_ID
NEXT_PUBLIC_CONVEX_URL       # Already exists
```

---

## Schema Changes (`convex/schema.ts`)

### Additions to `users` table

The `authTables` spread defines the `users` table. Convex Auth supports extending it. Add two fields:

```typescript
// Inside defineSchema, after ...authTables:
users: defineTable({
  // ...authTables fields (extended)
  plan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("ultra"))),
  dodoCustomerId: v.optional(v.string()),
})
```

> Note: Check if `@convex-dev/auth` allows schema extension on the `users` table. If not, use a separate `userBilling` table keyed by `userId`.

### New `subscriptions` table

```typescript
subscriptions: defineTable({
  userId:               v.id("users"),
  dodoSubscriptionId:   v.string(),
  dodoProductId:        v.string(),
  plan:                 v.union(v.literal("pro"), v.literal("ultra")),
  interval:             v.union(v.literal("monthly"), v.literal("yearly")),
  status:               v.string(), // "active" | "on_hold" | "cancelled" | "expired" | "failed"
  currentPeriodStart:   v.number(), // Unix ms
  currentPeriodEnd:     v.number(), // Unix ms
  cancelAtPeriodEnd:    v.boolean(),
  updatedAt:            v.number(),
})
  .index("by_user",             ["userId"])
  .index("by_dodo_subscription",["dodoSubscriptionId"])
```

### New `payments` table

```typescript
payments: defineTable({
  userId:         v.id("users"),
  dodoPaymentId:  v.string(),
  subscriptionId: v.optional(v.string()), // Dodo subscription ID
  amount:         v.number(),             // cents
  currency:       v.string(),             // "USD"
  status:         v.string(),             // "succeeded" | "failed"
  plan:           v.optional(v.union(v.literal("pro"), v.literal("ultra"))),
  interval:       v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
  invoiceUrl:     v.optional(v.string()),
  paidAt:         v.number(),
})
  .index("by_user",        ["userId"])
  .index("by_dodo_payment",["dodoPaymentId"])
```

---

## Convex Billing Module (`convex/billing.ts`)

All functions are internal except those explicitly exposed for client reads.

### Queries (public)

- `getUserPlan(ctx)` — returns `{ plan, dodoCustomerId }` for the authenticated user. Returns `"free"` if no plan set.
- `getSubscription(ctx)` — returns the active subscription doc for the authenticated user, or `null`.
- `getBillingHistory(ctx)` — returns the last 50 payments for the authenticated user, ordered by `paidAt` desc.

### Mutations (internal — called only by webhook handler)

- `upsertSubscription(ctx, args)` — insert or update a subscription by `dodoSubscriptionId`.
- `recordPayment(ctx, args)` — insert a payment record (idempotent by `dodoPaymentId`).
- `setUserPlan(ctx, { userId, plan })` — patch `plan` on the user doc.
- `setDodoCustomerId(ctx, { userId, dodoCustomerId })` — patch `dodoCustomerId` on the user doc.

All mutations validate that the calling context is internal (via `internalMutation`).

---

## Next.js API Routes

### `POST /api/billing/checkout`

**Auth:** Requires Convex auth token in `Authorization: Bearer <token>` header.

**Input:**
```json
{ "productId": "DODO_PRO_MONTHLY_ID_VALUE", "successUrl": "...", "cancelUrl": "..." }
```

**Flow:**
1. Verify token against Convex (call `api.users.currentUser` or equivalent).
2. If user has no `dodoCustomerId`, let Dodo create one (it returns it in the session).
3. Call Dodo SDK: `dodopayments.checkoutSessions.create(...)` with product ID, success/cancel URLs, and customer info.
4. Return `{ url: checkoutUrl }`.
5. Client redirects to `url`.

**Error cases:** 401 if not authenticated, 400 if productId missing or invalid, 500 on Dodo error.

### `POST /api/webhooks/dodo`

**Auth:** Verify `webhook-id`, `webhook-timestamp`, `webhook-signature` headers using Standard Webhooks (`standardwebhooks` npm package) with `DODO_WEBHOOK_SECRET`.

**Idempotency:** Check if we've already processed this webhook ID (use `dodoPaymentId` or `dodoSubscriptionId` uniqueness in Convex).

**Events handled:**

| Event | Action |
|-------|--------|
| `subscription.active` | upsertSubscription, setUserPlan → plan |
| `subscription.renewed` | upsertSubscription, recordPayment |
| `subscription.on_hold` | upsertSubscription (status = on_hold) |
| `subscription.cancelled` | upsertSubscription (cancelAtPeriodEnd = true) |
| `subscription.expired` | upsertSubscription, setUserPlan → free |
| `subscription.failed` | upsertSubscription (status = failed) |
| `subscription.plan_changed` | upsertSubscription, setUserPlan → new plan |
| `payment.succeeded` | recordPayment |
| `payment.failed` | recordPayment |

**Response:** Always return `200 OK` immediately after signature verification, before processing (Dodo retries on non-2xx). Process async if needed, but for this scope sync is fine.

### `GET /api/billing/invoice/[paymentId]`

**Auth:** Requires auth token. Verify the payment belongs to the authenticated user before returning anything.

Fetches `invoiceUrl` from the `payments` table and redirects, or proxies the PDF from Dodo if `invoiceUrl` is a Dodo-hosted link. Returns 404 if not found or not owned by user.

---

## Plan Enforcement

### Server-side (X features only, in `convex/http.ts`)

Both `fetchXResults` and the X path of `generateReply` check plan before executing:

```typescript
const plan = await getUserPlan(ctx, userId);
if (plan === "free") {
  return new Response(JSON.stringify({ error: "upgrade_required" }), { status: 403 });
}
```

The helper `getUserPlan` looks up the user record by `deviceId` → `extensionSessions` → `users.plan`. Returns `"free"` if no plan or no session found.

### Client-side (everything else)

The web app reads `getUserPlan` via Convex query on page load. Plan-gated UI sections are hidden or show upgrade prompts based on that value. No server enforcement needed for UI-only features.

---

## Billing History Page (`/billing` or within settings)

Single page with two sections:

**Current Plan Card**
- Plan name (Free / Pro / Ultra), interval (monthly/yearly)
- Next renewal date (from `currentPeriodEnd`)
- Cancel / upgrade CTA buttons

**Payment History**
- Table: date, amount, plan, status, PDF download link
- Uses `getBillingHistory` query
- PDF download hits `/api/billing/invoice/[paymentId]`

---

## Plan Badges

A small badge component `<PlanBadge />` reads `getUserPlan` and renders:
- `Free` — grey
- `Pro` — blue
- `Ultra` — purple/gold

Shown in: extension popup header, web app nav, settings page.

---

## Dodo Product Setup (Manual, Pre-Implementation)

Before coding, create 4 products in the Dodo test dashboard:
- Pro Monthly — $19/month recurring
- Pro Yearly — $168/year recurring
- Ultra Monthly — $49/month recurring
- Ultra Yearly — $444/year recurring

Copy each product ID to the corresponding env var.

---

## File Map

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `plan`/`dodoCustomerId` to users; add `subscriptions` and `payments` tables |
| `convex/billing.ts` | New file — all Convex billing queries and mutations |
| `app/api/billing/checkout/route.ts` | New — checkout session creation |
| `app/api/webhooks/dodo/route.ts` | New — webhook handler |
| `app/api/billing/invoice/[paymentId]/route.ts` | New — invoice PDF redirect |
| `convex/http.ts` | Add plan enforcement to X paths |
| `components/PlanBadge.tsx` | New — plan badge component |
| `app/billing/page.tsx` | New — billing history page |

No changes to Chrome extension for this spec. Plan badge in extension is a separate follow-up.

---

## Out of Scope

- Coupon codes / trials
- Usage-based metering
- Team/org billing
- Email notifications
- Refunds (handled via Dodo dashboard manually)
- Extension plan badge (follow-up task)
