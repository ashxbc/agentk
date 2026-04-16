"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useConvexAuth } from "convex/react";

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  free:  { bg: "#F0F0EE", text: "#62584F", label: "Free"  },
  pro:   { bg: "#DF849D", text: "#ffffff", label: "Pro"   },
  ultra: { bg: "#191918", text: "#ffffff", label: "Ultra" },
};

export default function PlanBadge() {
  const { isAuthenticated } = useConvexAuth();
  const billing = useQuery(api.billing.getUserPlan, isAuthenticated ? {} : "skip");

  if (!isAuthenticated || !billing) return null;

  const style = BADGE_STYLES[billing.plan] ?? BADGE_STYLES.free;

  return (
    <span
      className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
