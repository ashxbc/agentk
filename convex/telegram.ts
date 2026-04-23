import { httpAction, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ── Internal helpers ──────────────────────────────────────────────────────────

export const isAlerted = internalQuery({
  args: { userId: v.id("users"), postId: v.string(), platform: v.string() },
  handler: async (ctx, { userId, postId, platform }) => {
    const row = await ctx.db
      .query("alertedPosts")
      .withIndex("by_user_post_platform", (q) =>
        q.eq("userId", userId).eq("postId", postId).eq("platform", platform)
      )
      .first();
    return row !== null;
  },
});

export const markAlerted = internalMutation({
  args: { userId: v.id("users"), postId: v.string(), platform: v.string() },
  handler: async (ctx, { userId, postId, platform }) => {
    await ctx.db.insert("alertedPosts", { userId, postId, platform, alertedAt: Date.now() });
  },
});

export const countRecentAlerts = internalQuery({
  args: { userId: v.id("users"), platform: v.string(), since: v.number() },
  handler: async (ctx, { userId, platform, since }) => {
    const rows = await ctx.db
      .query("alertedPosts")
      .withIndex("by_user_platform_alerted", (q) =>
        q.eq("userId", userId).eq("platform", platform).gte("alertedAt", since)
      )
      .collect();
    return rows.length;
  },
});

// ── Telegram send helper ──────────────────────────────────────────────────────

async function tgSend(
  token: string,
  chatId: string,
  text: string,
  url?: string,
  extraButtons?: { text: string; callback_data: string }[]
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
  };
  const row1 = url ? [{ text: "🔗 Go to post", url }] : [];
  const row2 = extraButtons ?? [];
  if (row1.length > 0 || row2.length > 0) {
    const rows = [...(row1.length ? [row1] : []), ...(row2.length ? [row2] : [])];
    body.reply_markup = { inline_keyboard: rows };
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
    return false;
  }
  return true;
}

async function tgAnswerCallback(token: string, callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// ── Escape helper for MarkdownV2 ──────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[-_*[\]()~`>#+=|{}.!]/g, "\\$&");
}

// ── Register bot commands menu (idempotent) ───────────────────────────────────

async function setBotCommands(botToken: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start",   description: "Connect your Agentk account" },
        { command: "token",   description: "View your Agentk token" },
        { command: "account", description: "View your account info" },
        { command: "pause",   description: "Pause Reddit alerts" },
        { command: "resume",  description: "Resume Reddit alerts" },
      ],
    }),
  });
}

export const setupCommands = internalAction({
  args: {},
  handler: async () => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN not set");
    await setBotCommands(botToken);
  },
});

