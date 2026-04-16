# Dashboard Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all X/Twitter logic, reply generation, and the browser extension; migrate the Reddit feed into a standalone web dashboard at `/dashboard` with server-side Reddit JSON API fetching.

**Architecture:** Convex `action` fetches Reddit's public `.json` API server-side, stores results per `userId` in `redditResults`. The dashboard at `/dashboard` is a protected Next.js route that reads settings and feed from Convex. The landing page stays intact except for extension references.

**Tech Stack:** Next.js 14 App Router, Convex (auth + DB + actions), Reddit public JSON API, Tailwind CSS, TypeScript

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `convex/schema.ts` | Remove twitterResults, extensionSessions, brandContexts; update redditResults to userId; add userSettings |
| Create | `convex/userSettings.ts` | getUserSettings query, upsertUserSettings mutation |
| Rewrite | `convex/reddit.ts` | userId-based upsert, getResults, fetchAndStore action |
| Rewrite | `convex/http.ts` | Remove all X/reply/extension routes; keep auth + webhook only |
| Modify | `convex/crons.ts` | Remove X cleanup cron |
| Delete | `convex/twitter.ts` | Entire file |
| Delete | `convex/extensionAuth.ts` | Entire file |
| Delete | `convex/brand.ts` | Entire file |
| Modify | `middleware.ts` | Protect `/dashboard` route |
| Modify | `app/providers.tsx` | Remove AuthBridge |
| Modify | `components/AuthModal.tsx` | Redirect to `/dashboard` after login |
| Modify | `components/Navbar.tsx` | Remove extension link; redirect to `/dashboard` when authenticated |
| Modify | `components/Hero.tsx` | Replace "Get Extension" CTA with "Get Started" |
| Create | `app/dashboard/layout.tsx` | Dashboard layout wrapper |
| Create | `app/dashboard/page.tsx` | Main dashboard page |
| Create | `components/dashboard/NavBar.tsx` | Horizontal nav: logo left, Reddit+Settings icons centered |
| Create | `components/dashboard/SettingsPanel.tsx` | Slide-in settings panel |
| Create | `components/dashboard/RedditFeed.tsx` | Card feed with progressive pagination |
| Delete | `chrome-extension/` | Entire folder |
| Delete | `components/ExtensionPopup.tsx` | Entire file |
| Delete | `components/Settings.tsx` | Entire file |
| Delete | `components/AuthBridge.tsx` | Entire file |

---

### Task 1: Convex schema migration

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Replace schema.ts**

```typescript
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
    userId:      v.id("users"),
    keywords:    v.array(v.string()),
    excluded:    v.array(v.string()),
    subreddits:  v.array(v.string()),
    minUpvotes:  v.number(),
    minComments: v.number(),
    lastFetchAt: v.number(),
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
});
```

- [ ] **Step 2: Push schema to Convex dev (clears old tables)**

```bash
npx convex dev --once
```

Expected: schema deploys, old `twitterResults`/`extensionSessions`/`brandContexts` tables disappear, new `userSettings` table appears. Existing `redditResults` documents will be cleared since the field type changed from `deviceId: string` to `userId: id("users")`.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: migrate schema — userId-based reddit results, userSettings, remove X/extension tables"
```

---

### Task 2: Add convex/userSettings.ts

**Files:**
- Create: `convex/userSettings.ts`

- [ ] **Step 1: Create the file**

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUserSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export const upsertUserSettings = mutation({
  args: {
    keywords:   v.array(v.string()),
    excluded:   v.array(v.string()),
    subreddits: v.array(v.string()),
    minUpvotes: v.number(),
    minComments: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { ...args });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        ...args,
        lastFetchAt: 0,
      });
    }
  },
});
```

- [ ] **Step 2: Deploy**

```bash
npx convex dev --once
```

Expected: no errors, `userSettings` functions appear in Convex dashboard.

- [ ] **Step 3: Commit**

