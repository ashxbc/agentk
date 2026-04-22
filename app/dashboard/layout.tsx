import type { ReactNode } from "react";

export const metadata = {
  // Root layout already wraps titles with the "%s | AgentK" template.
  // Passing the plain value here avoids the double-suffix.
  title: "Dashboard",
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#FDF7EF", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {children}
    </div>
  );
}
