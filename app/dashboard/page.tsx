"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import Sidebar, { type ActiveTab } from "@/components/dashboard/Sidebar";
import RedditFeed from "@/components/dashboard/RedditFeed";
import LeadsPanel from "@/components/dashboard/LeadsPanel";
import SettingsPanel from "@/components/dashboard/SettingsPanel";
import ProductTour from "@/components/dashboard/ProductTour";
import VerificationBadge from "@/components/dashboard/VerificationBadge";


export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("reddit");
  const router = useRouter();

  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signOut }          = useAuthActions();
  const posts                = useQuery(api.reddit.getResults);
  const currentUser          = useQuery(api.users.currentUser);
  const registerDevice       = useMutation(api.devices.registerDevice);
  const autoVerifyUser       = useMutation(api.emailVerification.autoVerifyUser);
  const requestVerification  = useMutation(api.emailVerification.requestVerificationEmail);
  const emailSentRef         = useRef(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
      return;
    }
    if (!authLoading && isAuthenticated) {
      fetch("/api/device-ip")
        .then((r) => r.json())
        .then(({ ip }: { ip: string }) =>
          registerDevice({ ip, userAgent: navigator.userAgent })
        )
        .catch((err: any) => {
          if (err?.message?.includes("DEVICE_CONFLICT")) {
            signOut().then(() => router.replace("/?blocked=1"));
          }
        });

      // Auto-verify Google / existing users; for new email users send the
      // verification email exactly once per page load.
      if (!emailSentRef.current) {
        emailSentRef.current = true;
        autoVerifyUser().then((wasAutoVerified) => {
          if (!wasAutoVerified) {
            requestVerification().catch(() => {});
          }
        });
      }
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
        <svg style={{ animation: "spin .6s linear infinite" }} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#DF849D" strokeWidth="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", width: "100%", height: "100%" }}>
      <VerificationBadge email={(currentUser as any)?.email} />
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Reddit feed */}
        <div style={{ display: activeTab === "reddit" ? "flex" : "none", flex: 1, overflow: "hidden" }}>
          <RedditFeed posts={posts ?? []} loading={posts === undefined} />
        </div>

        {/* Leads */}
        <div style={{ display: activeTab === "leads" ? "flex" : "none", flex: 1, overflow: "hidden" }}>
          <LeadsPanel />
        </div>

        {/* Settings / TG bot */}
        <div style={{ display: activeTab === "settings" ? "flex" : "none", flex: 1, overflow: "hidden", flexDirection: "column" }}>
          <SettingsPanel open={activeTab === "settings"} />
        </div>
      </main>

      {activeTab === "reddit" && <ProductTour />}
    </div>
  );
}
