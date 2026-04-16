# Agentk Telegram Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Telegram bot that authenticates users via a 12-char token and delivers real-time Reddit post alerts via Convex HTTP actions and scheduled functions.

**Architecture:** A Convex HTTP action at `POST /telegram` handles the Telegram webhook (same pattern as the existing Dodo webhook in `convex/http.ts`). After each Reddit fetch in `doFetch`, a `sendAlerts` internalAction fires and delivers formatted Telegram messages. Two new tables — `agentTokens` and `alertedPosts` — handle token-to-chatId mapping and deduplication.

**Tech Stack:** Convex (httpAction, internalAction, internalMutation, internalQuery, mutation, query), Telegram Bot API (webhook mode, `sendMessage`), Next.js/React (`SettingsPanel.tsx`).

---

## File Map

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `agentTokens` + `alertedPosts` tables |
| `convex/agentTokens.ts` | Create — token CRUD + internal lookups |
| `convex/telegram.ts` | Create — webhook, sendAlerts, fetchForConnectedUsers, internal helpers |
| `convex/reddit.ts` | Add `getPostByUserPost` internalQuery + schedule `sendAlerts` in `doFetch` |
| `convex/http.ts` | Register `POST /telegram` |
| `convex/crons.ts` | Add 30-min auto-fetch cron |
| `components/dashboard/SettingsPanel.tsx` | Add `/token` command |

---

### Task 1: Schema — add `agentTokens` and `alertedPosts`

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add the two tables to `convex/schema.ts`**

Open `convex/schema.ts`. The file currently ends at line 83. Add inside `defineSchema({...})`, after the `payments` table closing brace and before the final `});`:

```ts
  agentTokens: defineTable({
    userId:         v.id("users"),
    token:          v.string(),
    telegramChatId: v.optional(v.string()),
  })
    .index("by_user",  ["userId"])
    .index("by_token", ["token"]),

  alertedPosts: defineTable({
    userId:    v.id("users"),
    postId:    v.string(),
    alertedAt: v.number(),
  }).index("by_user_post", ["userId", "postId"]),
```

- [ ] **Step 2: Verify schema compiles**

```bash
npx convex dev --once
```

Expected: no TypeScript errors, deployment succeeds. The new tables appear in the Convex dashboard under Data.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add agentTokens and alertedPosts tables to schema"
```

---

### Task 2: `convex/agentTokens.ts` — token generation and lookups

**Files:**
- Create: `convex/agentTokens.ts`

- [ ] **Step 1: Create the file with all five exports**

```ts
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

// Generates (or regenerates) the 12-char token for the authenticated user.
// Clears any existing telegramChatId so the old Telegram connection is invalidated.
export const generateToken = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const token =
      (Math.random().toString(36).slice(2, 8) +
       Math.random().toString(36).slice(2, 8)).toUpperCase();

    const existing = await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { token, telegramChatId: undefined });
    } else {
      await ctx.db.insert("agentTokens", { userId, token });
    }

    return { token };
  },
});

// Returns the current agentTokens row for the authenticated user, or null.
export const getToken = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// Internal: find a token row by token string (used by telegram webhook).
export const getByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    return await ctx.db
      .query("agentTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
  },
});

