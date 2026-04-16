import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import DodoPayments from "dodopayments";

type PlanKey = "pro_monthly" | "pro_yearly" | "ultra_monthly" | "ultra_yearly";

const VALID_PLANS: PlanKey[] = ["pro_monthly", "pro_yearly", "ultra_monthly", "ultra_yearly"];

function getPlanProductId(plan: PlanKey): string | undefined {
  const map: Record<PlanKey, string | undefined> = {
    pro_monthly:   process.env.DODO_PRO_MONTHLY_ID,
    pro_yearly:    process.env.DODO_PRO_YEARLY_ID,
    ultra_monthly: process.env.DODO_ULTRA_MONTHLY_ID,
    ultra_yearly:  process.env.DODO_ULTRA_YEARLY_ID,
  };
  return map[plan];
}

function isAllowedUrl(raw: unknown, allowedOrigin: string): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    return url.origin === allowedOrigin;
  } catch {
    return false;
  }
}

const apiKey = process.env.DODO_API_KEY ?? "";
const dodo = new DodoPayments({
  bearerToken: apiKey,
  environment: (process.env.DODO_ENVIRONMENT as "test_mode" | "live_mode") ?? "live_mode",
});

export async function POST(req: NextRequest) {
  // Auth
  const token = await convexAuthNextjsToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Derive expected origin from the incoming request
  const requestOrigin = req.headers.get("origin") ?? "";

  const body = await req.json().catch(() => null);
  const { plan, successUrl, cancelUrl } = body ?? {};

  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (!isAllowedUrl(successUrl, requestOrigin) || !isAllowedUrl(cancelUrl, requestOrigin)) {
    return NextResponse.json({ error: "Invalid redirect URL" }, { status: 400 });
  }

  const productId = getPlanProductId(plan as PlanKey);
  if (!productId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  try {
    if (!user.email) {
      return NextResponse.json({ error: "Account email required for checkout" }, { status: 400 });
    }

    // dodo.checkoutSessions.create() returns CheckoutSessionResponse:
    //   { session_id: string; checkout_url?: string | null }
    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email,
        name:  user.name  ?? user.email ?? "",
      },
      return_url: successUrl,
      cancel_url: cancelUrl,
    });

    const checkoutUrl = session.checkout_url;

    if (!checkoutUrl) {
      console.error("[checkout] Dodo response missing checkout_url:", JSON.stringify(session));
      return NextResponse.json({ error: "Failed to get checkout URL" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[checkout] Dodo error:", message);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