// ── Webhook — full command handling ──────────────────────────────────────────

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

  // ── callback_query (inline button press) ────────────────────────────────────
  const cbq = body?.callback_query;
  if (cbq) {
    const cbChatId = String(cbq.message?.chat?.id ?? cbq.from?.id ?? "");
    const cbData   = (cbq.data as string) ?? "";
    const cbId     = cbq.id as string;
    await tgAnswerCallback(botToken, cbId);

    if (cbData.startsWith("sl:")) {
      const postId = cbData.slice(3);
      const authed = await ctx.runQuery(internal.agentTokens.getByChat, { telegramChatId: cbChatId });
      if (!authed) return new Response("ok", { status: 200 });
      const lists = await ctx.runQuery(internal.leads.getListsForUser, { userId: authed.userId });
      if (lists.length === 0) {
        await tgSend(botToken, cbChatId, "You have no lead lists yet\\. Create one from the Agentk dashboard first\\.");
      } else {
        const listRows = lists.map((l) => [{ text: l.name, callback_data: `sv:${postId}:${l._id}` }]);
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cbChatId,
            text: "📋 *Choose a list to save this post:*",
            parse_mode: "MarkdownV2",
            reply_markup: { inline_keyboard: listRows },
          }),
        });
      }
      return new Response("ok", { status: 200 });
    }

    if (cbData.startsWith("sv:")) {
      const parts  = cbData.split(":");
      const postId = parts[1];
      const listId = parts.slice(2).join(":");
      const authed = await ctx.runQuery(internal.agentTokens.getByChat, { telegramChatId: cbChatId });
      if (!authed) return new Response("ok", { status: 200 });

      const post = await ctx.runQuery(internal.reddit.getPostByUserPost, { userId: authed.userId, postId });
      if (!post) {
        await tgSend(botToken, cbChatId, "❌ Post not found\\.");
        return new Response("ok", { status: 200 });
      }

      const settings     = await ctx.runQuery(internal.userSettings.getSettingsInternal, { userId: authed.userId });
      const keywords     = settings?.keywords.map((k) => k.toLowerCase()) ?? [];
      const stored       = (post as any).matchedKeywords ?? [];
      const postText     = `${(post as any).title ?? ""} ${post.body}`.toLowerCase();
      const matchedQuery = stored.length > 0 ? stored.join(", ") : (keywords.find((k: string) => postText.includes(k)) ?? "—");

      await ctx.runMutation(internal.leads.addLeadInternal, {
        userId:      authed.userId,
        listId:      listId as any,
        postId,
        source:      "reddit_normal",
        title:       (post as any).title ?? post.body.slice(0, 120),
        url:         post.url,
        subreddit:   post.subreddit,
        author:      post.author,
        ups:         post.ups,
        numComments: post.numComments,
        createdUtc:  post.createdUtc,
        query:       matchedQuery,
      });

      await tgSend(botToken, cbChatId, "✅ Post saved to your lead list\\!");
      return new Response("ok", { status: 200 });
    }

    return new Response("ok", { status: 200 });
  }

  const message = body?.message;
  if (!message) return new Response("ok", { status: 200 });

  const chatId      = String(message.chat?.id ?? "");
  const text        = (message.text ?? "").trim();
  const tgUsername  = message.from?.username as string | undefined;

  if (!chatId || !text) return new Response("ok", { status: 200 });

  // Resolve command base (strip @BotName suffix if present)
  const rawCmd = text.split("@")[0].toLowerCase();

  // Check authentication state
  const authed = await ctx.runQuery(internal.agentTokens.getByChat, { telegramChatId: chatId });

  // ── /start ───────────────────────────────────────────────────────────────────
  if (rawCmd === "/start") {
    if (authed) {
      await tgSend(botToken, chatId,
        "✅ You're already connected\\! Use /account to view your info or /token to see your token\\."
      );
    } else {
      await tgSend(botToken, chatId,
        "👋 Welcome to *Agentk*\\!\n\nEnter your Agentk Token to connect your alerts:"
      );
    }
    return new Response("ok", { status: 200 });
  }

  // ── /token ───────────────────────────────────────────────────────────────────
  if (rawCmd === "/token") {
    if (!authed) {
      await tgSend(botToken, chatId,
        "⚠️ You're not connected yet\\. Use /start to get started\\."
      );
      return new Response("ok", { status: 200 });
    }
    await tgSend(botToken, chatId,
      `Your Agentk Token:\n\n\`${esc(authed.token)}\``
    );
    return new Response("ok", { status: 200 });
  }

  // ── /account ─────────────────────────────────────────────────────────────────
  if (rawCmd === "/account") {
    if (!authed) {
      await tgSend(botToken, chatId,
        "⚠️ You're not connected yet\\. Use /start to get started\\."
      );
      return new Response("ok", { status: 200 });
    }
    const user      = await ctx.runQuery(internal.users.getUserById, { userId: authed.userId });
    const settings  = await ctx.runQuery(internal.userSettings.getSettingsInternal, { userId: authed.userId });
    const capLine   = settings?.alertsPerHour
      ? `🔔 Max alerts/hour: ${settings.alertsPerHour}`
      : `🔔 Max alerts/hour: Not set\\. Configure it from the website settings\\.`;
    const emailLine = `📧 Email: ${esc(user?.email ?? "—")}`;
    const nameLine  = user?.name ? `👤 Name: ${esc(user.name)}` : null;
    const tgLine    = authed.telegramUsername ? `💬 Telegram: @${esc(authed.telegramUsername)}` : null;
    const lines     = [emailLine, nameLine, tgLine, capLine].filter(Boolean).join("\n");
    await tgSend(botToken, chatId, `*Your Account*\n\n${lines}`);
    return new Response("ok", { status: 200 });
  }

  // ── /pause ───────────────────────────────────────────────────────────────────
  if (rawCmd === "/pause") {
    if (!authed) {
      await tgSend(botToken, chatId, "⚠️ You're not connected yet\\. Use /start to get started\\.");
      return new Response("ok", { status: 200 });
    }
    await ctx.runMutation(internal.agentTokens.setPaused, { tokenId: authed._id, paused: true });
    await tgSend(botToken, chatId, "⏸ Alerts paused\\. Use /resume to turn them back on\\.");
    return new Response("ok", { status: 200 });
  }

  // ── /resume ──────────────────────────────────────────────────────────────────
  if (rawCmd === "/resume") {
    if (!authed) {
      await tgSend(botToken, chatId, "⚠️ You're not connected yet\\. Use /start to get started\\.");
      return new Response("ok", { status: 200 });
    }
    await ctx.runMutation(internal.agentTokens.setPaused, { tokenId: authed._id, paused: false });
    await tgSend(botToken, chatId, "▶️ Alerts resumed\\! You'll start receiving Reddit alerts again\\.");
    return new Response("ok", { status: 200 });
  }

  // ── Unknown command ───────────────────────────────────────────────────────────
  if (text.startsWith("/")) {
    await tgSend(botToken, chatId,
      "❌ Invalid command\\. Available: /start, /token, /account, /pause, /resume"
    );
    return new Response("ok", { status: 200 });
  }

  // ── Non-command text ──────────────────────────────────────────────────────────
  // If already authenticated, ignore silently
  if (authed) return new Response("ok", { status: 200 });

  // Otherwise treat as token attempt
  const candidate = text.toUpperCase();
  const row = await ctx.runQuery(internal.agentTokens.getByToken, { token: candidate });

  if (!row) {
    await tgSend(botToken, chatId,
      "❌ Invalid token\\. Try again or get yours from the Agentk dashboard → Settings\\."
    );
    return new Response("ok", { status: 200 });
  }

  await ctx.runMutation(internal.agentTokens.bindChatId, {
    tokenId:          row._id,
    telegramChatId:   chatId,
    telegramUsername: tgUsername,
  });

  const user      = await ctx.runQuery(internal.users.getUserById, { userId: row.userId });
  const emailLine = user?.email ? `\n\n📧 ${esc(user.email)}` : "";

  await tgSend(botToken, chatId,
    `✅ *Connected\\!* You'll receive Reddit alerts here\\.${emailLine}\n\nUse /account to view your info or /token to manage your token\\.`
  );

  return new Response("ok", { status: 200 });
});