// Internal: find a token row by userId (used by sendAlerts to get chatId).
export const getByUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("agentTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

// Internal: bind a Telegram chatId to a token row after successful authentication.
export const bindChatId = internalMutation({
  args: { tokenId: v.id("agentTokens"), telegramChatId: v.string() },
  handler: async (ctx, { tokenId, telegramChatId }) => {
    await ctx.db.patch(tokenId, { telegramChatId });
  },
});

// Internal: returns all rows that have a bound telegramChatId (for the cron).
export const getConnectedUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("agentTokens").collect();
    return all.filter((r) => r.telegramChatId !== undefined);
  },
});
```

- [ ] **Step 2: Verify**

```bash
npx convex dev --once
```

Expected: no errors. Six functions appear in the Convex dashboard under Functions.

- [ ] **Step 3: Commit**

```bash
git add convex/agentTokens.ts
git commit -m "feat: agentTokens — generateToken, getToken, getByToken, getByUser, bindChatId, getConnectedUsers"
```

---

### Task 3: `convex/reddit.ts` — add `getPostByUserPost` internalQuery

**Files:**
- Modify: `convex/reddit.ts`

The `sendAlerts` action needs to fetch a post from `redditResults` by userId + postId string. Add this internalQuery at the bottom of `convex/reddit.ts`:

- [ ] **Step 1: Append `getPostByUserPost` to `convex/reddit.ts`**

```ts
export const getPostByUserPost = internalQuery({
  args: { userId: v.id("users"), postId: v.string() },
  handler: async (ctx, { userId, postId }) => {
    return await ctx.db
      .query("redditResults")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", postId)
      )
      .first();
  },
});
```

Make sure `internalQuery` is already in the import at line 1. Current import is:
```ts
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
```

Update to:
```ts
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
```

- [ ] **Step 2: Verify**

```bash
npx convex dev --once
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/reddit.ts
git commit -m "feat: add getPostByUserPost internalQuery to reddit.ts"
```

---

### Task 4: `convex/telegram.ts` — webhook, sendAlerts, fetchForConnectedUsers

**Files:**
- Create: `convex/telegram.ts`

This is the core file. It has four exports: `telegramWebhook` (httpAction), `sendAlerts` (internalAction), `fetchForConnectedUsers` (internalAction), and two internal helpers (`isAlerted`, `markAlerted`).

- [ ] **Step 1: Create `convex/telegram.ts`**

```ts
import { httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ── Internal helpers ──────────────────────────────────────────────────────────

export const isAlerted = internalQuery({
  args: { userId: v.id("users"), postId: v.string() },
  handler: async (ctx, { userId, postId }) => {
    const row = await ctx.db
      .query("alertedPosts")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", userId).eq("postId", postId)
      )
      .first();
    return row !== null;
  },
});

export const markAlerted = internalMutation({
  args: { userId: v.id("users"), postId: v.string() },
  handler: async (ctx, { userId, postId }) => {
    await ctx.db.insert("alertedPosts", { userId, postId, alertedAt: Date.now() });
  },
});

// ── Telegram send helper ──────────────────────────────────────────────────────

async function tgSend(
  token: string,
  chatId: string,
  text: string,
  url?: string
) {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (url) {
    body.reply_markup = {
      inline_keyboard: [[{ text: "🔗 Go to post", url }]],
    };
  }
  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    console.error("[tgSend] failed:", res.status, await res.text());
  }
}

// ── Webhook — handles /start and token submission ─────────────────────────────

