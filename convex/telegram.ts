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
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
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
    return false;
  }
  return true;
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

    const thirtyMinAgoSec = (Date.now() / 1000) - 1800;

    for (const postId of postIds) {
      const alerted: boolean = await ctx.runQuery(internal.telegram.isAlerted, { userId, postId });
      if (alerted) continue;

      const post = await ctx.runQuery(internal.reddit.getPostByUserPost, { userId, postId });
      if (!post) continue;

      // Only alert for posts newer than 30 minutes
      if (post.createdUtc < thirtyMinAgoSec) continue;

      // Compute matched keyword
      const postText       = `${post.title ?? ""} ${post.body}`.toLowerCase();
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

      const title = (post.title ?? post.body.slice(0, 120))
        .replace(/[-_*[\]()~`>#+=|{}.!]/g, "\\$&");
      const alertText =
        `🔥 *${title}*\n\n` +
        `🔑 Keyword: \`${matchedKeyword}\`\n` +
        `📌 r/${post.subreddit}\n` +
        `⬆️ ${post.ups} upvotes · 💬 ${post.numComments} comments\n` +
        `👤 u/${post.author} · ${karma} karma`;

      const sent = await tgSend(botToken, chatId, alertText, post.url);
      if (sent) {
        await ctx.runMutation(internal.telegram.markAlerted, { userId, postId });
      }
    }
  },
});

// ── fetchForConnectedUsers — runs on cron ─────────────────────────────────────

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
