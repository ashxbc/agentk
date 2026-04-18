import { proxyAuthActionToConvex } from "@convex-dev/auth/nextjs/server";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyAuthActionToConvex(request, {
    convexUrl: process.env.CONVEX_URL,
  });
}

export async function POST(request: NextRequest) {
  return proxyAuthActionToConvex(request, {
    convexUrl: process.env.CONVEX_URL,
  });
}
