"use client";

import Image from "next/image";
import logo from "@/app/logo.png";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export type ActiveTab = "reddit" | "leads" | "settings";

interface Props {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export default function Sidebar({ activeTab, onTabChange }: Props) {
  const { signOut } = useAuthActions();
  const router = useRouter();

  const LOCKED: ActiveTab[] = ["leads", "settings"];

  const navItem = (tab: ActiveTab, icon: React.ReactNode, dataTour?: string) => {
    const locked = LOCKED.includes(tab);
    return (
      <div style={{ position: "relative" }} className={locked ? "sidebar-locked" : undefined}>
        <button
          data-tour={dataTour}
          onClick={() => { if (!locked) onTabChange(tab); }}
          style={{
            width: "34px", height: "34px", border: "none",
            background: activeTab === tab ? "#DF849D" : "transparent",
            borderRadius: "12px", cursor: locked ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: locked ? "#D8CECC" : activeTab === tab ? "#fff" : "#B2A28C",
            transition: "all 0.2s ease", padding: 0,
            opacity: locked ? 0.5 : 1,
          }}
          onMouseEnter={(e) => { if (!locked && activeTab !== tab) { (e.currentTarget as HTMLElement).style.background = "#FDF7EF"; (e.currentTarget as HTMLElement).style.color = "#191918"; } }}
          onMouseLeave={(e) => { if (!locked && activeTab !== tab) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#B2A28C"; } }}
        >
          {icon}
        </button>
        {locked && (
          <div className="sidebar-tooltip">Coming soon</div>
        )}
      </div>
    );
  };

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <aside style={{
      width: "72px", height: "100%",
      background: "#ffffff",
      borderRight: "1px solid rgba(0,0,0,0.05)",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "20px 0", flexShrink: 0,
    }}>
      {/* Logo */}
      <a href="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
        <Image src={logo} alt="agentK" height={32} priority />
      </a>

      <style>{`
        .sidebar-locked { position: relative; }
        .sidebar-tooltip {
          display: none;
          position: absolute;
          left: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%);
          background: #191918;
          color: #fff;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          padding: 5px 10px;
          border-radius: 8px;
          pointer-events: none;
          z-index: 99;
          font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .sidebar-locked:hover .sidebar-tooltip { display: block; }
      `}</style>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1, alignItems: "center", justifyContent: "center" }}>
        {navItem("reddit",
          <svg role="img" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z"/>
          </svg>
        )}
        {navItem("leads",
          // Bookmark — a simple, well-understood "saved items" glyph
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        , "leads-tab")}
        {navItem("settings",
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        , "settings-tab")}
      </nav>

      {/* Logout at bottom */}
      <button
        onClick={handleSignOut}
        style={{
          width: "34px", height: "34px", border: "none",
          background: "transparent", borderRadius: "12px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#B2A28C", transition: "all 0.2s ease", padding: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#FDF7EF"; (e.currentTarget as HTMLElement).style.color = "#191918"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "#B2A28C"; }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>
    </aside>
  );
}