export const telegramWebhook = httpAction(async (ctx, request) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[telegramWebhook] TELEGRAM_BOT_TOKEN not set");
    return new Response("ok", { status: 200 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  const message = body?.message;
  if (!message) return new Response("ok", { status: 200 });

  const chatId = String(message.chat?.id ?? "");
  const text   = (message.text ?? "").trim();

  if (!chatId || !text) return new Response("ok", { status: 200 });

  if (text === "/start") {
    await tgSend(
      botToken,
      chatId,
      "👋 Welcome to *Agentk*\\!\n\nEnter your Agentk Token to connect your alerts:"
    );
    return new Response("ok", { status: 200 });
  }

  // Token attempt — uppercase and validate
  const candidate = text.toUpperCase();
  const row = await ctx.runQuery(internal.agentTokens.getByToken, { token: candidate });

  if (!row) {
    await tgSend(
      botToken,
      chatId,
      "❌ Invalid token\\. Get yours from the Agentk dashboard → Settings → /token"
    );
    return new Response("ok", { status: 200 });
  }

  await ctx.runMutation(internal.agentTokens.bindChatId, {
    tokenId: row._id,
    telegramChatId: chatId,
  });

  await tgSend(
    botToken,
    chatId,
    "✅ *Connected\\!* You'll receive Reddit alerts here whenever new posts match your keywords\\."
  );

  return new Response("ok", { status: 200 });
});

// ── sendAlerts — scheduled after each doFetch ─────────────────────────────────

export const sendAlerts = internalAction({
  args: {
    userId:  v.id("users"),
    postIds: v.array(v.string()),
  },
  handler: async (ctx, { userId, postIds }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const agentToken = await ctx.runQuery(internal.agentTokens.getByUser, { userId });
    if (!agentToken?.telegramChatId) return;

    const chatId   = agentToken.telegramChatId;
    const settings = await ctx.runQuery(internal.userSettings.getSettingsInternal, { userId });
    const keywords  = settings?.keywords.map((k) => k.toLowerCase()) ?? [];

    for (const postId of postIds) {
      const alerted = await ctx.runQuery(internal.telegram.isAlerted, { userId, postId });
      if (alerted) continue;

      const post = await ctx.runQuery(internal.reddit.getPostByUserPost, { userId, postId });
      if (!post) continue;

      // Compute matched keyword
      const postText      = `${post.title ?? ""} ${post.body}`.toLowerCase();
      const matchedKeyword = keywords.find((k) => postText.includes(k)) ?? "—";

      // Fetch author karma (best-effort)
      let karma = "—";
      try {
        const res  = await fetch(
          `https://www.reddit.com/user/${encodeURIComponent(post.author)}/about.json`,
          { headers: { "User-Agent": "agentk/1.0 (tg-alerts)" } }
        );
        if (res.ok) {
          const json = await res.json();
          const k = (json?.data?.link_karma ?? 0) + (json?.data?.comment_karma ?? 0);
          karma = k >= 1000 ? (k / 1000).toFixed(1) + "k" : String(k);
        }
      } catch {
        // use fallback "—"
      }

      const title    = (post.title ?? post.body.slice(0, 120)).replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
      const text =
        `🔥 *${title}*\n\n` +
        `🔑 Keyword: \`${matchedKeyword}\`\n` +
        `📌 r/${post.subreddit}\n` +
        `⬆️ ${post.ups} upvotes · 💬 ${post.numComments} comments\n` +
        `👤 u/${post.author} · ${karma} karma`;

      try {
        await tgSend(botToken, chatId, text, post.url);
        await ctx.runMutation(internal.telegram.markAlerted, { userId, postId });
      } catch {
        console.error("[sendAlerts] failed to send for postId:", postId);
      }
    }
  },
});

// ── fetchForConnectedUsers — runs on cron, triggers doFetch for all connected users

export const fetchForConnectedUsers = internalAction({
  args: {},
  handler: async (ctx) => {
    const connected = await ctx.runQuery(internal.agentTokens.getConnectedUsers);
    for (const row of connected) {
      const settings = await ctx.runQuery(internal.userSettings.getSettingsInternal, {
        userId: row.userId,
      });
      if (!settings) continue;
      await ctx.scheduler.runAfter(0, internal.reddit.doFetch, { userId: row.userId });
    }
  },
});
```

- [ ] **Step 2: Verify**

```bash
npx convex dev --once
```

Expected: no TypeScript errors. Five new functions appear in the Convex dashboard: `telegram:telegramWebhook`, `telegram:sendAlerts`, `telegram:fetchForConnectedUsers`, `telegram:isAlerted`, `telegram:markAlerted`.

- [ ] **Step 3: Commit**

```bash
git add convex/telegram.ts
git commit -m "feat: telegram.ts — webhook, sendAlerts, fetchForConnectedUsers"
```

---

### Task 5: `convex/http.ts` — register the `/telegram` route

**Files:**
- Modify: `convex/http.ts`

- [ ] **Step 1: Add import and route to `convex/http.ts`**

Current file:
```ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
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
  handler: httpAction(async () => new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, svix-id, svix-timestamp, svix-signature",
    },
  })),
});

export default http;
```

Replace with:
```ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { dodoWebhookHandler } from "./webhookDodo";
import { telegramWebhook } from "./telegram";

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
  handler: httpAction(async () => new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, svix-id, svix-timestamp, svix-signature",
    },
  })),
});

