import { NextRequest, NextResponse } from "next/server";
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params;

  const token = await convexAuthNextjsToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchQuery(api.users.currentUser, {}, { token });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load the user's payment history and find the matching payment
  const payments = await fetchQuery(api.billing.getBillingHistory, {}, { token });
  const payment = payments.find(
    (p) => p.dodoPaymentId === paymentId && p.userId === user._id
  );

  if (!payment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!payment.invoiceUrl) {
    return NextResponse.json({ error: "No invoice available for this payment" }, { status: 404 });
  }

  return NextResponse.redirect(payment.invoiceUrl, { status: 302 });
}