```bash
git add convex/userSettings.ts
git commit -m "feat: add userSettings — per-user keyword/subreddit/filter settings"
```

---

### Task 3: Rewrite convex/reddit.ts

**Files:**
- Modify: `convex/reddit.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const getResults = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("redditResults")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const deleteExpiredResults = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const expired = await ctx.db
      .query("redditResults")
      .filter((q) => q.lt(q.field("fetchedAt"), cutoff))
      .collect();
    for (const doc of expired) {
      await ctx.db.delete(doc._id);
    }
  },
});

const upsertResults = internalMutation({
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
    for (const post of posts) {
      const existing = await ctx.db
        .query("redditResults")
        .withIndex("by_user_post", (q) =>
          q.eq("userId", userId).eq("postId", post.postId)
        )
        .first();
      if (!existing) {
        await ctx.db.insert("redditResults", {
          userId,
          ...post,
          fetchedAt: Date.now(),
        });
      }
    }
  },
});

const updateLastFetchAt = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (settings) {
      await ctx.db.patch(settings._id, { lastFetchAt: Date.now() });
    }
  },
});

export const fetchAndStore = action({
  args: {},
  handler: async (ctx): Promise<{ count: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const settings = await ctx.runQuery(internal.userSettings.getSettingsInternal, { userId });
    if (!settings) return { count: 0 };

    const { keywords, excluded, subreddits, minUpvotes, minComments } = settings;
    const allPosts: any[] = [];
    const seen = new Set<string>();

    // Fetch by keywords
    for (const keyword of keywords) {
      try {
        const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(keyword)}&sort=new&limit=25&type=link`;
        const res = await fetch(url, {
          headers: { "User-Agent": "agentk/1.0 (web dashboard)" },
        });
        if (!res.ok) continue;
        const json = await res.json();
        const children = json?.data?.children ?? [];
        for (const child of children) {
          const p = child.data;
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          allPosts.push(p);
        }
      } catch {
        // skip failed keyword fetch
      }
    }

    // Fetch by subreddits
    for (const sub of subreddits) {
      try {
        const url = `https://www.reddit.com/r/${encodeURIComponent(sub)}/new.json?limit=25`;
        const res = await fetch(url, {
          headers: { "User-Agent": "agentk/1.0 (web dashboard)" },
        });
        if (!res.ok) continue;
        const json = await res.json();
        const children = json?.data?.children ?? [];
        for (const child of children) {
          const p = child.data;
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          allPosts.push(p);
        }
      } catch {
        // skip failed subreddit fetch
      }
    }

    // Normalize, filter, map to our shape
    const excludedLower = excluded.map((e) => e.toLowerCase());
    const posts = allPosts
      .filter((p) => {
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

    if (posts.length > 0) {
      await ctx.runMutation(internal.reddit.upsertResults, { userId, posts });
    }
    await ctx.runMutation(internal.reddit.updateLastFetchAt, { userId });

    return { count: posts.length };
  },
});
```

- [ ] **Step 2: Add `getSettingsInternal` to convex/userSettings.ts**

The `fetchAndStore` action calls `internal.userSettings.getSettingsInternal`. Add this to `convex/userSettings.ts`:

```typescript
export const getSettingsInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});
```

Also add `internalQuery` to the import line at the top of `convex/userSettings.ts`:
```typescript
import { internalQuery, mutation, query } from "./_generated/server";
```

- [ ] **Step 3: Deploy**

```bash
npx convex dev --once
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/reddit.ts convex/userSettings.ts
git commit -m "feat: reddit — userId-based fetch+store action, server-side Reddit JSON API"
```

---

### Task 4: Rewrite convex/http.ts

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1: Replace the entire file — keep only auth routes and Dodo webhook**

```typescript
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { dodoWebhookHandler } from "./webhookDodo";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: "/webhookDodo",
  method: "POST",
  handler: dodoWebhookHandler,
});

http.route({
  path: "/webhookDodo",
  method: "OPTIONS",
  handler: async () => new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, svix-id, svix-timestamp, svix-signature",
    },
  }),
});

