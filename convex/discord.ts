import { httpAction, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2)
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

async function verifySignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    const alg = { name: "Ed25519" } as AlgorithmIdentifier;
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey).buffer as ArrayBuffer,
      alg,
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      alg,
      key,
      hexToBytes(signature).buffer as ArrayBuffer,
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

async function discordApi(
  token: string,
  path: string,
  method = "GET",
  body?: unknown
): Promise<any> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      "Authorization": `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    console.error(`[Discord] ${method} ${path}: ${res.status}`, await res.text());
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function registerCommands(token: string, appId: string) {
  await discordApi(token, `/applications/${appId}/commands`, "PUT", [
    { name: "start",   description: "Connect your Agentk account" },
    { name: "token",   description: "View your Agentk token" },
    { name: "account", description: "View your account info" },
    { name: "pause",   description: "Pause Reddit alerts" },
    { name: "resume",  description: "Resume Reddit alerts" },
  ]);
}

async function openDmChannel(token: string, userId: string): Promise<string | null> {
  const data = await discordApi(token, "/users/@me/channels", "POST", { recipient_id: userId });
  return data?.id ?? null;
}

async function sendDmMessage(token: string, channelId: string, content?: string, embeds?: object[], components?: object[]): Promise<boolean> {
  const body: Record<string, unknown> = {};
  if (content)    body.content    = content;
  if (embeds)     body.embeds     = embeds;
  if (components) body.components = components;
  const result = await discordApi(token, `/channels/${channelId}/messages`, "POST", body);
  return result !== null;
}

function interaction(content: string, ephemeral = false) {
  return new Response(
    JSON.stringify({ type: 4, data: { content, flags: ephemeral ? 64 : 0 } }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function modal(customId: string, title: string, components: object[]) {
  return new Response(
    JSON.stringify({ type: 9, data: { custom_id: customId, title, components } }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export const setupCommands = internalAction({
  args: {},
  handler: async () => {
    const token = process.env.DISCORD_BOT_TOKEN;
    const appId = process.env.DISCORD_APPLICATION_ID;
    if (!token || !appId) throw new Error("DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID not set");
    await registerCommands(token, appId);
  },
});

// ── Webhook ───────────────────────────────────────────────────────────────────

export const discordWebhook = httpAction(async (ctx, request) => {
  const pubKey = process.env.DISCORD_PUBLIC_KEY;
  if (!pubKey) {
    console.error("[Discord] DISCORD_PUBLIC_KEY not set");
    return new Response("Not configured", { status: 500 });
  }

  const sig       = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";
  const bodyText  = await request.text();

  if (!await verifySignature(pubKey, sig, timestamp, bodyText)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const body = JSON.parse(bodyText);

  // PING — Discord sends this to verify the endpoint
  if (body.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const appId    = process.env.DISCORD_APPLICATION_ID;
  if (!botToken || !appId) {
    console.error("[Discord] DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID not set");
    return interaction("Bot is not fully configured yet.", true);
  }

  // Slash command
  if (body.type === 2) {
    const cmd      = body.data?.name as string;
    const userId   = (body.member?.user ?? body.user)?.id  as string;
    const username = (body.member?.user ?? body.user)?.username as string | undefined;

    const authed = await ctx.runQuery(internal.agentTokens.getByDiscordUser, { discordUserId: userId });

    if (cmd === "start") {
      if (authed) {
        return interaction("✅ You're already connected! Use `/token` to see your token or `/account` for account info.");
      }
      return modal("connect_token", "Connect Agentk Account", [
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: "token_input",
            label: "Agentk Token",
            style: 1,
            placeholder: "Paste your token from the Agentk dashboard → Settings",
            required: true,
            min_length: 6,
            max_length: 32,
          }],
        },
      ]);
    }

    if (cmd === "token") {
      if (!authed) return interaction("⚠️ Not connected yet. Use `/start` to connect.", true);
      return interaction(`Your Agentk token:\n\`\`\`\n${authed.token}\n\`\`\``, true);
    }

    if (cmd === "account") {
      if (!authed) return interaction("⚠️ Not connected yet. Use `/start` to connect.", true);
      const user  = await ctx.runQuery(internal.users.getUserById, { userId: authed.userId });
      const lines = [
        user?.email ? `📧 **Email:** ${user.email}` : null,
        user?.name  ? `👤 **Name:** ${user.name}`   : null,
        authed.discordUsername ? `💬 **Discord:** @${authed.discordUsername}` : null,
      ].filter(Boolean).join("\n");
      return interaction(`**Your Account**\n\n${lines}`, true);
    }

    if (cmd === "pause") {
      if (!authed) return interaction("⚠️ Not connected yet. Use `/start` to connect.", true);
      await ctx.runMutation(internal.agentTokens.setPaused, { tokenId: authed._id, paused: true });
      return interaction("⏸ Alerts paused. Use `/resume` to turn them back on.", true);
    }

    if (cmd === "resume") {
      if (!authed) return interaction("⚠️ Not connected yet. Use `/start` to connect.", true);
      await ctx.runMutation(internal.agentTokens.setPaused, { tokenId: authed._id, paused: false });
      return interaction("▶️ Alerts resumed! You'll start receiving Reddit alerts again.", true);
    }
  }

  // Component interaction (button press)
  if (body.type === 3) {
    const customId    = body.data?.custom_id as string;
    const discordUser = (body.member?.user ?? body.user)?.id as string;

    return new Response("ok", { status: 200 });
  }

  // Modal submit
  if (body.type === 5 && body.data?.custom_id === "connect_token") {
    const userId   = (body.member?.user ?? body.user)?.id       as string;
    const username = (body.member?.user ?? body.user)?.username as string | undefined;
    const tokenVal = (body.data?.components?.[0]?.components?.[0]?.value ?? "").trim().toUpperCase();

    const row = await ctx.runQuery(internal.agentTokens.getByToken, { token: tokenVal });
    if (!row) {
      return interaction("❌ Invalid token. Get yours from the Agentk dashboard → Settings.", true);
    }

    const dmChannelId = await openDmChannel(botToken, userId);
    if (!dmChannelId) {
      return interaction("❌ Couldn't open a DM with you. Make sure your DMs are open, then try again.", true);
    }

    await ctx.runMutation(internal.agentTokens.bindDiscordUser, {
      tokenId:          row._id,
      discordUserId:    userId,
      discordChannelId: dmChannelId,
      discordUsername:  username,
    });

    const user      = await ctx.runQuery(internal.users.getUserById, { userId: row.userId });
    const emailLine = user?.email ? `\n📧 ${user.email}` : "";

    await sendDmMessage(
      botToken,
      dmChannelId,
      `✅ **Connected to Agentk!** You'll receive Reddit keyword alerts here.${emailLine}\n\nUse \`/account\` to view your info or \`/token\` to manage your token.`
    );

    return interaction("✅ Connected! Check your DMs — alerts will be delivered there.", true);
  }

  return new Response("ok", { status: 200 });
});

// ── notifyDiscordAccountDeleted ───────────────────────────────────────────────

export const notifyDiscordAccountDeleted = internalAction({
  args: { discordChannelId: v.string() },
  handler: async (_ctx, { discordChannelId }) => {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) return;
    await sendDmMessage(
      botToken,
      discordChannelId,
      "⚠️ **Your Agentk account has been deleted.**\n\nThis Discord session has been reset. If you have a new account, use `/start` to reconnect."
    );
  },
});

// ── sendDiscordAlerts ─────────────────────────────────────────────────────────

export const sendDiscordAlerts = internalAction({
  args: {
    userId:  v.id("users"),
    postIds: v.array(v.string()),
  },
  handler: async (_ctx, _args) => {
    // Alert sending removed in v2 — globalFetch handles matching directly
  },
});
