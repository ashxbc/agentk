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
      ],
    }),
  });
}

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

  const message = body?.message;
  if (!message) return new Response("ok", { status: 200 });

  const chatId      = String(message.chat?.id ?? "");
  const text        = (message.text ?? "").trim();
  const tgUsername  = message.from?.username as string | undefined;

  if (!chatId || !text) return new Response("ok", { status: 200 });

  // Register commands menu (idempotent — Telegram caches this)
  await setBotCommands(botToken);

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
    const user = await ctx.runQuery(internal.users.getUserById, { userId: authed.userId });
    const emailLine = `📧 Email: ${esc(user?.email ?? "—")}`;
    const nameLine  = user?.name ? `👤 Name: ${esc(user.name)}` : null;
    const tgLine    = authed.telegramUsername ? `💬 Telegram: @${esc(authed.telegramUsername)}` : null;
    const lines     = [emailLine, nameLine, tgLine].filter(Boolean).join("\n");
    await tgSend(botToken, chatId, `*Your Account*\n\n${lines}`);
    return new Response("ok", { status: 200 });
  }

  // ── Unknown command ───────────────────────────────────────────────────────────
  if (text.startsWith("/")) {
    await tgSend(botToken, chatId,
      "❌ Invalid command\\. Available: /start, /token, /account"
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
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return;

    const agentToken = await ctx.runQuery(internal.agentTokens.getByUser, { userId });
    if (!agentToken?.telegramChatId) return;

    const chatId   = agentToken.telegramChatId;
    const settings = await ctx.runQuery(internal.userSettings.getSettingsInternal, { userId });
    const keywords  = settings?.keywords.map((k) => k.toLowerCase()) ?? [];

    const thirtyMinAgoSec = (Date.now() / 1000) - 1800;

    for (const postId of postIds) {
      const alerted: boolean = await ctx.runQuery(internal.telegram.isAlerted, { userId, postId, platform: "telegram" });
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
        await ctx.runMutation(internal.telegram.markAlerted, { userId, postId, platform: "telegram" });
      }
    }
  },
});