// ── notifyAccountDeleted — sent when account is deleted ──────────────────────

export const notifyAccountDeleted = internalAction({
  args: { chatId: v.string() },
  handler: async (_ctx, { chatId }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;
    await tgSend(
      botToken,
      chatId,
      "⚠️ *Your Agentk account has been deleted\\.*\n\nThis Telegram session has been reset\\.\n\nIf you have a new account, send your new Agentk token to reconnect:"
    );
  },
});

// ── sendAlerts — scheduled after each doFetch ─────────────────────────────────

export const sendAlerts = internalAction({
  args: {
    userId:  v.id("users"),
    postIds: v.array(v.string()),
  },
  handler: async (ctx, { userId, postIds }) => {
    const tag = `user=${userId}`;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) { console.warn(`[TG]     ${tag} | TELEGRAM_BOT_TOKEN not set`); return; }

    const agentToken = await ctx.runQuery(internal.agentTokens.getByUser, { userId });
    if (!agentToken?.telegramChatId) { console.log(`[TG]     ${tag} | skipped: no telegramChatId`); return; }
    if (agentToken.paused) { console.log(`[TG]     ${tag} | skipped: alerts paused`); return; }

    const chatId   = agentToken.telegramChatId;
    const settings = await ctx.runQuery(internal.userSettings.getSettingsInternal, { userId });
    const keywords  = settings?.keywords.map((k) => k.toLowerCase()) ?? [];

    const ONE_HOUR_MS    = 60 * 60 * 1000;
    const THIRTY_MIN_SEC = 30 * 60;
    const cap = settings?.alertsPerHour ?? 0;
    let sentThisRun = 0;
    if (cap > 0) {
      const recentCount = await ctx.runQuery(internal.telegram.countRecentAlerts, {
        userId, platform: "telegram", since: Date.now() - ONE_HOUR_MS,
      });
      if (recentCount >= cap) { console.log(`[TG]     ${tag} | skipped: hourly cap ${cap} reached (${recentCount}/${cap})`); return; }
      sentThisRun = recentCount;
    }

    console.log(`[TG]     ${tag} | processing ${postIds.length} candidate postIds`);
    let skippedAlerted = 0, skippedMissing = 0, skippedStale = 0, sent = 0, failed = 0;

    for (const postId of postIds) {
      if (cap > 0 && sentThisRun >= cap) break;
      const alerted: boolean = await ctx.runQuery(internal.telegram.isAlerted, { userId, postId, platform: "telegram" });
      if (alerted) { skippedAlerted++; continue; }

      // Try the normal table first, then the isolated AI table.
      const normalPost = await ctx.runQuery(internal.reddit.getPostByUserPost, { userId, postId });
      const aiPost = normalPost
        ? null
        : await ctx.runQuery(internal.reddit.getAiPostByUserPost, { userId, postId });
      const post = normalPost ?? aiPost;
      if (!post) { skippedMissing++; continue; }

      // Skip posts older than 30 minutes (Reddit post age, not fetch time)
      if ((Date.now() / 1000) - post.createdUtc > THIRTY_MIN_SEC) { skippedStale++; continue; }

      // Compute the matched query. AI posts use matchedIntents (normalized
      // query strings); normal posts use matchedKeywords with a substring
      // fallback for rows written before that column existed.
      let matchedQuery = "—";
      if (aiPost) {
        const intents = aiPost.matchedIntents ?? [];
        if (intents.length > 0) matchedQuery = intents.join(", ");
      } else if (normalPost) {
        const stored = normalPost.matchedKeywords ?? [];
        if (stored.length > 0) {
          matchedQuery = stored.join(", ");
        } else {
          const postText = `${normalPost.title ?? ""} ${normalPost.body}`.toLowerCase();
          matchedQuery = keywords.find((k) => postText.includes(k)) ?? "—";
        }
      }

      // Fetch author karma (best-effort)
      let karma = "—";
      try {
        const proxyBase = process.env.REDDIT_PROXY_URL?.replace(/\/$/, "");
        const proxyKey  = process.env.REDDIT_PROXY_SECRET;
        const endpoint  = proxyBase
          ? `${proxyBase}/user/${encodeURIComponent(post.author)}/about`
          : `https://www.reddit.com/user/${encodeURIComponent(post.author)}/about.json`;
        const headers: Record<string, string> = proxyBase && proxyKey
          ? { "X-Api-Key": proxyKey }
          : { "User-Agent": "agentk/1.0 (tg-alerts)" };
        const res = await fetch(endpoint, { headers });
        if (res.ok) {
          const json = await res.json();
          const k = (json?.data?.link_karma ?? 0) + (json?.data?.comment_karma ?? 0);
          karma = k >= 1000 ? (k / 1000).toFixed(1) + "k" : String(k);
        }
      } catch {
        // use fallback "—"
      }

      const title = esc(post.title ?? post.body.slice(0, 120));
      const alertText =
        `🔥 *${title}*\n\n` +
        `🔑 Query: \`${esc(matchedQuery)}\`\n` +
        `📌 r/${esc(post.subreddit)}\n` +
        `⬆️ ${esc(String(post.ups))} upvotes · 💬 ${esc(String(post.numComments))} comments\n` +
        `👤 u/${esc(post.author)} · ${esc(karma)} karma`;

      const saveBtn = normalPost
        ? [{ text: "📋 Save to list", callback_data: `sl:${postId}` }]
        : undefined;
      const ok = await tgSend(botToken, chatId, alertText, post.url, saveBtn);
      if (ok) {
        await ctx.runMutation(internal.telegram.markAlerted, { userId, postId, platform: "telegram" });
        sentThisRun++;
        sent++;
      } else {
        failed++;
      }
    }

    console.log(`[TG]     ${tag} | sent=${sent} failed=${failed} already-alerted=${skippedAlerted} missing-post=${skippedMissing} >30min=${skippedStale}`);
  },
});

