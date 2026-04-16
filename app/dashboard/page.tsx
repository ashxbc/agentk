"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import Sidebar, { type ActiveTab } from "@/components/dashboard/Sidebar";
import RedditFeed from "@/components/dashboard/RedditFeed";
import SettingsPanel from "@/components/dashboard/SettingsPanel";


export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("reddit");
  const [loading, setLoading]     = useState(false);
  const router = useRouter();

  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const posts        = useQuery(api.reddit.getResults);
  const triggerFetch = useMutation(api.reddit.triggerFetch);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/");
    }
    if (!authLoading && isAuthenticated) {
      triggerFetch({}).catch(console.error);
    }
  }, [authLoading, isAuthenticated, router]);


  async function reload() {
    setLoading(true);
    try {
      await triggerFetch({});
    } catch {
      // silent — feed stays as-is if fetch fails
    } finally {
      setLoading(false);
    }
  }

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
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Reddit feed */}
        <div style={{ display: activeTab === "reddit" ? "flex" : "none", flex: 1, overflow: "hidden" }}>
          <RedditFeed posts={posts ?? []} loading={loading || posts === undefined} onReload={reload} />
        </div>

        {/* Settings / TG bot */}
        <div style={{ display: activeTab === "settings" ? "flex" : "none", flex: 1, overflow: "hidden", flexDirection: "column" }}>
          <SettingsPanel open={activeTab === "settings"} />
        </div>
      </main>
    </div>
  );
}
