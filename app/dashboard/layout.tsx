import type { ReactNode } from "react";

export const metadata = {
  title: "Dashboard | AgentK",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#FDF7EF", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {children}
    </div>
  );
}