http.route({
  path: "/telegram",
  method: "POST",
  handler: telegramWebhook,
});

export default http;
```

- [ ] **Step 2: Verify**

```bash
npx convex dev --once
```

Expected: no errors. The `/telegram` route is now live at `https://{your-deployment}.convex.site/telegram`.

- [ ] **Step 3: Commit**

```bash
git add convex/http.ts
git commit -m "feat: register POST /telegram route in http.ts"
```

---

### Task 6: `convex/reddit.ts` — schedule `sendAlerts` after `doFetch`

**Files:**
- Modify: `convex/reddit.ts` (lines 242–248 of `doFetch`)

- [ ] **Step 1: Update the tail of `doFetch` to schedule `sendAlerts`**

Find this block near the end of `doFetch` (currently around line 242):

```ts
    if (posts.length > 0) {
      await ctx.runMutation(internal.reddit.upsertResults, { userId, posts });
      console.log("[doFetch] inserted", posts.length, "posts");
    } else {
      console.log("[doFetch] no posts passed filters — DB cleared, nothing inserted");
    }
```

Replace with:

```ts
    if (posts.length > 0) {
      await ctx.runMutation(internal.reddit.upsertResults, { userId, posts });
      console.log("[doFetch] inserted", posts.length, "posts");
      await ctx.scheduler.runAfter(0, internal.telegram.sendAlerts, {
        userId,
        postIds: posts.map((p) => p.postId),
      });
    } else {
      console.log("[doFetch] no posts passed filters — DB cleared, nothing inserted");
    }
```

- [ ] **Step 2: Verify**

```bash
npx convex dev --once
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/reddit.ts
git commit -m "feat: schedule sendAlerts after doFetch inserts posts"
```

---

### Task 7: `convex/crons.ts` — add 30-minute auto-fetch cron

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Replace `convex/crons.ts`**

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup-expired-reddit-results",
  { hours: 1 },
  internal.reddit.deleteExpiredResults
);

crons.interval(
  "auto-fetch-for-telegram-users",
  { minutes: 30 },
  internal.telegram.fetchForConnectedUsers
);

export default crons;
```

- [ ] **Step 2: Verify**

```bash
npx convex dev --once
```

Expected: no errors. Both crons appear in the Convex dashboard under Crons.

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat: add 30-min cron to auto-fetch for Telegram-connected users"
```

---

### Task 8: `SettingsPanel.tsx` — `/token` command

**Files:**
- Modify: `components/dashboard/SettingsPanel.tsx`

- [ ] **Step 1: Add imports at the top of `SettingsPanel.tsx`**

Current imports (lines 1–8):
```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import logo from "@/app/logo.png";
```

Replace with:
```ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import logo from "@/app/logo.png";
```

- [ ] **Step 2: Add `COMMANDS` entry and hook inside the component**

Find:
```ts
const COMMANDS = ["/plan", "/billing", "/keywords", "/subreddits", "/logout"] as const;
```

Replace with:
```ts
const COMMANDS = ["/plan", "/billing", "/keywords", "/subreddits", "/token", "/logout"] as const;
```

Find inside `SettingsPanel` component, after `const settings = useQuery(api.userSettings.getUserSettings);`:
```ts
  const [msgs,     setMsgs]     = useState<Msg[]>([]);
```

Add the mutation hook on the line before that:
```ts
  const generateToken = useMutation(api.agentTokens.generateToken);
  const tokenRow      = useQuery(api.agentTokens.getToken);

  const [msgs,     setMsgs]     = useState<Msg[]>([]);
```

- [ ] **Step 3: Add `/token` handler in the `dispatch` function**

Find the `/logout` block in `dispatch`:
```ts
      } else if (cmd === "/logout") {
        addBot(`Signing you out…`);
        setTimeout(() => signOut(), 600);
```