export default http;
```

- [ ] **Step 2: Check webhookDodo.ts still compiles — it shouldn't import anything we deleted**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to deleted imports. If there are errors about missing imports, they will be from the deleted files — move to the next step.

- [ ] **Step 3: Deploy**

```bash
npx convex dev --once
```

Expected: deploys cleanly.

- [ ] **Step 4: Commit**

```bash
git add convex/http.ts
git commit -m "feat: strip http.ts — remove X/reply/extension routes, keep auth + webhook only"
```

---

### Task 5: Update convex/crons.ts

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Remove X cleanup cron**

Replace the entire file with:

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup-expired-reddit-results",
  { hours: 1 },
  internal.reddit.deleteExpiredResults
);

export default crons;
```

- [ ] **Step 2: Deploy**

```bash
npx convex dev --once
```

Expected: only one cron job registered.

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat: remove X cleanup cron"
```

---

### Task 6: Delete obsolete Convex files

**Files:**
- Delete: `convex/twitter.ts`
- Delete: `convex/extensionAuth.ts`
- Delete: `convex/brand.ts`

- [ ] **Step 1: Delete the files**

```bash
rm convex/twitter.ts convex/extensionAuth.ts convex/brand.ts
```

- [ ] **Step 2: Deploy to confirm no broken references**

```bash
npx convex dev --once
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -u convex/twitter.ts convex/extensionAuth.ts convex/brand.ts
git commit -m "feat: delete twitter.ts, extensionAuth.ts, brand.ts — no longer needed"
```

---

### Task 7: Update middleware.ts

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Replace middleware to protect /dashboard**

```typescript
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default convexAuthNextjsMiddleware((request, { convexAuth }) => {
  if (isProtectedRoute(request) && !convexAuth.isAuthenticated()) {
    return nextjsMiddlewareRedirect(request, "/");
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: protect /dashboard route — redirect unauthenticated to /"
```

---

### Task 8: Update landing page auth flow

**Files:**
- Modify: `app/providers.tsx`
- Modify: `components/AuthModal.tsx`
- Modify: `components/Navbar.tsx`
- Modify: `components/Hero.tsx`

- [ ] **Step 1: Remove AuthBridge from providers.tsx**

Replace `app/providers.tsx` with:

```typescript
"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
```

- [ ] **Step 2: Update AuthModal.tsx — redirect to /dashboard after login**

Find the `handleGoogle` function (line ~50) and change:
```typescript
await signIn("google", { redirectTo: "/" });
```
To:
```typescript
await signIn("google", { redirectTo: "/dashboard" });
```

Find `handleLogin` (line ~54) — after `await signIn("password", fd);` add a redirect:
```typescript
await signIn("password", fd);
window.location.href = "/dashboard";
handleClose();
```

Find `handleSignupSubmit` (line ~87) — after `await signIn("password", fd);` add:
```typescript
await signIn("password", fd);
window.location.href = "/dashboard";
handleClose();
```

- [ ] **Step 3: Update Navbar.tsx — remove extension link, add dashboard link**

Find and remove this block in `Navbar.tsx` (the "Get the extension" anchor tag, lines ~88-96):
```typescript
<a
  href="https://chromewebstore.google.com"
  target="_blank"
  rel="noopener noreferrer"
  className="block px-4 py-2.5 text-[12px] font-medium text-[#62584F] hover:bg-[#FDF7EF] transition-colors"
  onClick={() => setDropdownOpen(false)}
>
  Get the extension
</a>
```

Replace the avatar button's `onClick` in `Navbar.tsx` — when authenticated, clicking the avatar should go to `/dashboard`. Add a dashboard link in the dropdown above logout:

```typescript
<a
  href="/dashboard"
  className="block px-4 py-2.5 text-[12px] font-medium text-[#62584F] hover:bg-[#FDF7EF] transition-colors"
  onClick={() => setDropdownOpen(false)}
>
  Dashboard
</a>
```

- [ ] **Step 4: Update Hero.tsx — replace extension CTA**

Replace:
```typescript
<button className="creative-gradient text-white px-10 py-5 rounded-lg text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95">
  Get Extension for Free
</button>
```

With:
```typescript
<a
  href="/dashboard"
  className="creative-gradient text-white px-10 py-5 rounded-lg text-lg font-bold shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95 inline-block"
>
  Get Started Free
</a>
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/providers.tsx components/AuthModal.tsx components/Navbar.tsx components/Hero.tsx
git commit -m "feat: post-login redirect to /dashboard, remove extension links"
```

---

### Task 9: Dashboard layout

**Files:**
- Create: `app/dashboard/layout.tsx`

- [ ] **Step 1: Create the layout**

```typescript
import type { ReactNode } from "react";

export const metadata = {
  title: "Dashboard — AgentK",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "#FDF7EF" }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/layout.tsx
git commit -m "feat: dashboard layout"
```

---

### Task 10: Dashboard NavBar component

**Files:**
- Create: `components/dashboard/NavBar.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import Image from "next/image";
import logo from "@/app/logo.png";

interface Props {
  onSettingsClick: () => void;
  onReloadClick: () => void;
  loading: boolean;
}

export default function DashboardNavBar({ onSettingsClick, onReloadClick, loading }: Props) {
  return (
    <header
      style={{
        height: "56px",
        background: "#FDF7EF",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Logo — far left */}
      <a href="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
        <Image src={logo} alt="AgentK" height={28} priority />
        <span
          style={{
            fontSize: "17px",
            fontWeight: 800,
            letterSpacing: "-0.5px",
            background: "linear-gradient(135deg, #ff9472 0%, #f2709c 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          agentK
        </span>
      </a>

      {/* Centered icons */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        {/* Reddit icon — acts as reload */}
        <button
          onClick={onReloadClick}
          disabled={loading}
          title="Reload feed"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            border: "none",
            background: "rgba(0,0,0,0.04)",
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: loading ? 0.5 : 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (!loading) (e.currentTarget.style.background = "rgba(0,0,0,0.08)"); }}
          onMouseLeave={(e) => { (e.currentTarget.style.background = "rgba(0,0,0,0.04)"); }}
        >
          {/* Reddit alien icon */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="#FF4500"/>
            <circle cx="10" cy="10" r="9" fill="#FF4500"/>
            <path d="M16.67 10a1.46 1.46 0 0 0-2.47-1 7.12 7.12 0 0 0-3.85-1.23l.65-3.06 2.13.45a1 1 0 1 0 .08-.49L10.8 4.3a.27.27 0 0 0-.32.2l-.72 3.4a7.15 7.15 0 0 0-3.89 1.23 1.46 1.46 0 1 0-1.61 2.39 2.87 2.87 0 0 0 0 .37c0 1.88 2.19 3.41 4.89 3.41s4.89-1.53 4.89-3.41a2.87 2.87 0 0 0 0-.37 1.46 1.46 0 0 0 .63-1.52zM7.27 11a1 1 0 1 1 1 1 1 1 0 0 1-1-1zm5.57 2.65a3.54 3.54 0 0 1-2.84.64 3.54 3.54 0 0 1-2.84-.64.17.17 0 0 1 .24-.24 3.21 3.21 0 0 0 2.6.52 3.21 3.21 0 0 0 2.6-.52.17.17 0 0 1 .24.24zm-.17-1.65a1 1 0 1 1 1-1 1 1 0 0 1-1 1z" fill="white"/>
          </svg>
        </button>

        {/* Settings icon */}
        <button
          onClick={onSettingsClick}
          title="Settings"
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            border: "none",
            background: "rgba(0,0,0,0.04)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget.style.background = "rgba(0,0,0,0.08)"); }}
          onMouseLeave={(e) => { (e.currentTarget.style.background = "rgba(0,0,0,0.04)"); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#62584F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/NavBar.tsx
git commit -m "feat: dashboard NavBar — logo left, Reddit+Settings icons centered"
```

---

### Task 11: SettingsPanel component

**Files:**
- Create: `components/dashboard/SettingsPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ open, onClose }: Props) {
  const settings      = useQuery(api.userSettings.getUserSettings);
  const upsertSettings = useMutation(api.userSettings.upsertUserSettings);

  const [keywords,    setKeywords]    = useState<string[]>([]);
  const [excluded,    setExcluded]    = useState<string[]>([]);
  const [subreddits,  setSubreddits]  = useState<string[]>([]);
  const [minUpvotes,  setMinUpvotes]  = useState(0);
  const [minComments, setMinComments] = useState(0);
  const [kwInput,     setKwInput]     = useState("");
  const [exInput,     setExInput]     = useState("");
  const [subInput,    setSubInput]    = useState("");
  const [saving,      setSaving]      = useState(false);
  const [loaded,      setLoaded]      = useState(false);

  // Populate form when settings load
  if (settings && !loaded) {
    setKeywords(settings.keywords);
    setExcluded(settings.excluded);
    setSubreddits(settings.subreddits);
    setMinUpvotes(settings.minUpvotes);
    setMinComments(settings.minComments);
    setLoaded(true);
  }

  function addPill(value: string, list: string[], setList: (v: string[]) => void, setInput: (v: string) => void) {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) setList([...list, trimmed]);
    setInput("");
  }

  function removePill(index: number, list: string[], setList: (v: string[]) => void) {
    setList(list.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await upsertSettings({ keywords, excluded, subreddits, minUpvotes, minComments });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const pillStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "5px",
    background: "#F0E8DE", borderRadius: "20px",
    padding: "3px 10px", fontSize: "12px", fontWeight: 600, color: "#3D3A36",
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, border: "1px solid rgba(0,0,0,0.1)", borderRadius: "8px",
    padding: "6px 10px", fontSize: "12px", color: "#191918",
    background: "#fff", outline: "none", fontFamily: "inherit",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 800, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "#B2A28C", display: "block", marginBottom: "6px",
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 100,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, height: "100vh", width: "320px",
          background: "#FDF7EF", borderLeft: "1px solid rgba(0,0,0,0.08)",
          zIndex: 101, overflowY: "auto", padding: "24px",
          display: "flex", flexDirection: "column", gap: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#191918" }}>Settings</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#B2A28C", fontSize: "18px", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Keywords */}
        <div>
          <label style={labelStyle}>Keywords</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
            {keywords.map((k, i) => (
              <span key={k} style={pillStyle}>
                {k}
                <button onClick={() => removePill(i, keywords, setKeywords)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B2A28C", fontSize: "12px", padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              style={inputStyle}
              placeholder="Add keyword…"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addPill(kwInput, keywords, setKeywords, setKwInput); }}
            />
            <button
              onClick={() => addPill(kwInput, keywords, setKeywords, setKwInput)}
              style={{ background: "linear-gradient(135deg,#FF9A8B,#DF849D)", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >+</button>
          </div>
        </div>

        {/* Excluded */}
        <div>
          <label style={labelStyle}>Excluded terms</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
            {excluded.map((e, i) => (
              <span key={e} style={pillStyle}>
                {e}
                <button onClick={() => removePill(i, excluded, setExcluded)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B2A28C", fontSize: "12px", padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              style={inputStyle}
              placeholder="Add excluded term…"
              value={exInput}
              onChange={(e) => setExInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addPill(exInput, excluded, setExcluded, setExInput); }}
            />
            <button
              onClick={() => addPill(exInput, excluded, setExcluded, setExInput)}
              style={{ background: "linear-gradient(135deg,#FF9A8B,#DF849D)", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >+</button>
          </div>
        </div>

        {/* Subreddits */}
        <div>
          <label style={labelStyle}>Subreddits</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
            {subreddits.map((s, i) => (
              <span key={s} style={pillStyle}>
                r/{s}
                <button onClick={() => removePill(i, subreddits, setSubreddits)} style={{ background: "none", border: "none", cursor: "pointer", color: "#B2A28C", fontSize: "12px", padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              style={inputStyle}
              placeholder="subreddit name (no r/)…"
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addPill(subInput.replace(/^r\//i, ""), subreddits, setSubreddits, setSubInput); }}
            />
            <button
              onClick={() => addPill(subInput.replace(/^r\//i, ""), subreddits, setSubreddits, setSubInput)}
              style={{ background: "linear-gradient(135deg,#FF9A8B,#DF849D)", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
            >+</button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Min upvotes</label>
            <input
              type="number"
              min={0}
              value={minUpvotes}
              onChange={(e) => setMinUpvotes(Number(e.target.value))}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Min comments</label>
            <input
              type="number"
              min={0}
              value={minComments}
              onChange={(e) => setMinComments(Number(e.target.value))}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: "linear-gradient(135deg,#FF9A8B,#DF849D)",
            color: "#fff", border: "none", borderRadius: "10px",
            padding: "10px", fontSize: "13px", fontWeight: 800,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1, marginTop: "auto",
          }}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/SettingsPanel.tsx
git commit -m "feat: SettingsPanel — keywords, excluded, subreddits, min filters"
```

---

### Task 12: RedditFeed component

**Files:**
- Create: `components/dashboard/RedditFeed.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";

interface Post {
  _id: string;
  postId: string;
  title?: string;
  body: string;
  author: string;
  subreddit: string;
  url: string;
  ups: number;
  numComments: number;
  createdUtc: number;
}

interface Props {
  posts: Post[];
}

const BATCH = 8;

function timeAgo(utc: number): string {
  const diff = Math.floor((Date.now() / 1000) - utc);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function PostCard({ post }: { post: Post }) {
  return (
    <a
      href={post.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block", textDecoration: "none",
        background: "#fff", borderRadius: "12px",
        border: "1px solid rgba(0,0,0,0.06)",
        padding: "14px 16px", marginBottom: "10px",
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span style={{
          fontSize: "10px", fontWeight: 800, color: "#DF849D",
          background: "rgba(223,132,157,0.1)", borderRadius: "6px", padding: "2px 7px",
        }}>
          r/{post.subreddit}
        </span>
        <span style={{ fontSize: "10px", color: "#B2A28C" }}>u/{post.author}</span>
        <span style={{ fontSize: "10px", color: "#B2A28C" }}>· {timeAgo(post.createdUtc)}</span>
      </div>

      {post.title && (
        <p style={{
          fontSize: "13px", fontWeight: 700, color: "#191918",
          lineHeight: "1.4", marginBottom: "4px",
        }}>
          {post.title.length > 120 ? post.title.slice(0, 120) + "…" : post.title}
        </p>
      )}

      {post.body && (
        <p style={{
          fontSize: "12px", color: "#62584F", lineHeight: "1.5",
          marginBottom: "8px", overflow: "hidden",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        } as React.CSSProperties}>
          {post.body}
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#B2A28C" }}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          {post.ups}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#B2A28C" }}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {post.numComments}
        </span>
      </div>
    </a>
  );
}

export default function RedditFeed({ posts }: Props) {
  const [visible, setVisible] = useState(BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(BATCH);
  }, [posts]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible((v) => Math.min(v + BATCH, posts.length));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [posts.length]);

  if (posts.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "60vh", gap: "12px",
      }}>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#C4B9AA" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "#62584F" }}>No posts found</p>
        <p style={{ fontSize: "12px", color: "#B2A28C", textAlign: "center", maxWidth: "220px" }}>
          Add keywords or subreddits in settings and reload.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "20px 16px" }}>
      {posts.slice(0, visible).map((post) => (
        <PostCard key={post._id} post={post} />
      ))}
      {visible < posts.length && (
        <div ref={sentinelRef} style={{ height: "40px" }} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/RedditFeed.tsx
git commit -m "feat: RedditFeed component — cards, progressive pagination, intersection observer"
```

---

### Task 13: Dashboard page

**Files:**
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import DashboardNavBar from "@/components/dashboard/NavBar";
import SettingsPanel from "@/components/dashboard/SettingsPanel";
import RedditFeed from "@/components/dashboard/RedditFeed";

const FETCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export default function DashboardPage() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading]           = useState(false);

  const posts    = useQuery(api.reddit.getResults) ?? [];
  const settings = useQuery(api.userSettings.getUserSettings);
  const fetchAndStore = useAction(api.reddit.fetchAndStore);

  async function reload() {
    setLoading(true);
    try {
      await fetchAndStore({});
    } finally {
      setLoading(false);
    }
  }

  // Auto-fetch on mount if stale or no settings
  useEffect(() => {
    if (settings === undefined) return; // still loading
    if (!settings) {
      // No settings yet — open settings panel so user can configure
      setSettingsOpen(true);
      return;
    }
    const stale = Date.now() - (settings.lastFetchAt ?? 0) > FETCH_INTERVAL_MS;
    if (stale || posts.length === 0) {
      reload();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Re-fetch after settings are saved (panel closes)
  function handleSettingsClose() {
    setSettingsOpen(false);
    reload();
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FDF7EF" }}>
      <DashboardNavBar
        onSettingsClick={() => setSettingsOpen(true)}
        onReloadClick={reload}
        loading={loading}
      />

      {loading && posts.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "70vh", gap: "12px",
        }}>
          <svg className="animate-spin" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#DF849D" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <p style={{ fontSize: "13px", color: "#B2A28C" }}>Loading results…</p>
        </div>
      ) : (
        <RedditFeed posts={posts} />
      )}

      <SettingsPanel open={settingsOpen} onClose={handleSettingsClose} />
    </div>
  );
}
```

- [ ] **Step 2: Add spin animation to globals.css if not already present**

Check `app/globals.css` for `@keyframes spin`. If missing, add:

```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.animate-spin {
  animation: spin 1s linear infinite;
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx app/globals.css
git commit -m "feat: dashboard page — Reddit feed, auto-fetch, settings panel integration"
```

---

### Task 14: Delete extension and unused components

**Files:**
- Delete: `chrome-extension/` (entire directory)
- Delete: `components/ExtensionPopup.tsx`
- Delete: `components/Settings.tsx`
- Delete: `components/AuthBridge.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm -rf chrome-extension/
rm components/ExtensionPopup.tsx components/Settings.tsx components/AuthBridge.tsx
```

- [ ] **Step 2: TypeScript check — confirm nothing imports deleted files**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If there are import errors, trace and remove those import lines.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: delete chrome extension, ExtensionPopup, Settings, AuthBridge"
```

---

### Task 15: Run the app and verify end-to-end

- [ ] **Step 1: Start dev servers**

```bash
npx convex dev &
npm run dev
```

- [ ] **Step 2: Verify landing page**

Open `http://localhost:3000`. Confirm:
- Navbar shows "Login" button (no "Get the extension" link)
- Hero shows "Get Started Free" button
- No console errors

- [ ] **Step 3: Verify auth redirect**

Click Login, sign in. Confirm:
- After login → redirected to `http://localhost:3000/dashboard`

- [ ] **Step 4: Verify unauthenticated dashboard protection**

Open `http://localhost:3000/dashboard` without logging in. Confirm:
- Redirected to `http://localhost:3000/`

- [ ] **Step 5: Verify dashboard**

When logged in and on `/dashboard`:
- NavBar shows agentK logo left, Reddit + Settings icons centered
- If no settings → Settings panel opens automatically
- Add at least one keyword (e.g. "AI SaaS") and save
- Feed loads with Reddit posts
- Reddit icon click reloads
- Settings icon opens panel

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: dashboard migration complete — Reddit-only web dashboard"
```
