import { action, internalAction, mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Users created before this date are auto-verified (existing users).
const VERIFICATION_CUTOFF = Date.UTC(2026, 3, 23); // April 23 2026

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < 48; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const getVerificationStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("userVerification")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return { verified: row?.verified === true };
  },
});

export const hasPendingToken = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const row = await ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return row !== null && row.expiresAt > Date.now();
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

// Called once on dashboard mount. Auto-verifies Google users and users
// who existed before the verification feature was deployed.
export const autoVerifyUser = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;

    const existing = await ctx.db
      .query("userVerification")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing?.verified) return true;

    const user = await ctx.db.get(userId);
    if (!user) return false;

    const isOldUser  = user._creationTime < VERIFICATION_CUTOFF;

    if (isOldUser) {
      if (existing) {
        await ctx.db.patch(existing._id, { verified: true, verifiedAt: Date.now() });
      } else {
        await ctx.db.insert("userVerification", { userId, verified: true, verifiedAt: Date.now() });
      }
      return true;
    }
    return false;
  },
});

// Creates a token and schedules the email action.
export const requestVerificationEmail = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const verRow = await ctx.db
      .query("userVerification")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (verRow?.verified) return;

    const user = await ctx.db.get(userId) as any;
    if (!user?.email) return;

    // Delete any existing tokens for this user
    const old = await ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const t of old) await ctx.db.delete(t._id);

    const token = generateToken();
    await ctx.db.insert("emailVerificationTokens", {
      userId,
      token,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });

    await ctx.scheduler.runAfter(0, internal.emailVerification.sendEmailAction, {
      email: user.email,
      token,
    });
  },
});

// Validates a token from the verify-email page and marks the user verified.
// Does not require auth — the token itself identifies the user.
export const verifyEmailToken = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const record = await ctx.db
      .query("emailVerificationTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!record) return { success: false, reason: "invalid" as const };
    if (record.expiresAt < Date.now()) {
      await ctx.db.delete(record._id);
      return { success: false, reason: "expired" as const };
    }

    const existing = await ctx.db
      .query("userVerification")
      .withIndex("by_user", (q) => q.eq("userId", record.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { verified: true, verifiedAt: Date.now() });
    } else {
      await ctx.db.insert("userVerification", {
        userId: record.userId,
        verified: true,
        verifiedAt: Date.now(),
      });
    }

    await ctx.db.delete(record._id);
    return { success: true };
  },
});

// ── Internal action ───────────────────────────────────────────────────────────

export const sendEmailAction = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, { email, token }) => {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const verifyUrl = `https://tryagentk.com/verify-email?token=${token}`;

    await resend.emails.send({
      from: "AgentK <noreply@tryagentk.com>",
      to: email,
      subject: "Verify your AgentK email",
      html: `
        <div style="font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:48px 32px;background:#FDF7EF;border-radius:16px;">
          <div style="text-align:center;margin-bottom:36px;">
            <span style="font-size:22px;font-weight:900;color:#DF849D;letter-spacing:-0.5px;">agentK</span>
          </div>
          <h1 style="font-size:20px;font-weight:800;color:#191918;margin:0 0 10px;letter-spacing:-0.3px;">Verify your email</h1>
          <p style="font-size:14px;color:#62584F;line-height:1.7;margin:0 0 28px;">
            Click the button below to verify your email address. The link expires in 24 hours.
          </p>
          <a href="${verifyUrl}"
            style="display:inline-block;background:linear-gradient(135deg,#ff9472,#f2709c);color:#fff;font-weight:800;font-size:14px;padding:13px 28px;border-radius:12px;text-decoration:none;letter-spacing:-0.2px;">
            Verify my email
          </a>
          <p style="font-size:11px;color:#B2A28C;margin-top:32px;line-height:1.6;">
            If you did not sign up for AgentK, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  },
});