Add the `/token` handler immediately before it:
```ts
      } else if (cmd === "/token") {
        if (tokenRow?.token) {
          const t = tokenRow.token;
          addBot(
            `Your Agentk Token:<br><br>` +
            `<span style="font-family:monospace;background:#F0EFED;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.08em">${t}</span>` +
            `&nbsp;<button onclick="navigator.clipboard.writeText('${t}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" ` +
            `style="font-size:10px;font-weight:700;color:#DF849D;background:none;border:none;cursor:pointer;font-family:inherit">Copy</button><br><br>` +
            `<em style="font-size:10px;color:#B2A28C">Open @AgentKBot on Telegram and paste this token to start receiving alerts.</em><br><br>` +
            `<button onclick="" id="regen-btn" style="font-size:10px;font-weight:700;color:#B2A28C;background:none;border:none;cursor:pointer;font-family:inherit">Regenerate token ↺</button>`
          );
        } else {
          generateToken().then(({ token }) => {
            addBot(
              `Your Agentk Token:<br><br>` +
              `<span style="font-family:monospace;background:#F0EFED;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:700;letter-spacing:0.08em">${token}</span>` +
              `&nbsp;<button onclick="navigator.clipboard.writeText('${token}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" ` +
              `style="font-size:10px;font-weight:700;color:#DF849D;background:none;border:none;cursor:pointer;font-family:inherit">Copy</button><br><br>` +
              `<em style="font-size:10px;color:#B2A28C">Open @AgentKBot on Telegram and paste this token to start receiving alerts.</em>`
            );
          });
        }

      } else if (cmd === "/logout") {
```

- [ ] **Step 4: Add `/token` to the command menu grid**

Find the menu grid entries array (currently 5 entries):
```ts
              {[
                ["/plan",       "View your plan"],
                ["/billing",    "Payment history"],
                ["/keywords",   "Your keywords"],
                ["/subreddits", "Your subreddits"],
                ["/logout",     "Sign out"],
              ].map(([cmd, desc]) => (
```

Replace with:
```ts
              {[
                ["/plan",       "View your plan"],
                ["/billing",    "Payment history"],
                ["/keywords",   "Your keywords"],
                ["/subreddits", "Your subreddits"],
                ["/token",      "Your alert token"],
                ["/logout",     "Sign out"],
              ].map(([cmd, desc]) => (
```

- [ ] **Step 5: Verify the dashboard compiles**

```bash
npx convex dev --once
```

Then start the dev server and open the dashboard Settings tab:
```bash
npm run dev
```

Open `http://localhost:3000/dashboard`, click the Settings tab, type `/token`. Expected: bot replies with the token in a monospace pill and a Copy button.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/SettingsPanel.tsx
git commit -m "feat: add /token command to SettingsPanel"
```

---

### Task 9: Set the env variable and register the Telegram webhook

**Files:** None — configuration only.

- [ ] **Step 1: Set the bot token in Convex**

Get your bot token from [@BotFather](https://t.me/BotFather) on Telegram (create the bot with `/newbot`, name it **Agentk**, username e.g. `@AgentkAlertsBot`).

```bash
npx convex env set TELEGRAM_BOT_TOKEN=<your-token-from-BotFather>
```

Expected: `Successfully set TELEGRAM_BOT_TOKEN`.

- [ ] **Step 2: Find your Convex deployment URL**

```bash
npx convex dashboard
```

Or check `.env.local` for `NEXT_PUBLIC_CONVEX_URL`. The HTTP action base URL is the same host with path `/telegram`, e.g.:
`https://happy-animal-123.convex.site/telegram`

- [ ] **Step 3: Register the webhook with Telegram**

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-deployment>.convex.site/telegram"
```

Expected response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

- [ ] **Step 4: Smoke test end-to-end**

1. Open Telegram, find your bot, send `/start`
2. Expected: `👋 Welcome to Agentk! Enter your Agentk Token...`
3. Go to dashboard → Settings → type `/token`, copy the token
4. Paste the token into Telegram
5. Expected: `✅ Connected! You'll receive Reddit alerts here...`
6. In the dashboard feed, click Reload to trigger a fetch
7. If posts match your keywords, a Telegram alert should arrive within seconds

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: Agentk Telegram bot — full implementation complete"
```
