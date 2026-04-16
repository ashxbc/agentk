import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Webhook } from "standardwebhooks";
import { Id } from "./_generated/dataModel";
// Maps a Dodo product ID env var to our plan/interval labels.
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

  // Read raw body before parsing — standardwebhooks needs the raw string
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

  // Signature verified — process synchronously, catch errors to always return 200
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

  // ── Subscription events ──────────────────────────────────────
  if (type.startsWith("subscription.")) {
    const sub = data;
    const dodoSubscriptionId = sub.subscription_id as string;
    const dodoCustomerId     = sub.customer?.customer_id as string | undefined;
    const dodoProductId      = sub.product_id as string;
    const status             = sub.status as string;
    const cancelAtPeriodEnd  = (sub.cancel_at_period_end as boolean) ?? false;

    // Normalise timestamps: Dodo may send Unix seconds or ISO strings
    const toMs = (v: any): number => {
      const ms = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : new Date(String(v)).getTime();
      return Number.isNaN(ms) ? Date.now() : ms;
    };

    const currentPeriodStart = toMs(sub.current_period_start ?? Date.now());
    const currentPeriodEnd   = toMs(sub.current_period_end   ?? Date.now());

    const planInterval = productIdToPlanInterval(dodoProductId);
    if (!planInterval) {
      console.warn(`[webhook] Unknown product ID: ${dodoProductId} — skipping`);
      return;
    }

    // Validate status is one we recognise
    const validStatuses = ["active", "on_hold", "cancelled", "expired", "failed"] as const;
    type SubStatus = typeof validStatuses[number];
    if (!validStatuses.includes(status as SubStatus)) {
      console.warn(`[webhook] Unrecognised subscription status: ${status} — skipping event`);
      return;
    }
    const normStatus = status as SubStatus;

    // Resolve userId — tries dodoCustomerId first, falls back to email
    const customerEmail = sub.customer?.email as string | undefined;
    const userId = await resolveUserId(ctx, dodoCustomerId, customerEmail);
    if (!userId) {
      console.warn(`[webhook] No user found for customerId: ${dodoCustomerId ?? "undefined"} / email: ${customerEmail ?? "undefined"}`);
      return;
    }

    // Store customer ID
    if (dodoCustomerId) {
      await ctx.runMutation(internal.billing.upsertUserBilling, {
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
      status:             normStatus,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
    });

    // Update user plan based on event type
    if (type === "subscription.active" || type === "subscription.plan_changed") {
      await ctx.runMutation(internal.billing.upsertUserBilling, {
        userId,
        plan: planInterval.plan,
      });
    } else if (type === "subscription.expired") {
      await ctx.runMutation(internal.billing.upsertUserBilling, {
        userId,
        plan: "free",
      });
    } else if (type === "subscription.cancelled") {
      // If cancelled immediately (not at period end), downgrade plan now.
      // If cancelAtPeriodEnd is true, the user stays active until expiry — no change needed.
      if (!cancelAtPeriodEnd) {
        await ctx.runMutation(internal.billing.upsertUserBilling, {
          userId,
          plan: "free",
        });
      }
    } else if (type === "subscription.renewed") {
      // Keep plan active, record the renewal payment if present
      const payment = data.payment;
      if (payment?.payment_id) {
        await ctx.runMutation(internal.billing.recordPayment, {
          userId,
          dodoPaymentId:      payment.payment_id as string,
          dodoSubscriptionId,
          amount:             Math.round((payment.amount ?? 0) * 100),
          currency:           payment.currency ?? "USD",
          status:             "succeeded",
          plan:               planInterval.plan,
          interval:           planInterval.interval,
          invoiceUrl:         payment.invoice_url ?? undefined,
          paidAt:             Date.now(),
        });
      }
    }
  }

  // ── Payment events ────────────────────────────────────────────
  if (type === "payment.succeeded" || type === "payment.failed") {
    const payment = data;
    const dodoCustomerId  = payment.customer?.customer_id as string | undefined;
    const customerEmail   = payment.customer?.email as string | undefined;
    const userId = await resolveUserId(ctx, dodoCustomerId, customerEmail);
    if (!userId) {
      console.warn(`[webhook] ${type}: no user found for customerId: ${dodoCustomerId ?? "undefined"} / email: ${customerEmail ?? "undefined"} — skipping`);
      return;
    }

    const productId    = payment.product_id as string | undefined;
    const planInterval = productId ? productIdToPlanInterval(productId) : null;

    await ctx.runMutation(internal.billing.recordPayment, {
      userId,
      dodoPaymentId:      payment.payment_id as string,
      dodoSubscriptionId: payment.subscription_id ?? undefined,
      amount:             Math.round((payment.amount ?? 0) * 100),
      currency:           payment.currency ?? "USD",
      status:             type === "payment.succeeded" ? "succeeded" : "failed",
      plan:               planInterval?.plan,
      interval:           planInterval?.interval,
      invoiceUrl:         payment.invoice_url ?? undefined,
      paidAt:             Date.now(),
    });
  }
}

/**
 * Resolves a Convex userId from a Dodo customer ID, with email fallback.
 *
 * On the very first webhook after checkout, no userBilling record exists yet
 * (dodoCustomerId is only stored after the first successful webhook). So we
 * fall back to looking up the user by the email address Dodo includes in every
 * event. Once found, the caller stores the dodoCustomerId mapping so future
 * webhooks resolve by ID directly.
 */
async function resolveUserId(
  ctx: any,
  dodoCustomerId: string | undefined,
  customerEmail: string | undefined,
): Promise<Id<"users"> | null> {
  // Primary: look up by stored dodoCustomerId
  if (dodoCustomerId) {
    const billing = await ctx.runQuery(internal.billing.findUserByDodoCustomerId, {
      dodoCustomerId,
    });
    if (billing?.userId) return billing.userId;
  }

  // Fallback: look up by email (covers the first webhook after checkout)
  if (customerEmail) {
    const user = await ctx.runQuery(internal.billing.findUserByEmail, {
      email: customerEmail,
    });
    if (user?._id) {
      console.log(`[webhook] Resolved user by email fallback: ${customerEmail}`);
      return user._id;
    }
  }

  return null;
}
