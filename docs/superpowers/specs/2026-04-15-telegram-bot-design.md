# Agentk Telegram Bot — Implementation Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A Telegram bot that delivers real-time Reddit post alerts to users authenticated via a unique 12-character Agentk Token.

**Architecture:** Convex HTTP action handles the Telegram webhook (same pattern as existing Dodo webhook). Alert dispatch is an `internalAction` scheduled after each `doFetch`. Token-to-chatId mapping lives in a new `agentTokens` table. Duplicate alerts are prevented via an `alertedPosts` table.

**Tech Stack:** Convex (HTTP actions, internalActions, internalMutations, internalQueries), Telegram Bot API (webhook mode, `sendMessage` with inline keyboard), Next.js dashboard (SettingsPanel `/token` command).

---

## Schema

### New table: `agentTokens`
```ts
agentTokens: defineTable({
  userId:         v.id("users"),
  token:          v.string(),           // 12-char alphanumeric, unique
  telegramChatId: v.optional(v.string()), // set when user connects bot
}).index("by_user",  ["userId"])
  .index("by_token", ["token"])
```

### New table: `alertedPosts`
```ts
alertedPosts: defineTable({
  userId:    v.id("users"),
  postId:    v.string(),
  alertedAt: v.number(),
}).index("by_user_post", ["userId", "postId"])
```

---

## Files

| File | Action | Responsibility |
|------|--------|----------------|
| `convex/schema.ts` | Modify | Add `agentTokens`, `alertedPosts` tables |
| `convex/agentTokens.ts` | Create | Token generation, lookup, chatId binding, internal queries |
| `convex/telegram.ts` | Create | HTTP webhook handler, alert dispatch internalAction |
| `convex/http.ts` | Modify | Register `POST /telegram` route |
| `convex/reddit.ts` | Modify | Schedule `telegram.sendAlerts` after `doFetch` inserts |
| `convex/crons.ts` | Modify | Add periodic Reddit fetch cron for all users with connected bots |
| `components/dashboard/SettingsPanel.tsx` | Modify | Add `/token` command |

---

## Environment Variables

```
TELEGRAM_BOT_TOKEN=   # from @BotFather
```

Set in Convex dashboard: `npx convex env set TELEGRAM_BOT_TOKEN=...`

---

## Component: `convex/agentTokens.ts`

### `generateToken` — mutation (authenticated)
- Gets `userId` via `getAuthUserId`
- Generates 12-char token: `Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8)` uppercased
- Upserts `agentTokens` row (replaces existing token, clears `telegramChatId`)
- Returns `{ token }`

### `getToken` — query (authenticated)
- Returns the user's current `agentTokens` row or `null`

### `getByToken` — internalQuery
- Args: `{ token: string }`
- Returns the `agentTokens` row matching the token or `null`

### `bindChatId` — internalMutation
- Args: `{ tokenId: id("agentTokens"), telegramChatId: string }`
- Patches the row with `telegramChatId`

### `getConnectedUsers` — internalQuery
- Returns all `agentTokens` rows where `telegramChatId` is set (for cron-based fetching)

---

## Component: `convex/telegram.ts`

### `telegramWebhook` — httpAction
Registered at `POST /telegram`. Handles two message types:

**`/start` command:**
```
Bot reply: "👋 Welcome to Agentk!\n\nEnter your Agentk Token to connect your alerts:"
```

**Any other text (token attempt):**
- Calls `getByToken` with the message text (trimmed, uppercased)
- If not found: `"❌ Invalid token. Get yours from the Agentk dashboard → Settings → /token"`
- If found but already has a different chatId: rebinds to new chatId (user switched accounts)
- If valid: calls `bindChatId`, replies:
```
"✅ Connected! You'll receive Reddit alerts here whenever new posts match your keywords."
```

Always returns `200 OK` to Telegram immediately (Telegram requires this).

### `sendAlerts` — internalAction
- Args: `{ userId: id("users"), postIds: string[] }`
- Fetches the user's `agentTokens` row — if no `telegramChatId`, returns early
- Fetches user settings (for keywords, to compute keyword match)
- For each `postId`:
  - Checks `alertedPosts` — skips if already alerted
  - Fetches the full post from `redditResults`
  - Fetches author karma from Reddit API: `https://www.reddit.com/user/{author}/about.json`
  - Computes which keyword matched (first keyword found in `title + body`)
  - Sends Telegram message (see Alert Format below)
  - Inserts into `alertedPosts`

### Alert Message Format
```
🔥 *{title}*

🔑 Keyword: `{matchedKeyword}`
📌 r/{subreddit}
⬆️ {ups} upvotes · 💬 {numComments} comments
👤 u/{author} · {karma} karma
```
Inline keyboard button: `[ 🔗 Go to post ]` → opens `url`

Sent via `POST https://api.telegram.org/bot{TOKEN}/sendMessage` with `parse_mode: "Markdown"`.

---

## Component: `convex/reddit.ts` — modification

After `doFetch` calls `upsertResults`, schedule `sendAlerts`:

```ts
const insertedPostIds = posts.map(p => p.postId);
if (insertedPostIds.length > 0) {
  await ctx.scheduler.runAfter(0, internal.telegram.sendAlerts, {
    userId,
    postIds: insertedPostIds,
  });
}
```

---

## Component: `convex/crons.ts` — modification

Add a cron that auto-fetches for all users who have connected their Telegram bot (so alerts fire without needing a manual dashboard reload):

```ts
crons.interval(
  "auto-fetch-for-telegram-users",
  { minutes: 30 },
  internal.telegram.fetchForConnectedUsers
);
```

### `fetchForConnectedUsers` — internalAction in `convex/telegram.ts`
- Calls `getConnectedUsers` to get all users with a bound `telegramChatId`
- For each: checks their `userSettings` exists, calls `internal.reddit.doFetch`

---

## Component: `convex/http.ts` — modification

```ts
import { telegramWebhook } from "./telegram";

http.route({
  path: "/telegram",
  method: "POST",
  handler: telegramWebhook,
});
```

---

## Component: `SettingsPanel.tsx` — modification

Add `/token` to the `COMMANDS` array and handle it in `dispatch`:

**Command menu entry:** `/token` — "Your alert token"

**Handler:**
- Calls `generateToken` mutation on first use, or `getToken` query if token exists
- Bot message:
```html
Your Agentk Token:<br>
<code style="...monospace pill...">{token}</code><br>
<button onclick="navigator.clipboard.writeText('{token}')">Copy</button><br><br>
<em>Open @AgentKBot on Telegram and paste this token to start alerts.</em>
```
- Shows a "Regenerate" option that calls `generateToken` again (warns it will disconnect existing Telegram)

---

## Telegram Webhook Registration

After deploying, register the webhook once:
```
curl https://api.telegram.org/bot{TOKEN}/setWebhook \
  -d url=https://{convex-deployment}.convex.site/telegram
```

---

## Error Handling

- Telegram API failures (network, 429 rate limit): log and skip — do not retry in the same action to avoid blocking other alerts
- Reddit karma API failure: use `"—"` as fallback, do not block alert send
- Invalid/expired token on `/start`: clear message, no crash
- User has no `userSettings`: skip alert dispatch silently

---

## Out of Scope

- Inline bot commands (e.g., `/stop`, `/settings`) — alerts-only bot
- Per-alert user preferences (mute, filter by subreddit from TG) — managed from dashboard
- Message threading or conversation history in Telegram
